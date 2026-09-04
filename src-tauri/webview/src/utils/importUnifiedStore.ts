/**
 * importUnifiedStore.ts
 *
 * t_b2eae8b0 — the canonical write path for the two import flows
 * (Bulk Import and SoapUI import) into the UNIFIED project store.
 *
 * Before this, both flows wrote the LEGACY nested model (save_project ->
 * interfaces/) and relied on the non-destructive legacy->unified migration to
 * surface them in the unified store. This module re-points the write path at
 * the canonical store directly: each nested project is flattened (nested
 * interfaces[] -> flat operations[]) by the backend's
 * `save_imported_project_as_unified`, which reuses the migration's transform,
 * merges idempotently into an existing unified project, never clobbers a
 * legacy dir, and writes the additive nested tree so PROXY/WORKFLOWS (nested-
 * model readers, out of scope to decouple) keep working.
 *
 * The in-session legacy list (useProject().projects) is a SEPARATE concern and
 * is handled by the callers: PROXY (AddToProjectDialog) and WORKFLOWS
 * (request-picker) read the nested model from that list IN THIS SESSION (they
 * do not re-load from disk on demand), so the caller still publishes the
 * nested value after the canonical unified write.
 */
import { bridge } from './bridge';

/** A nested legacy `ApinoxProject` as an import flow produces it. */
// Structurally minimal (only `name` is read; the whole object is JSON-cloned
// for the invoke), so it accepts the shared `ApinoxProject` type as well as
// plain objects parsed from the backend.
export type ImportedNestedProject = { name?: string };

/**
 * Persist a batch of imported (nested) projects into the canonical UNIFIED
 * store.
 *
 * - Each named project is sent to the `save_imported_project_as_unified`
 *   Tauri command (which flattens it and persists via `save_unified_project`).
 * - Projects without a name are skipped (a `null` is returned at that
 *   position, preserving input order).
 * - A failure on one project is logged (not thrown) and yields `null`, so one
 *   bad project never aborts the batch.
 *
 * @returns The backend's persisted project per input (in order), or `null` for
 *   skipped/failed entries.
 */
export async function saveImportedProjectsAsUnified(
    projects: ImportedNestedProject[],
): Promise<Array<Record<string, unknown> | null>> {
    const results: Array<Record<string, unknown> | null> = [];
    for (const project of projects) {
        if (!project || !project.name) {
            results.push(null);
            continue;
        }
        try {
            const saved = await bridge.invokeTauriCommand('save_imported_project_as_unified', {
                // Plain-JSON copy (mirrors the unified saveProject payload) so
                // non-serializable fields can't leak into the Tauri invoke.
                project: JSON.parse(JSON.stringify(project)),
            });
            results.push(saved && typeof saved === 'object' ? (saved as Record<string, unknown>) : null);
        } catch (e) {
            console.error('[importUnifiedStore] save_imported_project_as_unified failed:', e);
            results.push(null);
        }
    }
    return results;
}

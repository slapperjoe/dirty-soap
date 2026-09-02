import { ApiRequest, ScrapbookRequest } from "@shared/models";

/**
 * Unified scrapbook capture contract (R-03b / doc §8.3 + Q4).
 *
 * The unified capture path itself lands in Phase 2 (R-05). This module fixes
 * the *semantics* as a pure function so the decision is testable now and the
 * Phase 2 hook is forced to honour it:
 *
 *   Q4 — auto-capture = update the existing entry keyed by endpoint+operation,
 *   else append. The key prevents unbounded growth: re-running the same
 *   endpoint+operation overwrites the entry instead of adding a new one.
 *
 * This operates against the unified `selectedNode` model: a quick request is
 * addressed as `{ type: 'scrapbook', id }`, and an execution of a project
 * operation is captured under its (endpoint, operationName) key. The helper is
 * storage-agnostic (it returns a decision, it does not mutate state).
 */
export interface ScrapbookCaptureDecision {
    /**
     * 'update' — an existing scrapbook entry already carries this key; the new
     * execution overwrites it in place (no new entry, no growth).
     * 'append' — no entry matches; the execution is added as a new entry.
     */
    mode: "update" | "append";
    /** Index of the existing entry when `mode === 'update'`; undefined for 'append'. */
    index?: number;
    /** The normalized endpoint+operation key used for matching. */
    key: string;
}

/**
 * Normalized capture key. Trailing slashes are stripped and casing of the
 * endpoint is lower-cased so `http://host:8080/svc` and `http://host:8080/svc/`
 * map to the same entry. `operation` is optional (quick requests may have no
 * owning operation) and is matched case-sensitively to avoid merging distinct
 * operations.
 */
export function scrapbookCaptureKey(
    endpoint: string | undefined | null,
    operation: string | undefined | null,
): string {
    const ep = (endpoint || "")
        .trim()
        .replace(/\/+$/, "")
        .toLowerCase();
    return `${ep}::${operation || ""}`;
}

/**
 * Decide whether an execution of `request` (owned by `operationName`) should
 * update an existing scrapbook entry or append a new one, given the current
 * `requests` in the scrapbook.
 *
 * Matching is by `scrapbookCaptureKey(endpoint, name)`. The `scrapbook.json`
 * schema is FROZEN, so a `ScrapbookRequest` carries no dedicated `operation`
 * field; the entry's `name` is the operation identifier for quick requests
 * created from an operation (its name is the operation name). Thus
 * `endpoint + name` is the stable, schema-conformant capture key.
 */
export function resolveScrapbookCapture(
    requests: ScrapbookRequest[],
    request: ApiRequest,
    operationName?: string | null,
): ScrapbookCaptureDecision {
    const key = scrapbookCaptureKey(request.endpoint, operationName);
    const index = (requests || []).findIndex(r =>
        scrapbookCaptureKey(r.endpoint, r.name) === key,
    );
    if (index >= 0) {
        return { mode: "update", index, key };
    }
    return { mode: "append", key };
}

/**
 * Whether a node from the unified sidebar is a quick (scrapbook) request that
 * should drive the unified main view. Contract: `selectedNode.type ===
 * 'scrapbook'`. Kept here (not in a hook) so the routing decision is shared
 * between the sidebar selection handler and the capture path.
 */
export function isScrapbookNode(
    selectedNode: { type: string; id: string } | null | undefined,
): boolean {
    return !!selectedNode && selectedNode.type === "scrapbook";
}

/**
 * UnifiedProjectContext.tsx
 *
 * Phase B (t_86c34d38): single source of truth for the UNIFIED project store
 * (UnifiedProject[] — the flat operations model used by the Unified Explorer).
 *
 * Before Phase B the unified list lived as local state inside MainContent.
 * The TESTS view (and its request-step handlers) read test suites from the
 * LEGACY `ApinoxProject` store (useProject). Phase B relocates test suites to
 * the unified store (UnifiedProject.testSuites) and decouples TESTS off the
 * legacy model. Centralising the unified list here (above TestRunnerProvider)
 * lets the TESTS hooks and TestsUi read/update suites from one place while
 * MainContent continues to render the unified explorer from the same state.
 */

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { UnifiedProject } from '@shared/models';
import { bridge, isTauri } from '../utils/bridge';

interface UnifiedProjectContextValue {
    /** All unified projects (the unified explorer + the relocated test suites). */
    projects: UnifiedProject[];
    setProjects: React.Dispatch<React.SetStateAction<UnifiedProject[]>>;

    /** Load the unified project list from the backend (list_unified_projects). */
    refresh: () => Promise<void>;

    /**
     * Persist a (possibly mutated) unified project in place via
     * `save_unified_project`. The full project object (operations, testSuites,
     * folders) is sent; the backend writes the flat layout + tests/ + folders/.
     */
    saveProject: (project: UnifiedProject) => Promise<void>;

    /**
     * Convenience: mutate a project by name (functional updater) and persist
     * the result. Mirrors the legacy `updateProject` helper.
     */
    updateProject: (name: string, updater: (p: UnifiedProject) => UnifiedProject) => Promise<void>;

    /** Find a test suite by id across all unified projects (Phase B: TESTS suite source). */
    findSuiteById: (suiteId: string) => { suite: import('@shared/models').TestSuite; project: UnifiedProject } | null;

    /** Find a test case by id across all unified projects, with its parent suite. */
    findCaseById: (caseId: string) => { case: import('@shared/models').TestCase; suite: import('@shared/models').TestSuite; project: UnifiedProject } | null;
}

const UnifiedProjectContext = createContext<UnifiedProjectContextValue | undefined>(undefined);

export function useUnifiedProjects(): UnifiedProjectContextValue {
    const ctx = useContext(UnifiedProjectContext);
    if (!ctx) {
        throw new Error('useUnifiedProjects must be used within a UnifiedProjectProvider');
    }
    return ctx;
}

export function UnifiedProjectProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<UnifiedProject[]>([]);

    const refresh = useCallback(async () => {
        if (!isTauri()) return;
        try {
            const data: any = await bridge.invokeTauriCommand('list_unified_projects');
            setProjects(Array.isArray(data) ? data : []);
        } catch (e) {
            console.error('[UnifiedProjectContext] Failed to load unified projects:', e);
        }
    }, []);

    const saveProject = useCallback(async (project: UnifiedProject) => {
        // Send a plain-JSON copy (Date fields → ISO strings) so the backend
        // round-trips cleanly, matching MainContent's existing save calls.
        const payload = JSON.parse(JSON.stringify(project));
        try {
            await bridge.invokeTauriCommand('save_unified_project', {
                dirPath: project.name,
                project: payload,
            });
            // Persisted — clear the dirty flag so the auto-save doesn't re-save
            // (mirrors the legacy ProjectContext saveProject dirty lifecycle).
            setProjects(prev => prev.map(p => (p.name === project.name ? { ...p, ...project, dirty: false } : p)));
        } catch (e) {
            console.error('[UnifiedProjectContext] save_unified_project failed:', e);
            throw e;
        }
    }, []);

    const updateProject = useCallback(async (name: string, updater: (p: UnifiedProject) => UnifiedProject) => {
        const current = projects.find(p => p.name === name);
        if (!current) return;
        const updated = updater(current);
        setProjects(prev => prev.map(p => (p.name === name ? updated : p)));
        await saveProject(updated);
    }, [projects, saveProject]);

    // Load on mount. Phase B (t_86c34d38): idempotently migrate any legacy
    // APInox-v1 project dirs to the unified format FIRST, so the unified store
    // (the single source of truth post-"abandon legacy") includes formerly-legacy
    // projects — and their test suites (shared `tests/` subdir) — before the app
    // reads them. Migration is non-destructive (keeps the legacy interfaces/ tree
    // so PROXY/WORKFLOWS keep working) and idempotent (skips already-unified
    // dirs), so re-running on every launch is a cheap no-op for migrated projects.
    React.useEffect(() => {
        (async () => {
            if (isTauri()) {
                try {
                    await bridge.invokeTauriCommand('migrate_legacy_projects');
                } catch (e) {
                    // Migration failure is non-fatal: legacy dirs simply stay
                    // legacy (still readable via the legacy store).
                    console.warn('[UnifiedProjectContext] migrate_legacy_projects failed (continuing):', e);
                }
            }
            await refresh();
        })();
    }, [refresh]);

    // -------------------------------------------------------------------------
    // AUTO-SAVE (Phase B, t_86c34d38)
    // The TESTS view now edits suites on the UNIFIED store. Persist dirty unified
    // projects (mirrors the legacy ProjectContext auto-save), debounced 1s.
    // save_unified_project writes tests/ + folders/ + operations — the unified
    // store is the canonical writer for migrated projects.
    // -------------------------------------------------------------------------
    React.useEffect(() => {
        const dirtyProjects = projects.filter(p => p.dirty && !p.readOnly && p.name !== 'Samples');
        if (dirtyProjects.length === 0) return;
        const timer = setTimeout(() => {
            dirtyProjects.forEach(p => {
                saveProject(p).catch(() => { /* logged in saveProject */ });
            });
        }, 1000); // 1s debounce
        return () => clearTimeout(timer);
    }, [projects, saveProject]);

    // -------------------------------------------------------------------------
    // SUITE LOOKUP HELPERS (Phase B, t_86c34d38)
    // The TESTS subsystem looked suites up in the legacy ApinoxProject[] (via
    // useProject). Post-decoupling it looks them up here (the unified store).
    // Shared by useTestCaseHandlers / useWorkspaceCallbacks / MainContent so the
    // find logic lives in one place.
    // -------------------------------------------------------------------------
    /** Find a test suite by id across all unified projects. */
    const findSuiteById = useCallback((suiteId: string): { suite: import('@shared/models').TestSuite; project: UnifiedProject } | null => {
        for (const project of projects) {
            const suite = project.testSuites?.find(s => s.id === suiteId);
            if (suite) return { suite, project };
        }
        return null;
    }, [projects]);

    /** Find a test case by id across all unified projects (with its parent suite). */
    const findCaseById = useCallback((caseId: string): { case: import('@shared/models').TestCase; suite: import('@shared/models').TestSuite; project: UnifiedProject } | null => {
        for (const project of projects) {
            for (const suite of project.testSuites || []) {
                const tc = suite.testCases?.find(c => c.id === caseId);
                if (tc) return { case: tc, suite, project };
            }
        }
        return null;
    }, [projects]);

    return (
        <UnifiedProjectContext.Provider value={{ projects, setProjects, refresh, saveProject, updateProject, findSuiteById, findCaseById }}>
            {children}
        </UnifiedProjectContext.Provider>
    );
}

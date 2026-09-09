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
 *
 * t_aafaf92b — BACKGROUND LOADER (contract:
 * docs/FIRST_START_EXPLORER_LOADING_CONTRACT.md §3/§4)
 *
 * First start no longer performs the synchronous bulk load that froze the UI
 * (the old sync `list_unified_projects` ran inline on Tauri's main thread and
 * fully loaded every project — fullSchema + request bodies — as one 31 MB IPC
 * payload). Instead:
 *
 *   mount
 *    ├─ startUnifiedLoad()
 *    │    ├─ phase: idle → loading (loaded=0, total=0)
 *    │    ├─ invoke list_unified_projects_skeleton  // fast (~KB), off-main
 *    │    │    └─ projects populated with SKELETON entries (names only),
 *    │    │       phase → ready(loaded=total=n, errors=[])
 *    │    ├─ (background, NON-BLOCKING) migrate_legacy_projects
 *    │    │    └─ if it migrated anything → unified-load-refresh → re-snapshot
 *    │    └─ on unified-load-progress/project/done → merge, advance progress
 *    ├─ openProject(name)  (ensureProjectFull)
 *    │    └─ if !fullRef.has(name) && no pending load:
 *    │         invoke load_unified_project_detail(name) → cache → replace
 *    │         the skeleton entry in place (no-op if the project is already
 *    │         full — dedupe: an event arrival and a direct fetch never
 *    │         double-load the same project)
 *
 * Rules (contract §3.3): no `await` chain on the startup-critical path; every
 * `setProjects` is incremental (replace ONE project, never a bulk 30 MB
 * swap); dedupe by project name so nothing is skipped or loaded twice.
 * The sidebar reads `useUnifiedProjects().load` — the single source of truth
 * for the loading state (idle | loading(loaded,total,current) |
 * ready(loaded,total,errors[]) | error(message)) — and must not couple to the
 * worker/IPC implementation.
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { UnifiedProject, UnifiedProjectSkeleton, ExplorerLoadState, ExplorerLoadError } from '@shared/models';
import { BackendCommand } from '@shared/messages';
import { bridge, isTauri } from '../utils/bridge';

interface UnifiedProjectContextValue {
    /**
     * All unified projects (the unified explorer + the relocated test suites).
     * t_aafaf92b: entries may transiently be SKELETON-shape (name tree only,
     * `fullSchema`/request bodies absent) until `ensureProjectFull` upgrades
     * them. Consumers that need operation/request data must route through
     * `ensureProjectFull` first (the explorer pane does).
     */
    projects: UnifiedProject[];
    setProjects: React.Dispatch<React.SetStateAction<UnifiedProject[]>>;

    /**
     * The unified explorer's selected tree node (project/operation/request).
     * Lifted here (Phase B, t_86c34d38) so the search deep-link
     * (SearchContext) can drive unified-explorer selection — previously it was
     * MainContent-local state unreachable from search.
     */
    selectedNode: { type: string; id: string } | null;
    setSelectedNode: React.Dispatch<React.SetStateAction<{ type: string; id: string } | null>>;

    /**
     * Sidebar loading-state contract (t_aafaf92b — contract §4). Single
     * source of truth for the unified explorer's first-paint loading:
     * idle → loading(loaded, total) → ready(loaded, total, errors[]).
     * `error` is fatal only (e.g. projects dir unreadable); per-project
     * failures land in `ready.errors`. The UI renders off this state and
     * never couples to the worker/IPC implementation.
     */
    load: ExplorerLoadState;

    /** Load the unified project list from the backend (list_unified_projects). */
    refresh: () => Promise<void>;

    /**
     * Upgrade one project from its skeleton to full detail ON DEMAND
     * (t_aafaf92b — contract §3.3 `openProject`). Resolves when the project in
     * state carries fullSchema + request bodies (immediately if already full
     * or a load is in flight). Call before reading operations/requests.
     * Idempotent + deduped by project name — never double-loads.
     */
    ensureProjectFull: (name: string) => Promise<void>;

    /**
     * Persist a (possibly mutated) unified project in place via
     * `save_unified_project`. The full project object (operations, testSuites,
     * folders) is sent; the backend writes the flat layout + tests/ + folders/.
     * t_aafaf92b: ensures full detail first — a skeleton must never be
     * persisted (it would drop fullSchema/bodies from disk).
     */
    saveProject: (project: UnifiedProject) => Promise<void>;

    /**
     * Convenience: mutate a project by name (functional updater) and persist
     * the result. Mirrors the legacy `updateProject` helper.
     * t_aafaf92b: ensures full detail before applying the updater.
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

/**
 * Safe variant for components that may be rendered outside the provider
 * (e.g. in isolated unit tests). Returns a no-op default load state
 * when no provider is present, so the component renders gracefully.
 */
export function useUnifiedProjectsSafe(): UnifiedProjectContextValue {
    const ctx = useContext(UnifiedProjectContext);
    if (!ctx) {
        return {
            projects: [],
            setProjects: () => {},
            selectedNode: null,
            setSelectedNode: () => {},
            load: { phase: 'idle' },
            refresh: async () => {},
            ensureProjectFull: async () => {},
            saveProject: async () => {},
            updateProject: async () => {},
            findSuiteById: () => null,
            findCaseById: () => null,
        } as unknown as UnifiedProjectContextValue;
    }
    return ctx;
}

/** True for a project already carrying full detail (fullSchema + non-empty
 *  request bodies). Skeleton rows carry placeholder EMPTY bodies (and no
 *  fullSchema), so they are NOT full — the check must be content-based, not
 *  presence-based (`'' !== null` would misclassify skeletons as full). */
function isFullProject(p: UnifiedProject | undefined | null): boolean {
    if (!p || !Array.isArray(p.operations)) return false;
    return p.operations.some(
        op => op.fullSchema != null
            || (Array.isArray(op.requests) && op.requests.some(
                r => typeof r.request === 'string' && r.request.length > 0,
            )),
    );
}

export function UnifiedProjectProvider({ children }: { children: ReactNode }) {
    const [projects, setProjects] = useState<UnifiedProject[]>([]);
    // Phase B (t_86c34d38): unified-explorer node selection lives here (was
    // MainContent-local) so search results can select into the unified tree.
    const [selectedNode, setSelectedNode] = useState<{ type: string; id: string } | null>(null);

    // ── t_aafaf92b: background loader state ─────────────────────────────────
    /** Contract §4 state machine: idle | loading | ready | error. */
    const [load, setLoad] = useState<ExplorerLoadState>({ phase: 'idle' });
    /** Latest `projects` for use inside async callbacks after `await`
     *  (closures capture the render-era value; this ref tracks the newest). */
    const projectsRef = useRef<UnifiedProject[]>(projects);
    projectsRef.current = projects;
    /** True once a load cycle has reached a terminal phase (ready/error).
     *  Guards the one-shot event listeners against a second mount cycle
     *  (StrictMode double-invoke) firing on a stale subscription. */
    const loadCycleRef = useRef(0);
    /** Projects with full detail (fullSchema + request bodies) in state. */
    const fullRef = useRef<Set<string>>(new Set());
    /** In-flight detail loads, keyed by project name — the dedupe set
     *  (contract §3.3): an event-driven arrival and a direct fetch never
     *  double-load the same project. */
    const pendingRef = useRef<Set<string>>(new Set());

    /** Replace one project in state by name (incremental — never a bulk swap). */
    const replaceProject = useCallback((name: string, project: UnifiedProject) => {
        setProjects(prev => {
            const idx = prev.findIndex(p => p.name === name);
            if (idx === -1) return [...prev, project];
            const next = prev.slice();
            next[idx] = project;
            return next;
        });
    }, []);

    // ── On-demand detail load (contract §3.3 `openProject`) ─────────────────
    /**
     * Upgrade `name` from skeleton to full detail. Resolves immediately when
     * the project is already full (or a load is in flight — dedupe,
     * acceptance criterion "no interface is loaded twice"). Never throws for
     * a missing project (it resolves no-op) so selection flows stay robust.
     */
    const ensureProjectFull = useCallback(async (name: string) => {
        if (!isTauri()) return;
        if (fullRef.current.has(name)) return;
        if (pendingRef.current.has(name)) return;
        pendingRef.current.add(name);
        try {
            const detail = await bridge.invokeTauriCommand('load_unified_project_detail', {
                dirPath: name,
            });
            if (detail && detail.name) {
                fullRef.current.add(detail.name);
                replaceProject(detail.name, detail);
            }
        } catch (e) {
            console.error(`[UnifiedProjectContext] load_unified_project_detail failed for '${name}':`, e);
        } finally {
            pendingRef.current.delete(name);
        }
    }, [replaceProject]);

    // ── Startup load (contract §3.1.4 / §3.3) ───────────────────────────────
    const startUnifiedLoad = useCallback(async () => {
        if (!isTauri()) return;
        const cycle = ++loadCycleRef.current;
        const inCycle = () => loadCycleRef.current === cycle;

        // Migration must NOT gate the list (contract §3.1.4): it runs
        // concurrently in the background (async — off the main thread) and,
        // when it migrated anything, tells the context to re-snapshot the
        // skeleton so migrated projects appear without a second manual reload.
        bridge.invokeTauriCommand('migrate_legacy_projects').then((migrated: any) => {
            if (!inCycle()) return;
            const anyMigrated = Array.isArray(migrated) && migrated.length > 0;
            if (anyMigrated) {
                // Emit unified-load-refresh → the listener below re-snapshots
                // the skeleton (migrated projects join the tree).
                bridge.emit({ command: BackendCommand.UnifiedLoadRefresh, reason: 'migration' } as any);
            }
        }).catch((e) => {
            // Migration failure is non-fatal: legacy dirs simply stay legacy
            // (still readable via the legacy store).
            console.warn('[UnifiedProjectContext] migrate_legacy_projects failed (continuing):', e);
        });

        // Phase: idle → loading. Total is unknown until the skeleton returns
        // (the indicator omits the counter while total === 0 — contract §4).
        setLoad({ phase: 'loading', loaded: 0, total: 0 });
        try {
            // FAST first-paint path: skeleton only (names — ~0.5% of the old
            // payload). Runs on the tokio runtime (async command), so even a
            // large store does not block the main thread.
            const skeletons: any = await bridge.invokeTauriCommand('list_unified_projects_skeleton');
            if (!inCycle()) return;
            const list: UnifiedProjectSkeleton[] = Array.isArray(skeletons) ? skeletons : [];
            // Convert skeletons to skeleton-shape UnifiedProjects (names +
            // placeholder requests with empty bodies). `source` falls back to
            // 'wsdl' for old dirs. The request ROWS (names) come from the
            // skeleton's `requestNames` — the sidebar tree renders them
            // immediately; the bodies (and full op metadata) arrive when the
            // project is opened (ensureProjectFull → detail load).
            const skeletonProjects: UnifiedProject[] = list.map(s => ({
                ...s,
                source: (s.source as UnifiedProject['source']) || 'wsdl',
                // The skeleton carries ISO strings (IPC shape); the unified
                // store uses Date — normalize before it enters React state.
                parsedAt: s.parsedAt ? new Date(s.parsedAt) : (new Date() as unknown as Date),
                lastRefreshedAt: s.lastRefreshedAt ? new Date(s.lastRefreshedAt) : undefined,
                operations: (s.operations || []).map(op => ({
                    name: op.name,
                    action: '',
                    displayName: op.displayName,
                    requests: (op.requestNames || []).map(rn => ({
                        name: rn.name,
                        request: '',
                    })),
                })),
            }));
            setProjects(skeletonProjects);
            fullRef.current = new Set();
            pendingRef.current.clear();
            setLoad({ phase: 'ready', loaded: list.length, total: list.length, errors: [] });
        } catch (e) {
            if (!inCycle()) return;
            // Fatal: the projects dir is unreadable (or IPC is down).
            console.error('[UnifiedProjectContext] Failed to load unified projects:', e);
            setLoad({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
        }
    }, []);

    // ── Event listeners (contract §3.2 — a dedicated in-provider hook; keeps
    //    useMessageHandler untouched). The current loader resolves the
    //    skeleton+detail synchronously, so these are the incremental-arrival
    //    hooks: if a background worker starts streaming unified-load-* events
    //    (unified-load-progress / -project / -done / -refresh), the tree
    //    merges them without any UI-side change (deduped by name).
    //
    // NOTE: no captured-cycle guard here — the listener is (re)registered per
    // mount, and unmounting is the liveness guard. A cycle guard captured at
    // setup would be stale by the time the mount effect bumps loadCycleRef.
    // Stale-cycle races for the migration→refresh path are handled inside
    // startUnifiedLoad's own inCycle checks.
    React.useEffect(() => {
        if (!isTauri()) return;

        const off = bridge.onMessage((msg: any) => {
            if (!msg) return;
            switch (msg.command) {
                case BackendCommand.UnifiedLoadProgress: {
                    const loaded = typeof msg.loaded === 'number' ? msg.loaded : 0;
                    const total = typeof msg.total === 'number' ? msg.total : 0;
                    setLoad(prev => (prev.phase === 'loading' || prev.phase === 'idle')
                        ? { phase: 'loading', loaded, total, current: msg.name }
                        : prev);
                    break;
                }
                case BackendCommand.UnifiedLoadProject: {
                    const p: UnifiedProject | undefined = msg.project;
                    if (!p || !p.name) break;
                    // Dedupe by name (contract §3.3): a streamed arrival
                    // replaces whatever is in state for that name — and an
                    // in-flight detail load is superseded (its replace is
                    // idempotent on name), so nothing loads twice.
                    if (isFullProject(p)) fullRef.current.add(p.name);
                    pendingRef.current.delete(p.name);
                    replaceProject(p.name, p);
                    setLoad(prev => (prev.phase === 'ready'
                        ? { ...prev, loaded: prev.loaded + 1, total: Math.max(prev.total, prev.loaded) }
                        : prev));
                    break;
                }
                case BackendCommand.UnifiedLoadDone: {
                    const errors: ExplorerLoadError[] = Array.isArray(msg.errors) ? msg.errors : [];
                    const total = typeof msg.total === 'number' ? msg.total : 0;
                    setLoad(prev => ({
                        phase: 'ready',
                        loaded: total || (prev.phase === 'ready' ? prev.loaded : 0),
                        total: total || (prev.phase === 'ready' ? prev.total : 0),
                        errors,
                    }));
                    break;
                }
                case BackendCommand.UnifiedLoadRefresh: {
                    // Migrated/external change landed — re-snapshot the
                    // skeleton (cheap; keeps fullRef honest via reset in
                    // startUnifiedLoad's ready phase).
                    void startUnifiedLoad();
                    break;
                }
                default:
                    break;
            }
        });

        return () => off();
    }, [startUnifiedLoad, replaceProject]);

    // Load on mount (t_aafaf92b: skeleton first paint + background migration
    // — replaces the old sequential await migrate → await full list that
    // blocked the UI on first start).
    React.useEffect(() => {
        if (!isTauri()) return;
        void startUnifiedLoad();
    }, [startUnifiedLoad]);

    // t_aafaf92b: on-demand detail load (contract §3.3 `openProject`). When an
    // operation or request node is selected — via the sidebar, a search
    // deep-link, or a run flow — make sure that project's FULL detail
    // (fullSchema + request bodies) is in state: the editor pane resolves the
    // node from `projects` and re-renders the moment the detail lands (the
    // sidebar keeps showing its skeleton rows meanwhile — contract §4.5).
    // No-op when the project is already full or a load is in flight (dedupe).
    React.useEffect(() => {
        if (!selectedNode || (selectedNode.type !== 'operation' && selectedNode.type !== 'request')) return;
        for (const project of projects) {
            for (const op of project.operations || []) {
                const opId = op.id || op.name;
                if (selectedNode.type === 'operation' && opId === selectedNode.id) {
                    if (!isFullProject(project)) void ensureProjectFull(project.name);
                    return;
                }
                for (const req of op.requests || []) {
                    if ((req.id || req.name) === selectedNode.id) {
                        if (!isFullProject(project)) void ensureProjectFull(project.name);
                        return;
                    }
                }
            }
        }
    }, [selectedNode, projects, ensureProjectFull]);

    /**
     * Load the unified project list from the backend (list_unified_projects).
     * t_aafaf92b: the FULL list (fallback/refresh path — imports, WSDL loads
     * and the error-state Retry call this). Runs async (off the main thread);
     * replaces the whole list atomically and marks everything full.
     */
    const refresh = useCallback(async () => {
        if (!isTauri()) return;
        loadCycleRef.current += 1; // invalidate in-flight event cycles
        setLoad({ phase: 'loading', loaded: 0, total: 0 });
        try {
            const data: any = await bridge.invokeTauriCommand('list_unified_projects');
            const list: UnifiedProject[] = Array.isArray(data) ? data : [];
            setProjects(list);
            fullRef.current = new Set(list.filter(p => isFullProject(p)).map(p => p.name));
            pendingRef.current.clear();
            setLoad({ phase: 'ready', loaded: list.length, total: list.length, errors: [] });
        } catch (e) {
            console.error('[UnifiedProjectContext] Failed to load unified projects:', e);
            setLoad({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
        }
    }, []);

    const saveProject = useCallback(async (project: UnifiedProject) => {
        // t_aafaf92b: never persist a skeleton (it would drop fullSchema +
        // request bodies from disk). Upgrade to full detail first.
        if (!isFullProject(project)) {
            await ensureProjectFull(project.name);
        }
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
    }, [ensureProjectFull]);

    const updateProject = useCallback(async (name: string, updater: (p: UnifiedProject) => UnifiedProject) => {
        const current = projectsRef.current.find(p => p.name === name);
        if (!current) return;
        // t_aafaf92b: the updater must operate on FULL detail (test suites,
        // operations, request bodies) — upgrade the skeleton first, then read
        // the FRESH state (projectsRef) so the updater never sees the stale
        // skeleton the closure captured.
        if (!isFullProject(current)) {
            await ensureProjectFull(name);
        }
        const latest = projectsRef.current.find(p => p.name === name) ?? current;
        const updated = updater(latest);
        setProjects(prev => prev.map(p => (p.name === name ? updated : p)));
        await saveProject(updated);
    }, [ensureProjectFull, saveProject]);

    // -------------------------------------------------------------------------
    // AUTO-SAVE (Phase B, t_86c34d38)
    // The TESTS view now edits suites on the UNIFIED store. Persist dirty
    // unified projects (mirrors the legacy ProjectContext auto-save),
    // debounced 1s. save_unified_project writes tests/ + folders/ +
    // operations — the unified store is the canonical writer for migrated
    // projects. (t_aafaf92b: saveProject now guards fullness internally, so a
    // dirty skeleton can no longer be persisted half-shape.)
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
    //
    // t_aafaf92b: suites live on the FULL shape (testSuites is stripped from
    // skeletons). If a project is still skeleton-shape when looked up, the
    // caller gets null today — the TESTS view renders after first paint, at
    // which point any project the user can see and click is already full via
    // ensureProjectFull (explorer pane) or refresh (full path).
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
        <UnifiedProjectContext.Provider value={{ projects, setProjects, selectedNode, setSelectedNode, load, refresh, ensureProjectFull, saveProject, updateProject, findSuiteById, findCaseById }}>
            {children}
        </UnifiedProjectContext.Provider>
    );
}

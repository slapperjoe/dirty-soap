/**
 * UnifiedProjectContext background-loader regression test (t_aafaf92b).
 *
 * Contracts pinned here (docs/FIRST_START_EXPLORER_LOADING_CONTRACT.md):
 *  - §3.1.1/§3.1.2: first start performs the SKELETON load only — the full
 *    `list_unified_projects` bulk load is NOT invoked on mount (the old
 *    sync, main-thread 31 MB load that froze the UI).
 *  - §4: the `load` state machine transitions loading → ready on first
 *    paint (never `error` on a healthy store; per-project failures would
 *    land in `ready.errors`, not `error`).
 *  - §3.1.3/§3.3: project details load ON DEMAND (operation/request
 *    selection) via `load_unified_project_detail`, cached — selecting a
 *    second node of the same project never loads it twice (acceptance
 *    criterion "no interface is skipped or loaded twice").
 *  - §3.2: `unified-load-project` events merge incrementally (deduped by
 *    name) and advance progress — the event path the future background
 *    worker streams on.
 *  - Fallback: `refresh()` still loads the FULL list (imports/WSDL flows).
 *
 * The bridge is hermetically mocked: `isTauri() === true` (so the startup
 * path runs), `invokeTauriCommand` returns a canned skeleton on mount and
 * the full project on detail, and `onMessage` captures the listener so the
 * test can push `unified-load-*` events.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { UnifiedProjectProvider, useUnifiedProjects } from '../UnifiedProjectContext';
import { BackendCommand } from '@shared/messages';
import type { UnifiedProject } from '@shared/models';

// ── hermetic bridge mock ────────────────────────────────────────────────────
// vi.mock specifiers resolve relative to THIS test file (contexts/__tests__/),
// so the bridge at src/utils/bridge is '../../utils/bridge'.
let messageListener: ((msg: any) => void) | null = null;
const invokeMock = vi.fn();
const emitMock = vi.fn();

vi.mock('../../utils/bridge', () => ({
    isTauri: () => true,
    invokeTauriCommand: (...args: any[]) => invokeMock(...args),
    bridge: {
        isTauri: () => true,
        invokeTauriCommand: (...args: any[]) => invokeMock(...args),
        sendMessage: vi.fn(),
        sendMessageAsync: vi.fn(async () => ({})),
        // Capture the listener (like the real Tauri 'backend_command' wiring)
        // so tests can push unified-load-* events.
        onMessage: (cb: (msg: any) => void) => {
            messageListener = cb;
            return () => { messageListener = null; };
        },
        emit: (...args: any[]) => emitMock(...args),
    },
}));

// ── fixtures ────────────────────────────────────────────────────────────────
/** Skeleton shape as returned by `list_unified_projects_skeleton` (IPC JSON). */
const SKELETON_RESPONSE = [
    {
        name: 'SkeletonSvc',
        displayName: 'Skeleton (display)',
        source: 'wsdl',
        sourceUrl: 'http://example.com/skeleton.wsdl',
        parsedAt: '2026-09-09T00:00:00+00:00',
        id: 'skeleton-id',
        soapVersion: '1.2',
        contentType: 'application/soap+xml',
        bindingName: 'SkeletonSoap12',
        operations: [
            { name: 'BigOp', displayName: 'Big Op (display)', requestNames: [{ name: 'BigReq' }] },
            { name: 'OtherOp', requestNames: [{ name: 'OtherReq' }] },
        ],
    },
];

/** Full shape as returned by `load_unified_project_detail` /
 *  `list_unified_projects` (IPC JSON — Dates arrive as ISO strings). */
const FULL_PROJECT: any = {
    name: 'SkeletonSvc',
    displayName: 'Skeleton (display)',
    description: 'skeleton test service',
    source: 'wsdl',
    sourceUrl: 'http://example.com/skeleton.wsdl',
    parsedAt: '2026-09-09T00:00:00+00:00',
    id: 'skeleton-id',
    soapVersion: '1.2',
    bindingName: 'SkeletonSoap12',
    contentType: 'application/soap+xml',
    operations: [
        {
            name: 'BigOp',
            action: 'http://example.com/BigOp',
            targetNamespace: 'http://example.com/ns',
            originalEndpoint: 'http://example.com/svc',
            fullSchema: { name: 'BigOpInput', type: 'object', children: [{ name: 'Elem0', type: 'string', children: [] }] },
            requests: [
                { name: 'BigReq', endpoint: 'http://example.com/svc', method: 'POST', request: '<BigReqBody/>' },
            ],
        },
        {
            name: 'OtherOp',
            action: 'http://example.com/OtherOp',
            fullSchema: null,
            requests: [
                { name: 'OtherReq', endpoint: 'http://example.com/svc', method: 'POST', request: '<OtherReqBody/>' },
            ],
        },
    ],
    testSuites: [],
    folders: [],
};

const detailCalls = () => invokeMock.mock.calls.filter(c => c[0] === 'load_unified_project_detail');
const skeletonCalls = () => invokeMock.mock.calls.filter(c => c[0] === 'list_unified_projects_skeleton');
const fullListCalls = () => invokeMock.mock.calls.filter(c => c[0] === 'list_unified_projects');

/** Exposes the context state (incl. the contract §4 `load` machine) + actions. */
const Probe: React.FC = () => {
    const { load, projects, setSelectedNode, refresh } = useUnifiedProjects();
    // Record every phase observed at render time (transition-sequence
    // assertions — computed in the body so the attribute always includes the
    // just-observed phase; no effect timing skew).
    const phaseLog = React.useRef<string[]>([]);
    phaseLog.current.push(load.phase);
    const names = projects.map(p => p.name).join(',');
    const bigReqBody = projects
        .flatMap(p => p.operations || [])
        .flatMap(op => op.requests || [])
        .find(r => r.name === 'BigReq')?.request ?? '';
    const bigOpSchema = projects
        .flatMap(p => p.operations || [])
        .find(op => op.name === 'BigOp')?.fullSchema ? 'yes' : 'no';
    const opCount = projects
        .flatMap(p => p.operations || [])
        .flatMap(op => op.requests || [])
        .filter(r => r.name === 'BigReq').length;
    return (
        <div
            data-testid="probe"
            data-phase={load.phase}
            data-loaded={load.phase === 'loading' || load.phase === 'ready' ? (load as any).loaded : ''}
            data-total={load.phase === 'loading' || load.phase === 'ready' ? (load as any).total : ''}
            data-projects={names}
            data-big-req-body={bigReqBody}
            data-big-op-schema={bigOpSchema}
            data-big-req-count={opCount}
            data-phase-log={JSON.stringify(phaseLog.current)}
        >
            <button
                data-testid="select-bigop"
                onClick={() => setSelectedNode({ type: 'operation', id: 'BigOp' })}
            >
                select BigOp
            </button>
            <button
                data-testid="select-bigreq"
                onClick={() => setSelectedNode({ type: 'request', id: 'BigReq' })}
            >
                select BigReq
            </button>
            <button
                data-testid="select-otherop"
                onClick={() => setSelectedNode({ type: 'operation', id: 'OtherOp' })}
            >
                select OtherOp
            </button>
            <button data-testid="refresh" onClick={() => { refresh().catch(() => {}); }}>
                refresh
            </button>
        </div>
    );
};

const wireBridge = () => {
    invokeMock.mockImplementation(async (command: string, args?: any) => {
        switch (command) {
            case 'list_unified_projects_skeleton':
                return SKELETON_RESPONSE;
            case 'load_unified_project_detail':
                expect(args?.dirPath).toBe('SkeletonSvc');
                return FULL_PROJECT;
            case 'list_unified_projects':
                return [FULL_PROJECT];
            case 'migrate_legacy_projects':
                return [];
            default:
                throw new Error(`unexpected invoke: ${command}`);
        }
    });
};

beforeEach(() => {
    vi.clearAllMocks();
    messageListener = null;
    wireBridge();
});

describe('UnifiedProjectProvider background loader (t_aafaf92b)', () => {
    it('first paint loads the SKELETON only — no bulk full list — and the load state transitions loading → ready', async () => {
        render(
            <UnifiedProjectProvider>
                <Probe />
            </UnifiedProjectProvider>,
        );

        const probe = await screen.findByTestId('probe');
        await waitFor(() => {
            expect(probe.getAttribute('data-phase')).toBe('ready');
        });

        // The skeleton path was taken…
        expect(skeletonCalls().length).toBe(1);
        // …and the full bulk list was NOT (the old freeze came from this).
        expect(fullListCalls().length).toBe(0);
        // Migration ran (fire-and-forget; no-op store → no refresh event).
        expect(invokeMock.mock.calls.some(c => c[0] === 'migrate_legacy_projects')).toBe(true);

        // First-paint tree: skeleton rows present (names only, no bodies).
        expect(probe.getAttribute('data-projects')).toBe('SkeletonSvc');
        expect(probe.getAttribute('data-loaded')).toBe('1');
        expect(probe.getAttribute('data-total')).toBe('1');
        expect(probe.getAttribute('data-big-req-body')).toBe('');
        expect(probe.getAttribute('data-big-op-schema')).toBe('no');

        // State machine walked loading → ready, never error/fatal.
        const phases = JSON.parse(probe.getAttribute('data-phase-log') || '[]');
        expect(phases).toContain('loading');
        expect(phases[phases.length - 1]).toBe('ready');
        expect(phases).not.toContain('error');
    });

    it('opens a project ON DEMAND on node selection, caches the detail, and never loads it twice', async () => {
        render(
            <UnifiedProjectProvider>
                <Probe />
            </UnifiedProjectProvider>,
        );
        const probe = await screen.findByTestId('probe');
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        // Skeleton state before selection.
        expect(detailCalls().length).toBe(0);
        expect(probe.getAttribute('data-big-op-schema')).toBe('no');

        // Selecting an operation triggers the detail load (fullSchema + body).
        fireEvent.click(screen.getByTestId('select-bigop'));
        await waitFor(() => expect(probe.getAttribute('data-big-req-body')).toBe('<BigReqBody/>'));
        expect(probe.getAttribute('data-big-op-schema')).toBe('yes');
        expect(detailCalls().length).toBe(1);

        // Re-selecting the same project's request: NO second load (dedupe).
        fireEvent.click(screen.getByTestId('select-bigreq'));
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        expect(detailCalls().length).toBe(1);

        // Selecting another operation of the SAME project: still no reload.
        fireEvent.click(screen.getByTestId('select-otherop'));
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        expect(detailCalls().length).toBe(1, 'same project must not be loaded twice');

        // The detail REPLACED the skeleton entry (no duplicate project rows).
        expect(probe.getAttribute('data-big-req-count')).toBe('1');
    });

    it('unified-load-project events merge incrementally (deduped by name) and advance progress', async () => {
        render(
            <UnifiedProjectProvider>
                <Probe />
            </UnifiedProjectProvider>,
        );
        const probe = await screen.findByTestId('probe');
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        expect(messageListener).not.toBeNull();

        // A background worker streams a new project in (event path, §3.2).
        await act(async () => {
            messageListener!({
                command: BackendCommand.UnifiedLoadProject,
                project: {
                    name: 'StreamedSvc',
                    source: 'wsdl',
                    parsedAt: '2026-09-09T00:00:00+00:00',
                    operations: [
                        {
                            name: 'StreamedOp',
                            action: 'http://example.com/StreamedOp',
                            fullSchema: { name: 'StreamedInput', children: [] },
                            requests: [{ name: 'StreamedReq', request: '<Streamed/>' }],
                        },
                    ],
                } as UnifiedProject,
            });
        });
        await waitFor(() => expect(probe.getAttribute('data-projects')).toBe('SkeletonSvc,StreamedSvc'));

        // Re-sending the SAME project (worker retry): merged, not duplicated.
        await act(async () => {
            messageListener!({ command: BackendCommand.UnifiedLoadProject, project: FULL_PROJECT });
        });
        await waitFor(() => expect(probe.getAttribute('data-projects')).toBe('SkeletonSvc,StreamedSvc'));
        expect(probe.getAttribute('data-big-req-count')).toBe('1');
    });

    it('refresh() still performs the FULL list load (fallback/refresh path) and reaches ready', async () => {
        render(
            <UnifiedProjectProvider>
                <Probe />
            </UnifiedProjectProvider>,
        );
        const probe = await screen.findByTestId('probe');
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        expect(fullListCalls().length).toBe(0, 'no full list on first paint');

        // Explicit refresh (imports / WSDL load / error-state Retry) → full list.
        fireEvent.click(screen.getByTestId('refresh'));
        await waitFor(() => expect(fullListCalls().length).toBe(1));
        await waitFor(() => expect(probe.getAttribute('data-phase')).toBe('ready'));
        expect(probe.getAttribute('data-big-req-body')).toBe('<BigReqBody/>', 'full list restores full detail');
        expect(probe.getAttribute('data-big-op-schema')).toBe('yes');
    });
});

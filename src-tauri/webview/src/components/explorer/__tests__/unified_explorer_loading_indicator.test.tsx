/**
 * UnifiedExplorerSidebar loading-indicator regression test (t_28cab51c).
 *
 * Contracts pinned here (docs/FIRST_START_EXPLORER_LOADING_CONTRACT.md §4):
 *  - phase === 'loading': fixed-height (24 px) indicator row with spinner +
 *    "Loading interfaces… (n/m)" while the background skeleton load runs;
 *    projects already in state render beneath it (partial rendering — the
 *    UI is interactive during the load, no first-start lockup).
 *  - phase === 'ready': the indicator row is GONE (no layout shift residue);
 *    empty store keeps the existing "No projects yet" markup.
 *  - phase === 'ready' with errors: a single muted warning row that does not
 *    hide the tree.
 *  - phase === 'error': the tree area is replaced by the message + a Retry
 *    button that calls the context refresh() (no full app reload), and the
 *    "No projects yet" empty state must NOT render in that phase.
 *  - phase === 'idle' (e.g. isolated unit tests without a provider): no
 *    indicator, no error, plain empty state.
 *
 * The context is hermetically mocked: the sidebar reads
 * `useUnifiedProjectsSafe()` (its only coupling), so pointing it at a
 * configurable load state pins each phase without exercising the loader.
 * The loader itself (state machine, no-double-load) is pinned in
 * contexts/__tests__/unifiedProjectContextLoader.test.tsx.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UnifiedExplorerSidebar } from '../UnifiedExplorerSidebar';
import { UnifiedProject, ScrapbookRequest } from '@shared/models';

// ── hermetic context mock ───────────────────────────────────────────────────
// vi.mock specifiers resolve relative to THIS test file
// (components/explorer/__tests__/), so the context at src/contexts is
// '../../../contexts/UnifiedProjectContext'.
const h = vi.hoisted(() => ({
    load: { phase: 'idle' } as { phase: string } & Record<string, unknown>,
    refresh: vi.fn(async () => {}),
}));

vi.mock('../../../contexts/UnifiedProjectContext', () => ({
    useUnifiedProjectsSafe: () => ({ load: h.load, refresh: h.refresh }),
}));

// ── fixtures ────────────────────────────────────────────────────────────────
const makeProject = (): UnifiedProject => ({
    name: 'CountryInfo',
    source: 'wsdl',
    sourceUrl: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
    parsedAt: new Date().toISOString(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-1',
            name: 'GetCurrencyRate',
            action: 'http://www.oorsprong.org/websamples.countryinfo/GetCurrencyRate',
            targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo/',
            originalEndpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
            requests: [
                {
                    id: 'req-1',
                    name: 'MyRateRequest',
                    request: '<GetCurrencyRate/>',
                    endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                },
            ],
        },
    ],
});

const baseProps: Omit<React.ComponentProps<typeof UnifiedExplorerSidebar>, 'projects' | 'scrapbook'> = {
    selectedNode: null,
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteRequest: vi.fn(),
    onNewRequest: vi.fn(),
    onExportProject: vi.fn(),
    onReorderOperation: vi.fn(),
    onReorderRequest: vi.fn(),
};

const renderSidebar = (projects: UnifiedProject[], scrapbook?: { requests: ScrapbookRequest[] }) =>
    render(
        <UnifiedExplorerSidebar
            {...baseProps}
            projects={projects}
            scrapbook={
                scrapbook
                    ? {
                        requests: scrapbook.requests,
                        selectedRequest: null,
                        loading: false,
                        onCreateRequest: vi.fn(),
                        onSelectRequest: vi.fn(),
                        onDeleteRequest: vi.fn(),
                        onExecuteRequest: vi.fn(),
                    }
                    : undefined
            }
        />,
    );

beforeEach(() => {
    vi.clearAllMocks();
    h.load = { phase: 'idle' };
});

describe('UnifiedExplorerSidebar loading indicator (contract §4 — t_28cab51c)', () => {
    it('shows the loading row with progress counter while phase === "loading"', () => {
        h.load = { phase: 'loading', loaded: 3, total: 12 };
        renderSidebar([]);

        // The counter is appended inside the indicator span — match the full
        // label text ("Loading interfaces… (3/12)").
        expect(screen.getByText(/Loading interfaces… \(3\/12\)/)).toBeInTheDocument();
    });

    it('renders already-loaded projects beneath the indicator (partial rendering, no lockup)', () => {
        h.load = { phase: 'loading', loaded: 1, total: 5 };
        renderSidebar([makeProject()]);

        // Indicator AND the tree coexist — the UI is interactive during load.
        expect(screen.getByText(/Loading interfaces/)).toBeInTheDocument();
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();

        // The tree is live: expanding the project row reveals its operations.
        const row = screen.getByText('CountryInfo').parentElement as HTMLElement;
        const chevron = row.querySelector('div') as HTMLElement;
        expect(chevron).not.toBeNull();
        fireEvent.click(chevron);
        expect(screen.getByText('GetCurrencyRate')).toBeInTheDocument();
    });

    it('keeps the loading row at a fixed 24 px height (no layout shift)', () => {
        h.load = { phase: 'loading', loaded: 0, total: 0 };
        renderSidebar([]);

        const row = screen.getByText(/Loading interfaces/).closest('div[style]');
        expect(row).not.toBeNull();
        expect(row?.style.height).toBe('24px');
    });

    it('clears the indicator on phase === "ready" and keeps the empty state for an empty store', () => {
        // Transition: loading … then ready (the context pins the machine;
        // here we pin the UI consequence of the terminal state).
        h.load = { phase: 'loading', loaded: 0, total: 2 };
        const { unmount } = renderSidebar([]);
        expect(screen.getByText(/Loading interfaces/)).toBeInTheDocument();
        unmount();

        h.load = { phase: 'ready', loaded: 2, total: 2, errors: [] };
        renderSidebar([]);
        expect(screen.queryByText(/Loading interfaces/)).not.toBeInTheDocument();
        // Existing empty-state markup renders as-is for total === 0.
        expect(screen.getByText('No projects yet')).toBeInTheDocument();
    });

    it('shows the tree (not the indicator) on phase === "ready" with projects', () => {
        h.load = { phase: 'ready', loaded: 1, total: 1, errors: [] };
        renderSidebar([makeProject()]);

        expect(screen.queryByText(/Loading interfaces/)).not.toBeInTheDocument();
        expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
    });

    it('shows a muted warning row for ready-with-errors without hiding the tree', () => {
        h.load = {
            phase: 'ready',
            loaded: 1,
            total: 2,
            errors: [
                { name: 'BadSvc', message: 'parse error' },
                { name: 'WorseSvc', message: 'unreadable' },
            ],
        };
        renderSidebar([makeProject()]);

        expect(screen.getByText(/2 projects failed to load/)).toBeInTheDocument();
        // Tree still visible — the warning does not replace it.
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
        expect(screen.queryByText(/Loading interfaces/)).not.toBeInTheDocument();
    });

    it('replaces the tree with message + Retry on phase === "error", and Retry calls context refresh()', () => {
        h.load = { phase: 'error', message: 'projects dir unreadable' };
        renderSidebar([]);

        expect(screen.getByText('projects dir unreadable')).toBeInTheDocument();
        const retry = screen.getByRole('button', { name: 'Retry' });
        expect(retry).toBeInTheDocument();
        // The empty state must NOT render in the error phase (guarded).
        expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
        expect(screen.queryByText(/Loading interfaces/)).not.toBeInTheDocument();

        fireEvent.click(retry);
        expect(h.refresh).toHaveBeenCalledTimes(1);
    });

    it('renders nothing load-related on phase === "idle" (isolated tests / no provider)', () => {
        h.load = { phase: 'idle' };
        renderSidebar([]);

        expect(screen.queryByText(/Loading interfaces/)).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
        expect(screen.getByText('No projects yet')).toBeInTheDocument();
    });
});

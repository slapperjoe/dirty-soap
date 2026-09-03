/**
 * Legacy workspace-link regression test (t_1340c643).
 *
 * Phase A (t_762df439) removed the Projects/Workspace *rail entry* but
 * deliberately did NOT redirect the legacy deep links (audit §5 note): they
 * carry legacy `ApinoxProject` selections the unified explorer cannot render,
 * so redirecting them would strand the selection. Those links remain
 * load-bearing for the TESTS view and legacy projects until Phase B
 * (migration + TESTS decoupling).
 *
 * This test pins that intentional behavior at the unit level so a future
 * cleanup neither silently strands a legacy selection nor breaks the
 * load-bearing hand-off: a `view === 'projects'` search result still navigates
 * to the legacy PROJECTS view (not the unified explorer). If the legacy link
 * is ever changed to redirect to UNIFIED_EXPLORER, this test FAILS and forces
 * the Phase-B decision to be made explicitly.
 *
 * Only the `view === 'projects'` branch is asserted (the legacy link). The
 * other views are unaffected by the workspace-tab removal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SidebarView } from '@shared/models';
import { ProjectProvider } from '../ProjectContext';
import { SelectionProvider } from '../SelectionContext';
import { SearchProvider, useSearch } from '../SearchContext';
import type { SearchResult } from '../../utils/workspaceSearch';

// ── spies (vi.hoisted so they exist before the hoisted vi.mock factory) ─────
const setActiveViewMock = vi.hoisted(() => vi.fn());

// Replace useNavigation with a spy so we can observe which view a legacy link
// targets, without mounting the full app. ProjectProvider/SelectionProvider stay
// real (SearchProvider depends on useProject + useSelection).
vi.mock('../NavigationContext', () => ({
    useNavigation: () => ({ setActiveView: setActiveViewMock }),
}));

// Hermetic bridge: jsdom is not Tauri, so ProjectProvider's mount effect
// (`if (!bridge.isTauri()) return;`) short-circuits — no backend calls.
// NOTE: vi.mock specifiers resolve relative to THIS test file (src/contexts/
// __tests__/), so the bridge at src/utils/bridge is '../../utils/bridge'.
vi.mock('../../utils/bridge', () => ({
    bridge: {
        isTauri: () => false,
        sendMessage: vi.fn(),
        sendMessageAsync: vi.fn(async () => ({})),
        onMessage: vi.fn(() => vi.fn()),
        emit: vi.fn(),
        invokeTauriCommand: vi.fn(async () => ({})),
    },
    invokeTauriCommand: vi.fn(async () => ({})),
}));

/** A legacy workspace deep link: a search hit that lives in the PROJECTS view. */
const legacyProjectsResult: SearchResult = {
    id: 'r-legacy',
    type: 'request',
    name: 'legacyReq',
    breadcrumb: 'LegacyProject > Service > legacyReq',
    view: 'projects',
    score: 100,
    data: { projectName: 'LegacyProject' },
};

/** Control: a search hit that lives in the TESTS view (unaffected). */
const testsResult: SearchResult = {
    id: 'r-tests',
    type: 'test-case',
    name: 'tc',
    breadcrumb: 'LegacyProject > Suite > tc',
    view: 'tests',
    score: 100,
    data: { projectName: 'LegacyProject', testSuiteId: 's-1', testCaseId: 'tc-1' },
};

/** Exposes the real useSearch().selectResult (the legacy-link entry point). */
const LegacyLinkProbe: React.FC = () => {
    const { selectResult } = useSearch();
    return (
        <>
            <button
                onClick={() => selectResult(legacyProjectsResult)}
                data-testid="act-legacy"
                style={{ display: 'none' }}
            >
                legacy
            </button>
            <button
                onClick={() => selectResult(testsResult)}
                data-testid="act-tests"
                style={{ display: 'none' }}
            >
                tests
            </button>
        </>
    );
};

const renderProbe = () =>
    render(
        <ProjectProvider>
            <SelectionProvider>
                <SearchProvider>
                    <LegacyLinkProbe />
                </SearchProvider>
            </SelectionProvider>
        </ProjectProvider>,
    );

beforeEach(() => {
    setActiveViewMock.mockClear();
});

describe('Legacy workspace links (kept load-bearing per audit §5)', () => {
    it('a legacy "projects" search result still navigates to the PROJECTS view', () => {
        renderProbe();

        fireEvent.click(screen.getByTestId('act-legacy'));

        // Intentional current behavior: the legacy deep link targets PROJECTS
        // (it carries a legacy selection the unified explorer cannot render).
        expect(setActiveViewMock).toHaveBeenCalledWith(SidebarView.PROJECTS);
        // ...and NOT the unified explorer (redirecting would strand the selection).
        expect(setActiveViewMock).not.toHaveBeenCalledWith(SidebarView.UNIFIED_EXPLORER);
    });

    it('does not touch the unified explorer for a non-projects (tests) result', () => {
        renderProbe();

        fireEvent.click(screen.getByTestId('act-tests'));

        expect(setActiveViewMock).toHaveBeenCalledWith(SidebarView.TESTS);
        expect(setActiveViewMock).not.toHaveBeenCalledWith(SidebarView.UNIFIED_EXPLORER);
    });
});

/**
 * Legacy workspace-link regression test (t_1340c643, updated for Phase B
 * t_86c34d38).
 *
 * Phase A (t_762df439) removed the Projects/Workspace *rail entry* and kept
 * the legacy deep links load-bearing for the PROJECTS view (audit §5). Phase B
 * (this card) DELETED the PROJECTS view after the product decision "abandon
 * legacy", and ships an idempotent legacy→unified migration (migrated
 * projects keep their operation/request ids, so legacy result ids still match
 * unified node ids).
 *
 * [EXPLICIT DECISION — Phase B (t_86c34d38)]
 * A `view === 'projects'` search/deep-link result now redirects to
 * UNIFIED_EXPLORER (the sole project surface) and selects the migrated
 * project's node in the unified tree. This was the "explicit decision" the
 * original test was guarding: the legacy selection is no longer stranded
 * because the migration preserves ids and the unified store now owns the
 * suites. This test is updated DELIBERATELY to pin the new redirect — a
 * future change to the redirect target must update this test on purpose.
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
import { UnifiedProjectProvider } from '../UnifiedProjectContext';
import type { SearchResult } from '../../utils/workspaceSearch';

// ── spies (vi.hoisted so they exist before the hoisted vi.mock factory) ─────
const setActiveViewMock = vi.hoisted(() => vi.fn());

// Replace useNavigation with a spy so we can observe which view a legacy link
// targets, without mounting the full app. ProjectProvider/SelectionProvider/
// UnifiedProjectProvider stay real (SearchProvider depends on useProject +
// useSelection + useUnifiedProjects).
vi.mock('../NavigationContext', () => ({
    useNavigation: () => ({ setActiveView: setActiveViewMock }),
}));

// Hermetic bridge: jsdom is not Tauri, so every provider's mount effect
// (`if (!bridge.isTauri()) return;`) short-circuits — no backend calls.
// NOTE: vi.mock specifiers resolve relative to THIS test file (src/contexts/
// __tests__/), so the bridge at src/utils/bridge is '../../utils/bridge'.
vi.mock('../../utils/bridge', () => ({
    isTauri: () => false,
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

/** A legacy workspace deep link: a search hit that lives in the (deleted) PROJECTS view. */
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
                <UnifiedProjectProvider>
                    <SearchProvider>
                        <LegacyLinkProbe />
                    </SearchProvider>
                </UnifiedProjectProvider>
            </SelectionProvider>
        </ProjectProvider>,
    );

beforeEach(() => {
    setActiveViewMock.mockClear();
});

describe('Legacy workspace links (Phase B: redirect to the unified explorer)', () => {
    it('a legacy "projects" search result now redirects to the UNIFIED explorer (Phase B decision)', () => {
        renderProbe();

        fireEvent.click(screen.getByTestId('act-legacy'));

        // Phase B (t_86c34d38) EXPLICIT DECISION: the PROJECTS view is deleted;
        // legacy "projects" links resolve to the unified explorer (migrated
        // projects keep their ids, so the selection is not stranded).
        expect(setActiveViewMock).toHaveBeenCalledWith(SidebarView.UNIFIED_EXPLORER);
        // ...and the legacy PROJECTS view no longer exists in the enum.
    });

    it('does not touch the unified explorer for a non-projects (tests) result', () => {
        renderProbe();

        fireEvent.click(screen.getByTestId('act-tests'));

        expect(setActiveViewMock).toHaveBeenCalledWith(SidebarView.TESTS);
        expect(setActiveViewMock).not.toHaveBeenCalledWith(SidebarView.UNIFIED_EXPLORER);
    });
});

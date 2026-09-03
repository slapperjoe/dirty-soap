import React from 'react';
import styled from 'styled-components';
import { SidebarView } from '@shared/models';

// Components
import { TestsUi } from './sidebar/TestsUi';
import { WorkflowsUi } from './sidebar/WorkflowsUi';
import { PerformanceUi } from './sidebar/PerformanceUi';
// @ts-ignore - TS export detection issue; runtime export exists.
import HistorySidebar from './sidebar/HistorySidebar';
import { ScrapbookPanel } from './sidebar/ScrapbookPanel';
import { NotesList } from './sidebar/NotesList';
import { SidebarRail } from './sidebar/SidebarRail';
import { UnifiedExplorerSidebar } from './explorer/UnifiedExplorerSidebar';
import { useSidebarContext } from '../contexts/SidebarContext';

const SidebarContainer = styled.div<{ $collapsed: boolean; $width?: number }>`
    display: flex;
    height: 100%;
    flex-direction: row;
    min-width: ${props => props.$collapsed ? '50px' : '160px'};
    width: ${props => props.$collapsed ? '50px' : (props.$width ?? 240) + 'px'};
    flex-shrink: 0;
    border-right: 1px solid var(--color-border);
    background: var(--color-surface);
`;

const ResizeHandle = styled.div`
    width: 4px;
    height: 100%;
    cursor: col-resize;
    background: transparent;
    transition: background 0.2s;

    &:hover {
        background: var(--color-primary);
    }
`;

const SidebarContent = styled.div<{ $hidden: boolean }>`
    flex: ${props => props.$hidden ? 0 : 1};
    display: ${props => props.$hidden ? 'none' : 'flex'};
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    background-color: var(--apinox-sideBar-background);
`;

export const Sidebar: React.FC = () => {
    const [sidebarWidth, setSidebarWidth] = React.useState(240);
    const isResizing = React.useRef(false);

    const handleResizeStart = (e: React.MouseEvent) => {
        isResizing.current = true;
        const startX = e.clientX;
        const startWidth = sidebarWidth;

        const handleResizeMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const delta = e.clientX - startX;
            setSidebarWidth(Math.max(160, Math.min(600, startWidth + delta)));
        };

        const handleResizeEnd = () => {
            isResizing.current = false;
            document.removeEventListener('mousemove', handleResizeMove);
            document.removeEventListener('mouseup', handleResizeEnd);
        };

        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };
    const {
        testsProps,
        workflowsProps,
        performanceProps,
        historyProps,
        unifiedProps,
        onOpenSettings,
        onOpenHelp,
        activeView,
        onChangeView,
        sidebarExpanded,
        activeEnvironment,
        environments,
        onChangeEnvironment,
        isMobileOpen,
        onMobileClose,
        hasUpdate,
    } = useSidebarContext();

    // Phase B (t_86c34d38): the PROJECTS view (ProjectList) was deleted —
    // projectProps / the selectionProps destructures it consumed are gone with
    // it. The remaining sidebar children (Tests/Workflows/Performance/
    // History/Unified) use their own prop groups below.

    const proxyFullPanelView = activeView === SidebarView.PROXY || activeView === SidebarView.MOCK || activeView === SidebarView.WATCHER;
    const historyEmpty = activeView === SidebarView.HISTORY && (!historyProps || historyProps.history.length === 0);
    const hideContent = !sidebarExpanded || activeView === SidebarView.HOME || proxyFullPanelView || historyEmpty;

    return (
        <SidebarContainer
            $collapsed={hideContent}
            $width={sidebarWidth}
            className={`sidebar-drawer${isMobileOpen ? ' sidebar-open' : ''}`}
        >
            <SidebarRail
                activeView={activeView}
                onChangeView={onChangeView}
                onOpenSettings={onOpenSettings}
                onOpenHelp={onOpenHelp}
                activeEnvironment={activeEnvironment}
                environments={environments}
                onChangeEnvironment={onChangeEnvironment}
                onMobileClose={onMobileClose}
                hasUpdate={hasUpdate}
            />

            {/* Content Area */}
            <SidebarContent $hidden={hideContent}>

                {activeView === SidebarView.TESTS && (
                    <TestsUi
                        projects={testsProps.projects}
                        selectedTestSuite={testsProps.selectedTestSuite}
                        selectedTestCase={testsProps.selectedTestCase}
                        onAddSuite={testsProps.onAddSuite}
                        onDeleteSuite={testsProps.onDeleteSuite}
                        onRunSuite={testsProps.onRunSuite}
                        onAddTestCase={testsProps.onAddTestCase}
                        onDeleteTestCase={testsProps.onDeleteTestCase}
                        onRenameTestCase={testsProps.onRenameTestCase}
                        onRunCase={testsProps.onRunCase}
                        onSelectSuite={testsProps.onSelectSuite}
                        onSelectTestCase={testsProps.onSelectTestCase}
                        onToggleSuiteExpand={testsProps.onToggleSuiteExpand}
                        onToggleCaseExpand={testsProps.onToggleCaseExpand}
                        onSelectTestStep={testsProps.onSelectTestStep}
                        onRenameTestStep={testsProps.onRenameTestStep}
                        deleteConfirm={testsProps.deleteConfirm}
                    />
                )}

                {activeView === SidebarView.WORKFLOWS && workflowsProps && (
                    <WorkflowsUi
                        {...workflowsProps}
                    />
                )}

                {activeView === SidebarView.PERFORMANCE && performanceProps && (
                    <PerformanceUi
                        {...performanceProps}
                    />
                )}

                {activeView === SidebarView.HISTORY && historyProps && (
                    <HistorySidebar
                        {...historyProps}
                    />
                )}

                {activeView === SidebarView.NOTES && (
                    <NotesList />
                )}

                {unifiedProps && (
                    <div style={{ display: activeView === SidebarView.UNIFIED_EXPLORER ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}>
                        <UnifiedExplorerSidebar
                            projects={unifiedProps.projects}
                            selectedNode={unifiedProps.selectedNode}
                            onSelectNode={unifiedProps.onSelectNode}
                            onRefreshProject={unifiedProps.onRefreshProject}
                            onDeleteProject={unifiedProps.onDeleteProject}
                            onDeleteOperation={unifiedProps.onDeleteOperation}
                            onDeleteRequest={unifiedProps.onDeleteRequest}
                            onNewRequest={unifiedProps.onNewRequest}
                            onRenameProject={unifiedProps.onRenameProject}
                            onRenameOperation={unifiedProps.onRenameOperation}
                            onRenameRequest={unifiedProps.onRenameRequest}
                            onExportProject={unifiedProps.onExportProject}
                            onExportWorkspace={unifiedProps.onExportWorkspace}
                            onBulkImport={unifiedProps.onBulkImport}
                            onImportSoapUI={unifiedProps.onImportSoapUI}
                            onGenerateTestSuite={unifiedProps.onGenerateTestSuite}
                            onAddRequestToTestCase={unifiedProps.onAddRequestToTestCase}
                            onReorderOperation={unifiedProps.onReorderOperation}
                            onReorderRequest={unifiedProps.onReorderRequest}
                            scrapbook={unifiedProps.scrapbook}
                        />
                    </div>
                )}

            </SidebarContent>
            <ResizeHandle onMouseDown={handleResizeStart} />
        </SidebarContainer>
    );
};

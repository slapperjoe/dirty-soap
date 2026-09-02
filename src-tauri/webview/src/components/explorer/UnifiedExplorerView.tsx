import React, { useCallback } from 'react';
import { UnifiedExplorerMain } from './UnifiedExplorerMain';
import { invokeTauriCommand } from '../../utils/bridge';
import { debugLog } from '../../utils/logger';
import { UnifiedProject, ApiRequest } from '@shared/models';
import { useScrapbook } from '../../contexts/ScrapbookContext';

interface SelectedNode {
    type: string;
    id: string;
}

interface UnifiedExplorerViewProps {
    projects: UnifiedProject[];
    selectedNode: SelectedNode | null;
    onSelectNode: (type: string, id: string) => void;
    onRefreshProject: (projectName: string) => void;
    onNewRequest: (projectName: string, operationName: string) => void;
    /** Interface-level (project) Content-Type override change — propagates to all existing requests and persists the project. */
    onProjectContentTypeChange?: (projectName: string, contentType: string) => void;
    onWsdlLoaded?: (project: UnifiedProject) => void;
    /**
     * F-01 — receives the unified execute function registered by
     * `UnifiedExplorerMain` (used by the sidebar Quick Requests panel, which
     * is rendered in `Sidebar.tsx` — a sibling of this view).
     */
    onRegisterExecute?: (execute: (req: ApiRequest) => Promise<void>) => void;
}

const UnifiedExplorerView: React.FC<UnifiedExplorerViewProps> = ({
    projects,
    selectedNode,
    onSelectNode,
    onRefreshProject,
    onNewRequest,
    onProjectContentTypeChange,
    onWsdlLoaded,
    onRegisterExecute,
}) => {

    const handleLoadWsdl = useCallback(async (url: string) => {
        try {
            const project = await invokeTauriCommand('parse_wsdl_as_project', { url });
            if (onWsdlLoaded) {
                onWsdlLoaded(project);
            }
        } catch (e) {
            debugLog('[UnifiedExplorer] Failed to load WSDL', String(e));
            throw e;
        }
    }, [onWsdlLoaded]);

    // F-02 / R-05 (Q4(c)): auto-capture every successful unified execution
    // into the scrapbook (update keyed by endpoint+operation, else append).
    // The app-level ScrapbookProvider wraps this view (App.tsx), so capture
    // lands in the same store the sidebar Quick Requests section renders.
    const { captureExecution } = useScrapbook();
    const handleAfterExecute = useCallback(async (request: ApiRequest, operationName?: string | null) => {
        try {
            await captureExecution(request, operationName);
        } catch (e) {
            console.error('[UnifiedExplorer] Auto-capture failed:', e);
        }
    }, [captureExecution]);

    return (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <UnifiedExplorerMain
                projects={projects}
                selectedNode={selectedNode}
                onSelectNode={onSelectNode}
                onRefreshProject={onRefreshProject}
                onLoadWsdl={handleLoadWsdl}
                onNewRequest={onNewRequest}
                onProjectContentTypeChange={onProjectContentTypeChange}
                onAfterExecute={handleAfterExecute}
                onRegisterExecute={onRegisterExecute}
            />
        </div>
    );
};

export { UnifiedExplorerView };

import React, { useCallback } from 'react';
import { UnifiedExplorerMain } from './UnifiedExplorerMain';
import { invokeTauriCommand } from '../../utils/bridge';
import { debugLog } from '../../utils/logger';
import { UnifiedProject } from '@shared/models';

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
}

const UnifiedExplorerView: React.FC<UnifiedExplorerViewProps> = ({
    projects,
    selectedNode,
    onSelectNode,
    onRefreshProject,
    onNewRequest,
    onProjectContentTypeChange,
    onWsdlLoaded,
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
            />
        </div>
    );
};

export { UnifiedExplorerView };

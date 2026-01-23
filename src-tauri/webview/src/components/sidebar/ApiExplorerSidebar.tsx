import React, { useState } from 'react';
import styled from 'styled-components';
import { Plus, Trash2 } from 'lucide-react';
import { ApiInterface, ApiOperation, ApiRequest } from '@shared/models';
import { HeaderButton, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
import { ServiceTree } from './ServiceTree';



export interface ApiExplorerSidebarProps {
    exploredInterfaces: ApiInterface[];
    // Actions
    addToProject: (iface: ApiInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: ApiInterface) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;

    // Selection State
    selectedInterface: ApiInterface | null;
    setSelectedInterface: (iface: ApiInterface | null) => void;
    selectedOperation: ApiOperation | null;
    setSelectedOperation: (op: ApiOperation | null) => void;
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    setResponse: (res: any) => void;

    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
}

const ExplorerContent = styled(SidebarContent)`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const EmptyMessage = styled.div`
    text-align: center;
    color: var(--vscode-descriptionForeground);
    padding: 20px 0;
    font-size: 0.9em;
`;

export const ApiExplorerSidebar: React.FC<ApiExplorerSidebarProps> = ({
    exploredInterfaces,
    addToProject,
    addAllToProject,
    clearExplorer,
    removeFromExplorer,
    toggleExploredInterface,
    toggleExploredOperation,
    selectedInterface,
    setSelectedInterface,
    selectedOperation,
    setSelectedOperation,
    selectedRequest,
    setSelectedRequest,
    setResponse,
    handleContextMenu
}) => {
    // Local state for delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    return (
        <SidebarContainer>

            <SidebarHeader>
                <SidebarHeaderTitle>API Explorer</SidebarHeaderTitle>
                {exploredInterfaces.length > 0 && (
                    <SidebarHeaderActions>
                        <HeaderButton onClick={(e) => { e.stopPropagation(); addAllToProject(); }} title="Add All to Project">
                            <Plus size={16} />
                        </HeaderButton>
                        <HeaderButton onClick={(e) => { e.stopPropagation(); clearExplorer(); }} title="Clear Explorer">
                            <Trash2 size={16} />
                        </HeaderButton>
                    </SidebarHeaderActions>
                )}
            </SidebarHeader>

            <ExplorerContent>
                {exploredInterfaces.length === 0 ? (
                    <EmptyMessage>
                        No APIs loaded.
                        <br /><br />
                        Use the main view to load a WSDL or OpenAPI spec.
                    </EmptyMessage>
                ) : (
                    <ServiceTree
                        interfaces={exploredInterfaces}
                        isExplorer={true}
                        selectedInterface={selectedInterface}
                        selectedOperation={selectedOperation}
                        selectedRequest={selectedRequest}
                        confirmDeleteId={confirmDeleteId}
                        setConfirmDeleteId={setConfirmDeleteId}


                        onToggleInterface={(iface) => toggleExploredInterface(iface.name)}
                        onSelectInterface={(iface) => {
                            // Only select, don't expand
                            setSelectedInterface(iface);
                            setSelectedOperation(null);
                            setSelectedRequest(null);
                        }}
                        onToggleOperation={(op, iface) => toggleExploredOperation(iface.name, op.name)}
                        onSelectOperation={(op, iface) => {
                            // Only select operation, don't auto-select request
                            setSelectedInterface(iface);
                            setSelectedOperation(op);
                            setSelectedRequest(null);
                        }}
                        onSelectRequest={(req, op, iface) => {
                            setSelectedInterface(iface);
                            setSelectedOperation(op);
                            setSelectedRequest(req);
                            setResponse(null);
                        }}
                        onContextMenu={(e, type, data) => handleContextMenu(e, type, data, true)}

                        onAddToProject={addToProject}
                        onRemoveFromExplorer={removeFromExplorer}
                    />
                )}
            </ExplorerContent>
        </SidebarContainer>
    );
};

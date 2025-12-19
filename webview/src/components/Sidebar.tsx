import React from 'react';
import styled from 'styled-components';
import { ChevronRight, ChevronDown, Plus, Trash2, Globe, FileCode, Play, Save, FolderOpen, FolderPlus } from 'lucide-react';
import { SoapUIInterface, SoapUIOperation, SoapUIRequest, SoapUIProject } from '../models';

// Styled Components
const SidebarContainer = styled.div`
  width: 300px;
  background-color: var(--vscode-sideBar-background);
  border-right: 1px solid var(--vscode-sideBarSectionHeader-border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const SectionHeader = styled.div`
  padding: 5px 10px;
  font-weight: bold;
  cursor: pointer;
  display: flex;
  align-items: center;
  user-select: none;
  &:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
`;

const SectionTitle = styled.div`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ServiceItem = styled.div`
  padding: 5px 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  &:hover {
    background-color: var(--vscode-list-hoverBackground);
  }
`;

const OperationItem = styled.div<{ active?: boolean }>`
  padding: 5px 10px;
  padding-left: 20px;
  cursor: pointer;
  background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
  color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
  display: flex;
  align-items: center;
  &:hover {
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
  }
`;

const RequestItem = styled.div<{ active?: boolean }>`
  padding: 5px 10px;
  padding-left: 45px;
  cursor: pointer;
  font-size: 0.9em;
  background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
  color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
  display: flex;
  align-items: center;
  &:hover {
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
  }
`;

const HeaderButton = styled.button`
  background: transparent;
  border: none;
  color: var(--vscode-icon-foreground);
  cursor: pointer;
  padding: 2px;
  margin-left: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover {
    background-color: var(--vscode-toolbar-hoverBackground);
    border-radius: 3px;
  }
`;

const Input = styled.input`
  background-color: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 4px;
  flex: 1;
  outline: none;
  &:focus {
    border-color: var(--vscode-focusBorder);
  }
`;

interface SidebarProps {
    explorerExpanded: boolean;
    toggleExplorerExpand: () => void;
    exploredInterfaces: SoapUIInterface[];
    projects: SoapUIProject[];
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    selectedFile: string | null;
    loadWsdl: () => void;
    pickLocalWsdl: () => void;
    downloadStatus: string[] | null;

    // Actions
    addToProject: (iface: SoapUIInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: SoapUIInterface) => void;

    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;

    saveWorkspace: () => void;
    openWorkspace: () => void;
    loadProject: () => void;
    saveProject: (proj: SoapUIProject) => void;
    closeProject: (name: string) => void;
    onAddProject: () => void;

    // Selection State
    selectedProjectName: string | null;
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: SoapUIInterface | null;
    setSelectedInterface: (iface: SoapUIInterface | null) => void;
    selectedOperation: SoapUIOperation | null;
    setSelectedOperation: (op: SoapUIOperation | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setResponse: (res: any) => void;

    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    deleteConfirm: string | null;
    backendConnected: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
    explorerExpanded, toggleExplorerExpand, exploredInterfaces, projects,
    inputType, setInputType, wsdlUrl, setWsdlUrl, selectedFile, loadWsdl, pickLocalWsdl, downloadStatus,
    addToProject, addAllToProject, clearExplorer, removeFromExplorer,
    toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand,
    toggleExploredInterface, toggleExploredOperation,
    saveWorkspace, openWorkspace, loadProject, saveProject, closeProject, onAddProject,
    setSelectedProjectName,
    setSelectedInterface,
    selectedOperation, setSelectedOperation,
    selectedRequest, setSelectedRequest,
    setResponse,
    handleContextMenu, deleteConfirm, backendConnected
}) => {

    const renderInterfaceList = (interfaces: SoapUIInterface[], isExplorer: boolean) => (
        interfaces.map((iface, i) => (
            <div key={i}>
                <ServiceItem
                    onContextMenu={(e) => handleContextMenu(e, 'interface', iface, isExplorer)}
                    onClick={() => {
                        if (isExplorer) {
                            toggleExploredInterface(iface.name);
                        } else {
                            toggleInterfaceExpand(projects.find(p => p.interfaces.includes(iface))?.name || '', iface.name);
                        }
                    }}
                    style={{ paddingLeft: 20 }}
                >
                    <span style={{ marginRight: 5, display: 'flex' }}>
                        {/* Expanded logic need to be consistent. SoapUIInterface has 'expanded' prop? 
                            In App.tsx it seemed to be dynamically added or assumed?
                            Line 301 in App.tsx: SoapUIInterface definition in extension.ts didn't have 'expanded'.
                            But App.tsx cast it or added it?
                            Line 422: conversions.
                            Wait, `App.tsx` defined `SoapUIInterface` locally or imported?
                            It likely added `expanded?: boolean`.
                            I need to make sure `models.ts` has `expanded`.
                         */}
                        {(iface as any).expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {iface.name} {isExplorer ? '(Preview)' : ''}
                    </span>
                    {isExplorer && (
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); addToProject(iface); }} title="Add to Project">
                                <Plus size={14} />
                            </HeaderButton>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); removeFromExplorer(iface); }} title="Remove from Explorer">
                                <Trash2 size={14} />
                            </HeaderButton>
                        </div>
                    )}
                </ServiceItem>
                {(iface as any).expanded !== false && iface.operations.map((op: any, j: number) => (
                    <div key={j} style={{ marginLeft: 15 }}>
                        <OperationItem
                            active={selectedOperation === op}
                            onClick={() => {
                                if (isExplorer) {
                                    toggleExploredOperation(iface.name, op.name);
                                } else {
                                    const projName = projects.find(p => p.interfaces.includes(iface))?.name || '';
                                    toggleOperationExpand(projName, iface.name, op.name);
                                    setSelectedProjectName(projName);
                                }
                                setSelectedInterface(iface);
                                setSelectedOperation(op);
                                setSelectedRequest(null);
                            }}
                            onContextMenu={(e) => handleContextMenu(e, 'operation', op, isExplorer)}
                        >
                            <span style={{ marginRight: 5, display: 'flex', alignItems: 'center' }}>
                                {op.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            {op.name}
                        </OperationItem>
                        {op.expanded !== false && op.requests.map((req: any, k: number) => (
                            <RequestItem
                                key={k}
                                active={selectedRequest === req}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isExplorer) setSelectedProjectName(projects.find(p => p.interfaces.includes(iface))?.name || null);
                                    setSelectedInterface(iface);
                                    setSelectedOperation(op);
                                    setSelectedRequest(req);
                                    setResponse(null);
                                }}
                                onContextMenu={(e) => handleContextMenu(e, 'request', req, isExplorer)}
                            >
                                {req.name}
                            </RequestItem>
                        ))}
                    </div>
                ))}
            </div>
        ))
    );

    return (
        <SidebarContainer>
            <div style={{ flex: 1, overflowY: 'auto' }}>
                <SectionHeader onClick={toggleExplorerExpand}>
                    <SectionTitle style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        {explorerExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} WSDL Explorer
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: backendConnected ? '#4caf50' : '#f44336',
                            marginLeft: 10
                        }} title={backendConnected ? "Backend Connected" : "Backend Disconnected"}></div>
                    </SectionTitle>
                    {exploredInterfaces.length > 0 && (
                        <>
                            <div style={{ flex: 1 }}></div>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); addAllToProject(); }} title="Add All to Project">
                                <Plus size={16} />
                            </HeaderButton>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); clearExplorer(); }} title="Clear Explorer">
                                <Trash2 size={16} />
                            </HeaderButton>
                        </>
                    )}
                </SectionHeader>

                {explorerExpanded && (
                    <>
                        <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <HeaderButton
                                    onClick={() => setInputType('url')}
                                    title="Load from URL"
                                    style={{ flex: 1, textAlign: 'center', backgroundColor: inputType === 'url' ? 'var(--vscode-button-background)' : 'transparent', color: inputType === 'url' ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-button-border)', marginLeft: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                                >
                                    <Globe size={14} /> URL
                                </HeaderButton>
                                <HeaderButton
                                    onClick={() => setInputType('file')}
                                    title="Load from File"
                                    style={{ flex: 1, textAlign: 'center', backgroundColor: inputType === 'file' ? 'var(--vscode-button-background)' : 'transparent', color: inputType === 'file' ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-button-border)', marginLeft: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
                                >
                                    <FileCode size={14} /> File
                                </HeaderButton>
                            </div>

                            {inputType === 'url' ? (
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <Input
                                        value={wsdlUrl}
                                        onChange={(e) => setWsdlUrl(e.target.value)}
                                        placeholder="WSDL URL"
                                    />
                                    <HeaderButton onClick={loadWsdl} title="Load WSDL" style={{ border: '1px solid var(--vscode-button-border)', margin: 0, display: 'flex', alignItems: 'center' }}>
                                        <Play size={14} />
                                    </HeaderButton>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <HeaderButton onClick={pickLocalWsdl} title="Select Local WSDL" style={{ flex: 1, textAlign: 'center', border: '1px solid var(--vscode-button-border)', margin: 0 }}>
                                        Select File
                                    </HeaderButton>
                                    {selectedFile && <HeaderButton onClick={loadWsdl} title="Load WSDL" style={{ border: '1px solid var(--vscode-button-border)', margin: 0, display: 'flex', alignItems: 'center' }}>
                                        <Play size={14} />
                                    </HeaderButton>}
                                </div>
                            )}

                            {selectedFile && inputType === 'file' && (
                                <div style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {selectedFile}
                                </div>
                            )}
                        </div>

                        {downloadStatus && (
                            <div style={{ padding: '5px 10px', fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>
                                {downloadStatus.map((f, i) => (
                                    <div key={i} style={{ wordBreak: 'break-all' }}>• {f}</div>
                                ))}
                            </div>
                        )}

                        {renderInterfaceList(exploredInterfaces, true)}

                        {exploredInterfaces.length > 0 && (
                            <div style={{ height: 10 }}></div>
                        )}
                    </>
                )}

                <div style={{ borderTop: '1px solid var(--vscode-sideBarSectionHeader-border)', marginTop: 10 }}></div>

                <div style={{ padding: '0 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                    <div style={{ fontWeight: 'bold' }}>Workspace</div>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <HeaderButton onClick={onAddProject} title="New Project">
                            <Plus size={16} />
                        </HeaderButton>
                        <HeaderButton onClick={saveWorkspace} title="Save Workspace">
                            <Save size={16} />
                        </HeaderButton>
                        <HeaderButton onClick={openWorkspace} title="Open Workspace">
                            <FolderOpen size={16} />
                        </HeaderButton>
                        <div style={{ width: 10 }}></div>
                        <HeaderButton onClick={loadProject} title="Add Project to Workspace">
                            <FolderPlus size={16} />
                        </HeaderButton>
                    </div>
                </div>
                {projects.map((proj, pIdx) => (
                    <div key={proj.id || pIdx}>
                        <SectionHeader
                            onClick={() => toggleProjectExpand(proj.name)}
                            onContextMenu={(e) => handleContextMenu(e, 'project', proj)}
                        >
                            <SectionTitle style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {(proj as any).expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Project: {(proj as any).fileName || proj.name}
                            </SectionTitle>
                            <div style={{ flex: 1 }}></div>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); saveProject(proj); }} title="Save Project">
                                <Save size={16} />
                            </HeaderButton>
                            <HeaderButton onClick={(e) => {
                                e.stopPropagation();
                                closeProject(proj.name);
                            }} title={deleteConfirm === proj.name ? "Click again to confirm delete" : "Close Project"}
                                style={{ color: deleteConfirm === proj.name ? 'var(--vscode-errorForeground)' : 'inherit', display: 'flex', alignItems: 'center' }}>
                                {deleteConfirm === proj.name ? 'Confirm?' : <Trash2 size={16} />}
                            </HeaderButton>
                        </SectionHeader>
                        {(proj as any).expanded && (
                            <>
                                {renderInterfaceList(proj.interfaces, false)}
                            </>
                        )}
                    </div>
                ))}
            </div>
        </SidebarContainer>
    );
};

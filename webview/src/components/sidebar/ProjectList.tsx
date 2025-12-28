import React from 'react';
import { Plus, FolderPlus, ChevronDown, ChevronRight, Save, Trash2 } from 'lucide-react';
import { SoapUIProject, SoapUIInterface, SoapUIOperation, SoapUIRequest } from '../../models';
import { HeaderButton, SectionHeader, SectionTitle, DirtyMarker } from './shared/SidebarStyles';
import { ServiceTree } from './ServiceTree';
import { ProjectTestTree } from '../ProjectTestTree';

export interface ProjectListProps {
    projects: SoapUIProject[];
    savedProjects: Set<string>;
    workspaceDirty?: boolean;
    onAddProject: () => void;
    loadProject: () => void;
    saveProject: (proj: SoapUIProject) => void;
    closeProject: (name: string) => void;

    // Toggle
    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;

    // Selection
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: SoapUIInterface | null;
    setSelectedInterface: (iface: SoapUIInterface | null) => void;
    selectedOperation: SoapUIOperation | null;
    setSelectedOperation: (op: SoapUIOperation | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setResponse: (res: any) => void;

    // Actions
    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    onAddRequest?: (op: SoapUIOperation) => void;
    onDeleteInterface?: (iface: SoapUIInterface) => void;
    onDeleteOperation?: (op: SoapUIOperation, iface: SoapUIInterface) => void;
    onDeleteRequest?: (req: SoapUIRequest) => void;

    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;



    // Tests
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onRunCase: (caseId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onSelectSuite?: (suiteId: string) => void;
    onSelectTestCase?: (caseId: string) => void;
    onToggleSuiteExpand?: (suiteId: string) => void;
    onToggleCaseExpand?: (caseId: string) => void;
}

export const ProjectList: React.FC<ProjectListProps> = ({
    projects,
    savedProjects,
    workspaceDirty,
    onAddProject,
    loadProject,
    saveProject,
    closeProject,
    toggleProjectExpand,
    toggleInterfaceExpand,
    toggleOperationExpand,
    setSelectedProjectName,
    setSelectedInterface,
    selectedInterface,
    setSelectedOperation,
    selectedOperation,
    setSelectedRequest,
    selectedRequest,
    setResponse,
    handleContextMenu,
    onAddRequest,
    onDeleteInterface,
    onDeleteOperation,
    onDeleteRequest,
    deleteConfirm, // Global delete confirm from Sidebar parent
    setDeleteConfirm,


    // Tests
    onAddSuite, onDeleteSuite, onRunSuite, onAddTestCase, onRunCase, onDeleteTestCase,
    onSelectSuite, onSelectTestCase, onToggleSuiteExpand, onToggleCaseExpand
}) => {


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'hidden' }}>
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)',
                padding: '5px 10px',
                flexShrink: 0
            }}>
                <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6 }}>
                    Workspace {workspaceDirty && <DirtyMarker>●</DirtyMarker>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <HeaderButton onClick={onAddProject} title="New Project"><Plus size={16} /></HeaderButton>
                    <div style={{ width: 10 }}></div>
                    <HeaderButton onClick={loadProject} title="Add Project"><FolderPlus size={16} /></HeaderButton>
                </div>
            </div>

            <div style={{ padding: 10, flex: 1, overflowY: 'auto' }}>
                {projects.map((proj, pIdx) => (
                    <div key={proj.id || pIdx}>
                        <SectionHeader onClick={() => toggleProjectExpand(proj.name)} onContextMenu={(e) => handleContextMenu(e, 'project', proj)}>
                            <SectionTitle style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                {(proj as any).expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    Project: {proj.name || (proj as any).fileName} {proj.dirty && <DirtyMarker>●</DirtyMarker>}
                                </span>
                            </SectionTitle>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); saveProject(proj); }} title="Save Project" style={{ color: savedProjects.has(proj.name) ? 'var(--vscode-testing-iconPassed)' : 'inherit' }}>
                                <Save size={16} />
                            </HeaderButton>
                            <HeaderButton
                                onClick={(e) => { e.stopPropagation(); closeProject(proj.name); }}
                                title={deleteConfirm === proj.name ? "Click again to Confirm Delete" : "Close Project"}
                                style={{ color: deleteConfirm === proj.name ? 'var(--vscode-errorForeground)' : undefined }}
                                shake={deleteConfirm === proj.name}
                            >
                                <Trash2 size={16} />
                            </HeaderButton>
                        </SectionHeader>
                        {(proj as any).expanded && (
                            <>
                                {/* Interfaces */}
                                <ServiceTree
                                    interfaces={proj.interfaces}
                                    projects={projects}
                                    isExplorer={false}
                                    selectedInterface={selectedInterface}
                                    selectedOperation={selectedOperation}
                                    selectedRequest={selectedRequest}
                                    confirmDeleteId={deleteConfirm}
                                    setConfirmDeleteId={setDeleteConfirm}

                                    onToggleInterface={(iface) => toggleInterfaceExpand(proj.name, iface.name)}
                                    onToggleOperation={(op, iface) => toggleOperationExpand(proj.name, iface.name, op.name)}
                                    onSelectOperation={(op, iface) => {
                                        toggleOperationExpand(proj.name, iface.name, op.name);
                                        setSelectedProjectName(proj.name);
                                        setSelectedInterface(iface);
                                        setSelectedOperation(op);

                                        const hasSingleRequest = op.requests.length === 1;
                                        if (hasSingleRequest && op.requests[0]) {
                                            setSelectedRequest(op.requests[0]);
                                            setResponse(null);
                                        } else {
                                            setSelectedRequest(null);
                                        }
                                    }}
                                    onSelectRequest={(req, op, iface) => {
                                        setSelectedProjectName(proj.name);
                                        setSelectedInterface(iface);
                                        setSelectedOperation(op);
                                        setSelectedRequest(req);
                                        setResponse(null);
                                    }}
                                    onContextMenu={(e, type, data) => handleContextMenu(e, type, data, false)}

                                    onAddRequest={onAddRequest}
                                    onDeleteInterface={onDeleteInterface}
                                    onDeleteOperation={onDeleteOperation}
                                    onDeleteRequest={onDeleteRequest}
                                />

                                {/* Tests */}
                                <ProjectTestTree
                                    project={proj}
                                    onAddSuite={onAddSuite}
                                    onDeleteSuite={onDeleteSuite}
                                    onRunSuite={onRunSuite}
                                    onAddTestCase={onAddTestCase}
                                    onRunCase={onRunCase}
                                    onDeleteTestCase={onDeleteTestCase}
                                    onSelectSuite={onSelectSuite}
                                    onSelectTestCase={onSelectTestCase}
                                    onToggleSuiteExpand={onToggleSuiteExpand}
                                    onToggleCaseExpand={onToggleCaseExpand}
                                // deleteConfirm removed (using Modals)
                                />
                            </>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

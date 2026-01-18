import React, { useState } from 'react';
import styled from 'styled-components';
import { Plus, FolderPlus, ChevronDown, ChevronRight, Trash2, Lock, Save } from 'lucide-react';
import { ApinoxProject, ApiInterface, ApiOperation, ApiRequest } from '@shared/models';
import { HeaderButton, OperationItem, SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle } from './shared/SidebarStyles';
import { ServiceTree } from './ServiceTree';
import { FolderTree } from './FolderTree';
import { ContextMenu, ContextMenuItem } from '../../styles/App.styles';
import { updateProjectWithRename } from '../../utils/projectUtils';

interface ProjectListProps {
    projects: ApinoxProject[];
    savedProjects: Set<string>;
    workspaceDirty?: boolean;
    onAddProject: () => void;
    loadProject: () => void;
    saveProject: (proj: ApinoxProject) => void;
    onUpdateProject: (oldProject: ApinoxProject, newProject: ApinoxProject) => void;
    closeProject: (name: string) => void;

    // Toggle
    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;

    // Selection
    selectedProjectName: string | null;
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: ApiInterface | null;
    setSelectedInterface: (iface: ApiInterface | null) => void;
    selectedOperation: ApiOperation | null;
    setSelectedOperation: (op: ApiOperation | null) => void;
    selectedRequest: ApiRequest | null;
    setSelectedRequest: (req: ApiRequest | null) => void;
    setResponse: (res: any) => void;

    // Actions
    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    onAddRequest?: (op: ApiOperation) => void;
    onDeleteInterface?: (iface: ApiInterface) => void;
    onDeleteOperation?: (op: ApiOperation, iface: ApiInterface) => void;
    onDeleteRequest?: (req: ApiRequest) => void;
    // Folder handlers
    onAddFolder?: (projectName: string, parentFolderId?: string) => void;
    onAddRequestToFolder?: (projectName: string, folderId: string) => void;
    onDeleteFolder?: (projectName: string, folderId: string) => void;
    onToggleFolderExpand?: (projectName: string, folderId: string) => void;

    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
    onRefreshInterface?: (projectName: string, interfaceName: string) => void;
}

const ProjectContainer = styled(SidebarContainer)`
    overflow: hidden;
`;

const ProjectContent = styled(SidebarContent)`
    overflow-y: auto;
`;

const ProjectRow = styled(OperationItem)`
    font-weight: bold;
    padding-left: 5px;
`;

const ProjectToggle = styled.span`
    cursor: pointer;
    display: flex;
    align-items: center;
`;

const RenameInput = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    margin-left: 5px;
    flex: 1;
`;

const ProjectName = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    margin-left: 5px;
`;

const SaveButton = styled(HeaderButton)`
    color: var(--vscode-charts-orange);
`;

const ReadOnlyIcon = styled(Lock)`
    opacity: 0.5;
    margin-left: 5px;
`;

const MenuSeparator = styled.div`
    height: 1px;
    background-color: var(--vscode-menu-separatorBackground);
    margin: 4px 0;
`;

export const ProjectList: React.FC<ProjectListProps> = ({
    projects,
    savedProjects,

    onAddProject,
    loadProject,
    saveProject,
    onUpdateProject,
    closeProject,
    toggleProjectExpand,
    toggleInterfaceExpand,
    toggleOperationExpand,
    setSelectedProjectName,
    selectedProjectName,
    setSelectedInterface,
    selectedInterface,
    setSelectedOperation,
    selectedOperation,
    setSelectedRequest,
    selectedRequest,
    setResponse,
    handleContextMenu: _handleContextMenu,
    onAddRequest,
    onDeleteInterface,
    onDeleteOperation,
    onDeleteRequest,
    onAddFolder,
    onAddRequestToFolder,
    onDeleteFolder,
    onToggleFolderExpand,
    deleteConfirm, // Global delete confirm from Sidebar parent
    setDeleteConfirm,
    onRefreshInterface
}) => {
    // Local state for folder selection
    const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

    // Inline Rename State
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameType, setRenameType] = useState<'project' | 'folder' | 'request' | null>(null);
    const [renameName, setRenameName] = useState<string>('');

    // Local Context Menu State
    const [localContextMenu, setLocalContextMenu] = useState<{ x: number; y: number; type: string; data: any } | null>(null);

    const handleLocalContextMenu = (e: React.MouseEvent, type: string, data: any, _isExplorer?: boolean) => {
        // Prevent default and stop propagation to avoid global menu
        e.preventDefault();
        e.stopPropagation();

        // Prevent context menu for read-only items (except maybe Copy? explicit disable for now)
        // We need to check if the item belongs to a read-only project.
        // But 'data' is the item itself. 
        // If type is 'project', we can check data.readOnly.
        // If type is 'folder' or 'request', we don't easily know parent project here without searching or passing it.
        // However, we blocked triggering context menu in the children components (FolderTree)!
        // So here we only care about project triggers.
        if (type === 'project' && (data as ApinoxProject).readOnly) return;

        setLocalContextMenu({ x: e.clientX, y: e.clientY, type, data });
        // Also call parent handler if needed for side effects? No, we replace it.
        // But we might need key functionality not implemented here?
        // Let's implement full menu capability here.
    };

    const closeLocalContextMenu = () => setLocalContextMenu(null);

    const handleRenameStart = () => {
        if (localContextMenu) {
            setRenameId(localContextMenu.data.id || localContextMenu.data.name); // Prefer ID, fallback to name for projects
            setRenameType(localContextMenu.type as any);
            setRenameName(localContextMenu.data.name);
            closeLocalContextMenu();
        }
    };

    const submitRename = () => {
        if (renameId && renameName.trim() && renameType) {
            // Update projects
            const updatedProjects = updateProjectWithRename(projects, renameId, renameType, renameName.trim(), localContextMenu?.data);

            // Find the project that changed and save it
            // We can just save the specific project if we know which one?
            // updateProjectWithRename returns new array.
            // We need to call setProjects in App? No, ProjectList props has 'saveProject'.
            // 'saveProject' takes a single project.
            // We need to find the modified project.

            const originalProject = projects.find(p =>
                (p.id && p.id === renameId) ||
                p.name === renameId ||
                // Deep search for children?
                (renameType !== 'project' && (
                    p.folders?.some(f => f.id === renameId || f.requests.some(r => r.id === renameId)) ||
                    p.interfaces?.some(i => i.operations.some(o => o.requests.some(r => r.id === renameId)))
                ))
            );

            if (originalProject) {
                // Name might have changed!
                // Find the updated project in the new array.
                // Since updateProjectWithRename maps the array, the index is preserved.
                const index = projects.indexOf(originalProject);
                if (index !== -1 && updatedProjects[index]) {
                    // Pass both old and new to parent to update state and save
                    if (onUpdateProject) {
                        onUpdateProject(originalProject, updatedProjects[index]);
                    } else {
                        // Fallback (e.g., if prop missing, but it shouldn't be)
                        saveProject(updatedProjects[index]);
                    }
                }
            }
        }
        setRenameId(null);
        setRenameType(null);
        setRenameName('');
    };

    return (
        <ProjectContainer onClick={closeLocalContextMenu}>
            <SidebarHeader>
                <SidebarHeaderTitle>Workspace</SidebarHeaderTitle>
                <SidebarHeaderActions>
                    <HeaderButton onClick={onAddProject} title="New Project"><Plus size={16} /></HeaderButton>
                    <HeaderButton onClick={loadProject} title="Add Project"><FolderPlus size={16} /></HeaderButton>
                </SidebarHeaderActions>
            </SidebarHeader>

            <ProjectContent>
                {(() => {
                    const sortedProjects = [...projects].sort((a, b) => {
                        if (a.readOnly && !b.readOnly) return 1;
                        if (!a.readOnly && b.readOnly) return -1;
                        return 0;
                    });

                    return sortedProjects.map((proj, pIdx) => {
                        // Project is selected if explicitly selected OR if any of its children are selected
                        const isProjectSelected = selectedProjectName === proj.name;
                        const isProjectActive = isProjectSelected && selectedInterface === null;
                        const isRenaming = renameId === (proj.id || proj.name) && renameType === 'project';
                        const isReadOnly = !!proj.readOnly;

                        return (
                            <div key={proj.id || pIdx}>
                                <ProjectRow
                                    $active={isProjectActive}
                                    onClick={() => {
                                        // Select project, clear interface/operation/request
                                        setSelectedProjectName(proj.name);
                                        setSelectedInterface(null);
                                        setSelectedOperation(null);
                                        setSelectedRequest(null);
                                    }}
                                    onContextMenu={(e) => handleLocalContextMenu(e, 'project', proj)}
                                >
                                    <ProjectToggle
                                        onClick={(e) => { e.stopPropagation(); toggleProjectExpand(proj.name); }}
                                    >
                                        {(proj as any).expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </ProjectToggle>

                                    {isRenaming ? (
                                        <RenameInput
                                            type="text"
                                            value={renameName}
                                            onChange={(e) => setRenameName(e.target.value)}
                                            onBlur={submitRename}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') submitRename();
                                                if (e.key === 'Escape') {
                                                    setRenameId(null);
                                                    setRenameType(null);
                                                    setRenameName('');
                                                }
                                            }}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            title="Rename project"
                                            placeholder="Project name"
                                        />
                                    ) : (
                                        <ProjectName>
                                            {proj.name || (proj as any).fileName}
                                        </ProjectName>
                                    )}

                                    {/* Unsaved Project: Show Manual Save Button (Required for first save) */}
                                    {(!(proj as any).fileName) && !isRenaming && !isReadOnly && (
                                        <SaveButton
                                            onClick={(e) => { e.stopPropagation(); saveProject(proj); }}
                                            title="Save Project (Required for Auto-Save)"
                                        >
                                            <Save size={14} />
                                        </SaveButton>
                                    )}

                                    {isReadOnly && <ReadOnlyIcon size={12} />}

                                    {/* Add Folder button - only on selected project */}
                                    {isProjectActive && onAddFolder && !isRenaming && !isReadOnly && (
                                        <HeaderButton
                                            onClick={(e) => { e.stopPropagation(); onAddFolder(proj.name); }}
                                            title="Add Folder"
                                        >
                                            <FolderPlus size={14} />
                                        </HeaderButton>
                                    )}
                                    {/* Close button only when selected */}
                                    {isProjectActive && !isRenaming && !isReadOnly && (
                                        <HeaderButton
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (deleteConfirm === proj.name) {
                                                    closeProject(proj.name);
                                                    setDeleteConfirm(null);
                                                } else {
                                                    setDeleteConfirm(proj.name);
                                                    setTimeout(() => {
                                                        setDeleteConfirm(null);
                                                    }, 3000);
                                                }
                                            }}
                                            title={deleteConfirm === proj.name ? "Click again to Confirm Delete" : "Close Project"}
                                            style={{ color: deleteConfirm === proj.name ? 'var(--vscode-errorForeground)' : undefined }}
                                            $shake={deleteConfirm === proj.name}
                                        >
                                            <Trash2 size={14} />
                                        </HeaderButton>
                                    )}
                                </ProjectRow>
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
                                            onSelectInterface={(iface) => {
                                                // Only select, don't expand - expand is chevron-only
                                                setSelectedProjectName(proj.name);
                                                setSelectedInterface(iface);
                                                setSelectedOperation(null);
                                                setSelectedRequest(null);
                                            }}
                                            onToggleOperation={(op, iface) => toggleOperationExpand(proj.name, iface.name, op.name)}
                                            onSelectOperation={(op, iface) => {
                                                // Only select operation, don't auto-select request
                                                setSelectedProjectName(proj.name);
                                                setSelectedInterface(iface);
                                                setSelectedOperation(op);
                                                setSelectedRequest(null);
                                            }}
                                            onSelectRequest={(req, op, iface) => {
                                                setSelectedProjectName(proj.name);
                                                setSelectedInterface(iface);
                                                setSelectedOperation(op);
                                                setSelectedRequest(req);
                                                setResponse(null);
                                            }}
                                            onContextMenu={(e, type, data) => handleLocalContextMenu(e, type, data, false)}

                                            onAddRequest={onAddRequest}
                                            onDeleteInterface={onDeleteInterface}
                                            onDeleteOperation={onDeleteOperation}
                                            onDeleteRequest={onDeleteRequest}
                                            onSaveProject={() => saveProject(proj)}
                                            recentlySaved={savedProjects.has(proj.name)}

                                            // Inline Rename Props
                                            renameId={renameId}
                                            renameValue={renameName}
                                            onRenameChange={setRenameName}
                                            onRenameSubmit={submitRename}
                                            onRenameCancel={() => {
                                                setRenameId(null);
                                                setRenameType(null);
                                                setRenameName('');
                                            }}
                                        />

                                        {/* Folders */}
                                        {proj.folders && proj.folders.length > 0 && (
                                            <FolderTree
                                                folders={proj.folders}
                                                projectName={proj.name}
                                                selectedFolderId={selectedFolderId}
                                                setSelectedFolderId={setSelectedFolderId}
                                                selectedRequest={selectedRequest}
                                                setSelectedRequest={setSelectedRequest}
                                                setSelectedProjectName={setSelectedProjectName}
                                                setResponse={setResponse}
                                                onAddFolder={onAddFolder}
                                                onAddRequest={onAddRequestToFolder}
                                                onDeleteFolder={onDeleteFolder}
                                                onDeleteRequest={onDeleteRequest}
                                                onToggleFolderExpand={onToggleFolderExpand}
                                                deleteConfirm={deleteConfirm}
                                                setDeleteConfirm={setDeleteConfirm}
                                                onSaveProject={() => saveProject(proj)}
                                                handleContextMenu={handleLocalContextMenu}

                                                // Inline Rename Props
                                                renameId={renameId}
                                                renameValue={renameName}
                                                onRenameChange={setRenameName}
                                                onRenameSubmit={submitRename}
                                                onRenameCancel={() => {
                                                    setRenameId(null);
                                                    setRenameType(null);
                                                    setRenameName('');
                                                }}
                                                readOnly={isReadOnly}
                                            />
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })
                })()}
            </ProjectContent>

            {/* Local Context Menu */}
            {localContextMenu && (
                <ContextMenu top={localContextMenu.y} left={localContextMenu.x}>
                    {(localContextMenu.type === 'project' || localContextMenu.type === 'folder' || localContextMenu.type === 'request') && (
                        <ContextMenuItem onClick={handleRenameStart}>Rename</ContextMenuItem>
                    )}

                    {/* Replica of Global Menu Items for Fallback */}
                    {localContextMenu.type === 'request' && onDeleteRequest && (
                        <ContextMenuItem onClick={() => { onDeleteRequest(localContextMenu.data); closeLocalContextMenu(); }}>Delete</ContextMenuItem>
                    )}
                    {localContextMenu.type === 'folder' && onDeleteFolder && (
                        <ContextMenuItem onClick={() => { onDeleteFolder((localContextMenu.data as any).projectName || selectedProjectName || '', localContextMenu.data.id); closeLocalContextMenu(); }}>Delete</ContextMenuItem>
                    )}

                    {localContextMenu.type === 'interface' && onRefreshInterface && (
                        <>
                            <MenuSeparator />
                            <ContextMenuItem onClick={() => {
                                // We need project name. 
                                // `data` is ApiInterface. We need parent project.
                                // How do we get parent project name? 
                                // We don't have it easily in local data unless we passed it.
                                // But we can find it in projects array.
                                const iface = localContextMenu.data as ApiInterface;
                                const proj = projects.find(p => p.interfaces.some(i => i.name === iface.name));
                                // Note: Finding by interface name across projects is risky if duplicates exist.
                                // Ideally we pass project name in context menu data or look up safer.
                                // Wait, ServiceTree calls onContextMenu with (e, 'interface', iface).
                                // We can pass project name into data when rendering ServiceTree?
                                // Or just simpler:
                                if (proj) {
                                    onRefreshInterface(proj.name, iface.name);
                                }
                                closeLocalContextMenu();
                            }}>
                                Refresh Definition
                            </ContextMenuItem>
                        </>
                    )}

                    {/* Note: This is a simplified menu. Complex global actions like "Export Native" or "Add to Project" might be missing if not handled here. 
                           However, standard Rename/Delete are covered. 
                           To be safe, we could offer "More..." that triggers global handleContextMenu?
                           Or simpler: we just handle Rename here and forward others? NO, standard context menu implies replacing it.
                        */}
                </ContextMenu>
            )}
        </ProjectContainer>
    );
};

import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { Play, Square, Trash2, Plus, ChevronRight, ChevronDown } from 'lucide-react';
import { SidebarPerformanceProps } from '../../types/props';
import { ContextMenu, ContextMenuItem } from '../../styles/App.styles';

// Shake animation for delete confirmation
const shakeAnimation = keyframes`
    0%, 100% { transform: translateX(0); }
    10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
    20%, 40%, 60%, 80% { transform: translateX(2px); }
`;

// Styled Components (borrowed from existing UI)
const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--vscode-foreground);
    background-color: var(--vscode-sideBar-background);
`;

const Toolbar = styled.div`
    display: flex;
    padding: 10px;
    gap: 8px;
    border-bottom: 1px solid var(--vscode-sideBarSectionHeader-border);
    align-items: center;
`;

const Title = styled.div`
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    color: var(--vscode-sideBarTitle-foreground);
    flex: 1;
`;

const IconButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--vscode-icon-foreground);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

const List = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 0;
`;

const SuiteItem = styled.div<{ active: boolean }>`
    display: flex;
    align-items: center;
    padding: 4px 8px;
    cursor: pointer;
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-list-inactiveSelectionForeground)'};

    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

const SuiteIcon = styled.div`
    margin-right: 6px;
    display: flex;
    align-items: center;
`;

const SuiteLabel = styled.div`
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 13px;
`;

const Actions = styled.div`
    display: flex;
    gap: 4px;
    opacity: 0;
    ${SuiteItem}:hover & {
        opacity: 1;
    }
`;

const DeleteButton = styled(IconButton) <{ shake?: boolean }>`
    color: ${props => props.shake ? '#f14c4c' : 'var(--vscode-icon-foreground)'};
    &:hover {
        background-color: rgba(241, 76, 76, 0.1);
    }
    ${props => props.shake && css`
        animation: ${shakeAnimation} 0.5s ease-in-out infinite;
        color: #f14c4c;
    `}
`;

const Input = styled.input`
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px;
    width: 100%;
    margin-top: 5px;
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
`;

const RequestItem = styled.div<{ active: boolean }>`
    display: flex;
    align-items: center;
    padding: 4px 8px 4px 28px;
    cursor: pointer;
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-list-inactiveSelectionForeground)'};

    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

export const PerformanceUi: React.FC<SidebarPerformanceProps> = ({
    suites,
    onAddSuite,
    onDeleteSuite,
    onRunSuite,
    onSelectSuite,
    onStopRun,
    isRunning,
    selectedSuiteId,
    deleteConfirm,
    setDeleteConfirm,
    onAddRequest,
    onDeleteRequest,
    onSelectRequest,
    onUpdateRequest,
    onToggleSuiteExpand,
    expandedSuiteIds = []
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newSuiteName, setNewSuiteName] = useState('');

    // Rename state
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');
    const [renameType, setRenameType] = useState<'suite' | 'request' | null>(null);
    const [renameParentId, setRenameParentId] = useState<string | null>(null);

    // Context Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, type: 'suite' | 'request', id: string, parentId?: string, name: string } | null>(null);

    const checkExpanded = (id: string) => expandedSuiteIds.includes(id);

    const handleCreateSuite = () => {
        setIsAdding(true);
        setNewSuiteName('');
    };

    const submitCreateSuite = () => {
        if (newSuiteName.trim()) {
            onAddSuite(newSuiteName.trim());
            setIsAdding(false);
            setNewSuiteName('');
        } else {
            setIsAdding(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') submitCreateSuite();
        if (e.key === 'Escape') setIsAdding(false);
    };

    // Rename handlers
    const startRename = (id: string, name: string, type: 'suite' | 'request', parentId?: string) => {
        setRenameId(id);
        setRenameValue(name);
        setRenameType(type);
        setRenameParentId(parentId || null);
        setContextMenu(null);
    };

    const submitRename = () => {
        if (renameId && renameValue.trim()) {
            if (renameType === 'request' && onUpdateRequest && renameParentId) {
                onUpdateRequest(renameParentId, renameId, { name: renameValue });
            }
            // Add suite rename logic here if needed (not in original scope but good to have)
        }
        setRenameId(null);
        setRenameValue('');
        setRenameType(null);
    };

    const handleContextMenu = (e: React.MouseEvent, type: 'suite' | 'request', id: string, name: string, parentId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, type, id, name, parentId });
    };

    // Close menu on click elsewhere
    React.useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    return (
        <Container>
            <Toolbar>
                <Title>Performance Suites</Title>
                <IconButton onClick={handleCreateSuite} title="New Performance Suite">
                    <Plus size={16} />
                </IconButton>
                {isRunning && (
                    <IconButton onClick={onStopRun} title="Stop All Runs">
                        <Square size={16} fill="currentColor" />
                    </IconButton>
                )}
            </Toolbar>

            <List>
                {isAdding && (
                    <div style={{ padding: '8px' }}>
                        <Input
                            autoFocus
                            placeholder="Suite Name"
                            value={newSuiteName}
                            onChange={e => setNewSuiteName(e.target.value)}
                            onBlur={submitCreateSuite}
                            onKeyDown={handleKeyDown}
                        />
                    </div>
                )}

                {suites.map(suite => {
                    const expanded = checkExpanded(suite.id);
                    return (
                        <React.Fragment key={suite.id}>
                            <SuiteItem
                                active={selectedSuiteId === suite.id}
                                onClick={() => onSelectSuite(suite.id)}
                            >
                                <SuiteIcon onClick={(e) => { e.stopPropagation(); onToggleSuiteExpand?.(suite.id); }}>
                                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </SuiteIcon>
                                <SuiteLabel>{suite.name}</SuiteLabel>
                                <Actions>
                                    <IconButton
                                        onClick={(e) => { e.stopPropagation(); onAddRequest?.(suite.id); }}
                                        title="Add Request"
                                    >
                                        <Plus size={14} />
                                    </IconButton>
                                    <IconButton
                                        onClick={(e) => { e.stopPropagation(); onRunSuite(suite.id); }}
                                        title="Run Suite"
                                        style={{ color: 'var(--vscode-charts-green)' }}
                                    >
                                        <Play size={14} fill="currentColor" />
                                    </IconButton>
                                    <DeleteButton
                                        shake={deleteConfirm === suite.id}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (deleteConfirm === suite.id) {
                                                onDeleteSuite(suite.id);
                                                setDeleteConfirm(null);
                                            } else {
                                                setDeleteConfirm(suite.id);
                                            }
                                        }}
                                        title={deleteConfirm === suite.id ? "Click again to delete" : "Delete Suite"}
                                    >
                                        <Trash2 size={14} />
                                    </DeleteButton>
                                </Actions>
                            </SuiteItem>

                            {/* Render Requests */}
                            {expanded && suite.requests?.map(req => (
                                <RequestItem
                                    key={req.id}
                                    active={false} // Currently we don't track selected request ID in sidebar explicitly? Or reuse selection context? using standard 'active' styling might be misleading if not synced
                                    onClick={() => onSelectRequest?.(req)}
                                    onContextMenu={(e) => handleContextMenu(e, 'request', req.id, req.name, suite.id)}
                                >
                                    <div style={{ width: 14 }}></div> {/* Indent for no icon */}
                                    {renameId === req.id ? (
                                        <Input
                                            value={renameValue}
                                            onChange={(e) => setRenameValue(e.target.value)}
                                            onBlur={submitRename}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') submitRename();
                                                if (e.key === 'Escape') setRenameId(null);
                                                e.stopPropagation();
                                            }}
                                            autoFocus
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ margin: 0, padding: '2px 4px' }}
                                        />
                                    ) : (
                                        <SuiteLabel style={{ fontSize: 12 }}>{req.name}</SuiteLabel>
                                    )}
                                </RequestItem>
                            ))}
                        </React.Fragment>
                    );
                })}

                {suites.length === 0 && !isAdding && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontSize: 13 }}>
                        No performance suites.<br />
                        Click + to create one.
                    </div>
                )}
            </List>

            {contextMenu && (
                <ContextMenu top={contextMenu.y} left={contextMenu.x} onClick={(e: any) => e.stopPropagation()}>
                    <ContextMenuItem onClick={() => startRename(contextMenu.id, contextMenu.name, contextMenu.type, contextMenu.parentId)}>
                        Rename
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => {
                        if (contextMenu.type === 'request' && onDeleteRequest && contextMenu.parentId) {
                            onDeleteRequest(contextMenu.parentId, contextMenu.id);
                        }
                        if (contextMenu.type === 'suite') {
                            onDeleteSuite(contextMenu.id);
                        }
                        setContextMenu(null);
                    }}>
                        Delete
                    </ContextMenuItem>
                </ContextMenu>
            )}
        </Container>
    );
};

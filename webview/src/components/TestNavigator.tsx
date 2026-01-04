import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { SoapUIProject } from '../models';
import { Play, Plus, ChevronRight, ChevronDown, FlaskConical, Folder, Trash2 } from 'lucide-react';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--vscode-foreground);
`;

const Toolbar = styled.div`
    display: flex;
    align-items: center;
    padding: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--vscode-sideBarTitle-foreground);
`;

// Shake animation for delete confirmation
const shakeAnimation = keyframes`
    0% { transform: translateX(0); }
    25% { transform: translateX(2px) rotate(5deg); }
    50% { transform: translateX(-2px) rotate(-5deg); }
    75% { transform: translateX(2px) rotate(5deg); }
    100% { transform: translateX(0); }
`;

const IconButton = styled.button<{ shake?: boolean }>`
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-icon-foreground);
    padding: 2px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
    }
    
    ${props => props.shake && css`
        animation: ${shakeAnimation} 0.5s ease-in-out infinite;
        color: var(--vscode-errorForeground);
    `}
`;

const TreeItem = styled.div<{ depth: number, active?: boolean }>`
    padding: 4px 8px;
    padding-left: ${props => props.depth * 16 + 8}px;
    cursor: pointer;
    display: flex;
    align-items: center;
    font-size: 13px;
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};

    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

interface TestNavigatorProps {
    projects: SoapUIProject[];
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onRunCase: (caseId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onRenameTestCase?: (caseId: string, newName: string) => void;
}

export const TestNavigator: React.FC<TestNavigatorProps> = ({
    projects,
    onAddSuite,
    onDeleteSuite,
    onRunSuite,
    onAddTestCase,
    onRunCase,
    onDeleteTestCase,
    onRenameTestCase
}) => {
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameName, setRenameName] = useState<string>('');

    const toggleExpand = (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleDeleteSuite = (suiteId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (deleteConfirmId === suiteId) {
            onDeleteSuite(suiteId);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(suiteId);
        }
    };

    const handleDeleteTestCase = (caseId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (deleteConfirmId === caseId) {
            onDeleteTestCase(caseId);
            setDeleteConfirmId(null);
        } else {
            setDeleteConfirmId(caseId);
        }
    };

    const startRename = (caseId: string, currentName: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setRenameId(caseId);
        setRenameName(currentName);
    };

    const submitRename = () => {
        if (renameId && renameName.trim() && onRenameTestCase) {
            onRenameTestCase(renameId, renameName.trim());
        }
        setRenameId(null);
        setRenameName('');
    };

    const cancelRename = () => {
        setRenameId(null);
        setRenameName('');
    };

    console.log(`[TestNavigator] Rendering with ${projects.length} projects`);
    projects.forEach(p => console.log(`[TestNavigator] Project ${p.name} has ${p.testSuites?.length || 0} suites`));

    return (
        <Container>
            <Toolbar>
                <div style={{ fontWeight: 'bold' }}>Test Runner</div>
                {/* Global Run All Button? */}
            </Toolbar>

            <div style={{ flex: 1, overflowY: 'auto' }}>
                {projects.map(p => (
                    <div key={p.name}> {/* Using p.name as key, assuming it's unique */}
                        <TreeItem depth={0} onClick={(e) => toggleExpand(p.name, e)}>
                            {expandedIds.has(p.name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            <Folder size={14} style={{ marginRight: 6, marginLeft: 4 }} />
                            {p.name}
                            <div style={{ marginLeft: 'auto' }}>
                                <IconButton onClick={(e) => {
                                    e.stopPropagation();
                                    onAddSuite(p.name);
                                }} title="Add Test Suite">
                                    <Plus size={14} />
                                </IconButton>
                            </div>
                        </TreeItem>
                        {expandedIds.has(p.name) && (
                            <div>
                                {(p.testSuites || []).map(suite => (
                                    <div key={suite.id}>
                                        <TreeItem
                                            depth={1}
                                            onClick={(e) => toggleExpand(suite.id, e)}
                                        >
                                            {expandedIds.has(suite.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            <FlaskConical size={14} style={{ marginRight: 6, marginLeft: 4 }} />
                                            {suite.name}
                                            <div style={{ marginLeft: 'auto', display: 'flex' }}>
                                                <IconButton onClick={(e) => {
                                                    e.stopPropagation();
                                                    onAddTestCase(suite.id);
                                                }} title="New Test Case">
                                                    <Plus size={14} />
                                                </IconButton>
                                                <IconButton onClick={(e) => {
                                                    e.stopPropagation();
                                                    onRunSuite(suite.id);
                                                }} title="Run Suite">
                                                    <Play size={14} />
                                                </IconButton>
                                                <IconButton
                                                    onClick={(e) => handleDeleteSuite(suite.id, e)}
                                                    title={deleteConfirmId === suite.id ? "Click again to confirm" : "Delete Suite"}
                                                    shake={deleteConfirmId === suite.id}
                                                >
                                                    <Trash2 size={14} />
                                                </IconButton>
                                            </div>
                                        </TreeItem>
                                        {expandedIds.has(suite.id) && (
                                            <div>
                                                {(suite.testCases || []).map(tc => (
                                                    <TreeItem
                                                        key={tc.id}
                                                        depth={2}
                                                        onClick={(e) => toggleExpand(tc.id, e)}
                                                        onContextMenu={(e) => startRename(tc.id, tc.name, e)}
                                                    >
                                                        <Play size={12} style={{ opacity: 0.7, marginRight: 8, marginLeft: 4 }} />
                                                        {renameId === tc.id ? (
                                                            <input
                                                                type="text"
                                                                value={renameName}
                                                                onChange={(e) => setRenameName(e.target.value)}
                                                                onBlur={submitRename}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') submitRename();
                                                                    if (e.key === 'Escape') cancelRename();
                                                                }}
                                                                onClick={(e) => e.stopPropagation()}
                                                                autoFocus
                                                                style={{
                                                                    background: 'var(--vscode-input-background)',
                                                                    border: '1px solid var(--vscode-input-border)',
                                                                    color: 'var(--vscode-input-foreground)',
                                                                    padding: '2px 4px',
                                                                    flex: 1,
                                                                    fontSize: '13px',
                                                                    outline: 'none'
                                                                }}
                                                            />
                                                        ) : (
                                                            <span title="Right-click to rename">{tc.name}</span>
                                                        )}
                                                        <div style={{ marginLeft: 'auto', display: 'flex' }}>
                                                            <IconButton onClick={(e) => {
                                                                e.stopPropagation();
                                                                onRunCase(tc.id);
                                                            }} title="Run Case">
                                                                <Play size={12} />
                                                            </IconButton>
                                                            <IconButton
                                                                onClick={(e) => handleDeleteTestCase(tc.id, e)}
                                                                title={deleteConfirmId === tc.id ? "Click again to confirm" : "Delete Case"}
                                                                shake={deleteConfirmId === tc.id}
                                                            >
                                                                <Trash2 size={12} />
                                                            </IconButton>
                                                        </div>
                                                    </TreeItem>
                                                ))}

                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </Container>
    );
};

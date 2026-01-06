import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Plus, Trash2, ChevronDown, ChevronRight, FlaskConical, FolderOpen, ListChecks, Edit2 } from 'lucide-react';
import { SoapUIProject, SoapTestSuite } from '@shared/models';
import { HeaderButton, OperationItem, RequestItem } from './shared/SidebarStyles';

export interface TestsUiProps {
    projects: SoapUIProject[];
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onRenameTestCase?: (caseId: string, newName: string) => void;
    onRunCase: (caseId: string) => void;
    onSelectSuite: (suiteId: string) => void;
    onSelectTestCase: (caseId: string) => void;
    onToggleSuiteExpand: (suiteId: string) => void;
    onToggleCaseExpand: (caseId: string) => void;
    deleteConfirm: string | null;
}

interface FlatSuite {
    suite: SoapTestSuite;
    projectName: string;
}

// Context menu styled components
const ContextMenuOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1000;
`;

const ContextMenuDropdown = styled.div<{ x: number; y: number }>`
    position: fixed;
    top: ${props => props.y}px;
    left: ${props => props.x}px;
    background: var(--vscode-menu-background);
    border: 1px solid var(--vscode-menu-border);
    border-radius: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
    z-index: 1001;
    min-width: 150px;
    padding: 4px 0;
`;

const ContextMenuItem = styled.div`
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--vscode-menu-foreground);
    
    &:hover {
        background: var(--vscode-menu-selectionBackground);
        color: var(--vscode-menu-selectionForeground);
    }
`;

export const TestsUi: React.FC<TestsUiProps> = ({
    projects,
    onAddSuite,
    onDeleteSuite,
    onRunSuite,
    onAddTestCase,
    onDeleteTestCase,
    onRenameTestCase,
    onRunCase,
    onSelectSuite,
    onSelectTestCase,
    onToggleSuiteExpand,
    onToggleCaseExpand: _onToggleCaseExpand,
    deleteConfirm
}) => {
    const [showAddSuiteMenu, setShowAddSuiteMenu] = useState(false);
    const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
    const [selectedSuiteId, setSelectedSuiteId] = useState<string | null>(null);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameName, setRenameName] = useState<string>('');

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; caseId: string; caseName: string } | null>(null);

    const handleContextMenu = (caseId: string, caseName: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, caseId, caseName });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const handleRenameFromMenu = () => {
        if (contextMenu) {
            setRenameId(contextMenu.caseId);
            setRenameName(contextMenu.caseName);
            closeContextMenu();
        }
    };

    const submitRename = () => {
        console.log('[TestsUi] submitRename called:', { renameId, renameName, hasCallback: !!onRenameTestCase });
        if (renameId && renameName.trim() && onRenameTestCase) {
            console.log('[TestsUi] Calling onRenameTestCase');
            onRenameTestCase(renameId, renameName.trim());
        }
        setRenameId(null);
        setRenameName('');
    };

    const cancelRename = () => {
        setRenameId(null);
        setRenameName('');
    };

    // Aggregate all test suites from all projects
    const allSuites: FlatSuite[] = projects.flatMap(p =>
        (p.testSuites || []).map(suite => ({ suite, projectName: p.name }))
    );



    return (
        <>
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--vscode-sideBarTitle-foreground)', flex: 1 }}>
                            Test Suites ({allSuites.length})
                        </div>
                        <div style={{ position: 'relative' }}>
                            <HeaderButton
                                onClick={() => setShowAddSuiteMenu(!showAddSuiteMenu)}
                                title="Add Test Suite"
                                style={{ padding: 4 }}
                            >
                                <Plus size={16} />
                            </HeaderButton>

                            {/* Project Selection Dropdown */}
                            {showAddSuiteMenu && (
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    right: 0,
                                    marginTop: 5,
                                    background: 'var(--vscode-dropdown-background)',
                                    border: '1px solid var(--vscode-dropdown-border)',
                                    borderRadius: 4,
                                    zIndex: 100,
                                    minWidth: 180,
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.2)'
                                }}>
                                    <div style={{ padding: '8px 10px', fontSize: '0.8em', opacity: 0.7, borderBottom: '1px solid var(--vscode-panel-border)' }}>
                                        Add suite to project:
                                    </div>
                                    {projects.length === 0 ? (
                                        <div style={{ padding: '10px', fontSize: '0.85em', opacity: 0.6 }}>
                                            No projects loaded
                                        </div>
                                    ) : (
                                        projects.map(p => (
                                            <div
                                                key={p.name}
                                                onClick={() => {
                                                    onAddSuite(p.name);
                                                    setShowAddSuiteMenu(false);
                                                }}
                                                style={{
                                                    padding: '8px 12px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6
                                                }}
                                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
                                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <FolderOpen size={14} />
                                                {p.name}
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Empty State */}
                    {allSuites.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 30, opacity: 0.6 }}>
                            <FlaskConical size={40} style={{ marginBottom: 10 }} />
                            <div>No test suites yet.</div>
                            <div style={{ fontSize: '0.85em', marginTop: 5 }}>
                                Click + to add a test suite.
                            </div>
                        </div>
                    )}

                    {/* Unique Test Suites List (Deduplicated) */}
                    {Array.from(new Map(projects.flatMap(p => (p.testSuites || []).map(s => [s.id, s]))).values()).map(suite => {
                        const isSuiteSelected = selectedSuiteId === suite.id && selectedCaseId === null;
                        return (
                            <div key={suite.id}>
                                {/* Suite Header */}
                                <OperationItem
                                    active={isSuiteSelected}
                                    onClick={() => {
                                        // Toggle suite selection and notify parent
                                        if (isSuiteSelected) {
                                            setSelectedSuiteId(null);
                                        } else {
                                            setSelectedSuiteId(suite.id);
                                            setSelectedCaseId(null); // Clear case selection
                                            onSelectSuite(suite.id); // Notify parent
                                        }
                                    }}
                                    style={{ paddingLeft: 8 }}
                                >
                                    <span
                                        onClick={(e) => { e.stopPropagation(); onToggleSuiteExpand(suite.id); }}
                                        style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        {suite.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </span>
                                    <ListChecks size={14} style={{ marginLeft: 4 }} />
                                    <span style={{ flex: 1, marginLeft: 6, fontWeight: 'bold' }}>{suite.name}</span>
                                    <span style={{ fontSize: '0.8em', opacity: 0.6, marginRight: 6 }}>
                                        ({suite.testCases?.length || 0})
                                    </span>
                                    {isSuiteSelected && (
                                        <>
                                            <HeaderButton onClick={(e) => { e.stopPropagation(); onRunSuite(suite.id); }} title="Run Suite" style={{ padding: 2 }}>
                                                <Play size={12} />
                                            </HeaderButton>
                                            <HeaderButton onClick={(e) => { e.stopPropagation(); onAddTestCase(suite.id); }} title="Add Test Case" style={{ padding: 2 }}>
                                                <Plus size={12} />
                                            </HeaderButton>
                                            <HeaderButton
                                                onClick={(e) => { e.stopPropagation(); onDeleteSuite(suite.id); }}
                                                title={deleteConfirm === suite.id ? 'Click again to confirm' : 'Delete Suite'}
                                                style={{ padding: 2, color: deleteConfirm === suite.id ? 'var(--vscode-testing-iconFailed)' : undefined }}
                                            >
                                                <Trash2 size={12} />
                                            </HeaderButton>
                                        </>
                                    )}
                                </OperationItem>

                                {/* Test Cases */}
                                {suite.expanded !== false && (suite.testCases || []).map(tc => {
                                    const isSelected = selectedCaseId === tc.id;
                                    return (
                                        <RequestItem
                                            key={tc.id}
                                            active={isSelected}
                                            onClick={() => {
                                                // Select case and notify parent
                                                if (isSelected) {
                                                    setSelectedCaseId(null);
                                                } else {
                                                    setSelectedCaseId(tc.id);
                                                    setSelectedSuiteId(null); // Clear suite selection
                                                    onSelectTestCase(tc.id); // Notify parent
                                                }
                                            }}
                                            onContextMenu={(e) => handleContextMenu(tc.id, tc.name, e)}
                                            style={{ paddingLeft: 35 }}
                                        >
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
                                                        fontSize: '12px',
                                                        outline: 'none'
                                                    }}
                                                />
                                            ) : (
                                                <span style={{ flex: 1 }} title="Right-click to rename">{tc.name}</span>
                                            )}
                                            <span style={{ fontSize: '0.75em', opacity: 0.6, marginRight: 6 }}>
                                                {tc.steps?.length || 0} steps
                                            </span>
                                            {isSelected && (
                                                <>
                                                    <HeaderButton onClick={(e) => { e.stopPropagation(); onRunCase(tc.id); }} title="Run Test Case" style={{ padding: 2 }}>
                                                        <Play size={12} />
                                                    </HeaderButton>
                                                    <HeaderButton
                                                        onClick={(e) => { e.stopPropagation(); onDeleteTestCase(tc.id); }}
                                                        title={deleteConfirm === tc.id ? 'Click again to confirm' : 'Delete Case'}
                                                        style={{ padding: 2, color: deleteConfirm === tc.id ? 'var(--vscode-testing-iconFailed)' : undefined }}
                                                    >
                                                        <Trash2 size={12} />
                                                    </HeaderButton>
                                                </>
                                            )}
                                        </RequestItem>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <>
                    <ContextMenuOverlay onClick={closeContextMenu} />
                    <ContextMenuDropdown x={contextMenu.x} y={contextMenu.y}>
                        <ContextMenuItem onClick={handleRenameFromMenu}>
                            <Edit2 size={14} />
                            Rename
                        </ContextMenuItem>
                    </ContextMenuDropdown>
                </>
            )}
        </>
    );
};

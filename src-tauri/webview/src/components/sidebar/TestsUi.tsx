import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Plus, Trash2, ChevronDown, ChevronRight, FlaskConical, FolderOpen, ListChecks, Clock, FileCode, ArrowRight, FileText } from 'lucide-react';
import { UnifiedProject, TestSuite } from '@shared/models';
import { SidebarContextMenu, CtxMenuSection, CtxMenuItem, Pencil } from './shared/SidebarContextMenu';
import { SidebarContainer, SidebarContent, SidebarHeader, SidebarHeaderActions, SidebarHeaderTitle, OperationItem, RequestItem } from './shared/SidebarStyles';
import { EmptyState } from '../common/EmptyState';
import { HeaderButton } from '../common/Button';
import { InlineFormInput } from '../common/Form';
import { SPACING_SM, SPACING_XS } from '../../styles/spacing';

const StepItem = styled(RequestItem)`
    padding-left: 52px !important;
    font-size: 0.9em;
    opacity: 0.9;
    
    &:hover {
        opacity: 1;
    }
`;

const TestsContainer = styled(SidebarContainer)``;

const TestsContent = styled(SidebarContent)``;

const HeaderActions = styled.div`
    position: relative;
`;

const AddSuiteMenu = styled.div`
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: ${SPACING_XS};
    background: var(--apinox-dropdown-background);
    border: 1px solid var(--apinox-dropdown-border);
    border-radius: 4px;
    z-index: 100;
    min-width: 180px;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
`;

const AddSuiteMenuTitle = styled.div`
    padding: ${SPACING_SM} 10px;
    font-size: 0.8em;
    opacity: 0.7;
    border-bottom: 1px solid var(--apinox-panel-border);
`;

const AddSuiteMenuEmpty = styled.div`
    padding: 10px;
    font-size: 0.85em;
    opacity: 0.6;
`;

const AddSuiteMenuItem = styled.div<{ $disabled?: boolean }>`
    padding: ${SPACING_SM} 12px;
    cursor: ${props => props.$disabled ? 'not-allowed' : 'pointer'};
    display: flex;
    align-items: center;
    gap: ${SPACING_XS};
    opacity: ${props => props.$disabled ? 0.5 : 1};

    &:hover {
        background: ${props => props.$disabled ? 'transparent' : 'var(--apinox-list-hoverBackground)'};
    }
`;


const SuiteOperationItem = styled(OperationItem)`
    padding-left: 8px;
`;

const SuiteToggle = styled.span`
    cursor: pointer;
    display: flex;
    align-items: center;
`;

const SuiteIcon = styled.span`
    margin-left: ${SPACING_XS};
    display: flex;
    align-items: center;
`;

const SuiteName = styled.span`
    flex: 1;
    margin-left: ${SPACING_XS};
    font-weight: bold;
`;

const SuiteCount = styled.span`
    font-size: 0.8em;
    opacity: 0.6;
    margin-right: ${SPACING_XS};
`;

const CaseRequestItem = styled(RequestItem)`
    padding-left: 35px;
`;

const CaseToggle = styled.span`
    cursor: pointer;
    display: flex;
    align-items: center;
    margin-right: ${SPACING_XS};
    width: 14px;
`;

const CaseName = styled.span`
    flex: 1;
`;

const CaseCount = styled.span`
    font-size: 0.75em;
    opacity: 0.6;
    margin-right: ${SPACING_XS};
`;

const StepTypeIcon = styled.span`
    display: flex;
    align-items: center;
    margin-right: ${SPACING_XS};
    opacity: 0.7;
`;

const StepName = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const AddSuiteRow = styled.div`
    padding: ${SPACING_SM};
`;

export interface TestsUiProps {
    // Phase B (t_86c34d38): suites render from the UNIFIED store.
    projects: UnifiedProject[];
    selectedTestSuite?: TestSuite | null;
    selectedTestCase?: any | null;
    onAddSuite: (projectName: string, suiteName?: string) => void;
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
    onSelectTestStep?: (caseId: string, stepId: string) => void;
    onRenameTestStep?: (caseId: string, stepId: string, newName: string) => void;
    deleteConfirm: string | null;
}

interface FlatSuite {
    suite: TestSuite;
    projectName: string;
}

export const TestsUi: React.FC<TestsUiProps> = ({
    projects,
    selectedTestSuite,
    selectedTestCase,
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
    onToggleCaseExpand,
    onSelectTestStep,
    onRenameTestStep,
    deleteConfirm
}) => {
    const [showAddSuiteMenu, setShowAddSuiteMenu] = useState(false);
    const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
    const [renameId, setRenameId] = useState<string | null>(null);
    const [renameType, setRenameType] = useState<'case' | 'step' | 'suite' | null>(null);
    const [renameParentId, setRenameParentId] = useState<string | null>(null);
    const [renameName, setRenameName] = useState<string>('');
    
    // New suite creation state
    const [isAddingSuite, setIsAddingSuite] = useState(false);
    const [newSuiteName, setNewSuiteName] = useState('');
    const [newSuiteProjectName, setNewSuiteProjectName] = useState('');

    // Context menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; caseId: string; stepId?: string; name: string; type: 'case' | 'step' } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, caseId: string, name: string, type: 'case' | 'step', stepId?: string) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, caseId, name, type, stepId });
    };

    const closeContextMenu = () => {
        setContextMenu(null);
    };

    const handleRenameFromMenu = () => {
        if (contextMenu) {
            setRenameId(contextMenu.stepId || contextMenu.caseId);
            setRenameType(contextMenu.type);
            setRenameParentId(contextMenu.caseId); // For steps, caseId is parent. For cases, it's just caseId (unused as parent)
            setRenameName(contextMenu.name);
            closeContextMenu();
        }
    };

    const submitRename = () => {
        console.log('[TestsUi] submitRename called:', { renameId, renameName, renameType, renameParentId });
        if (renameId && renameName.trim()) {
            if (renameType === 'step' && renameParentId && onRenameTestStep) {
                console.log('[TestsUi] Calling onRenameTestStep');
                onRenameTestStep(renameParentId, renameId, renameName.trim());
            } else if (renameType === 'case' && onRenameTestCase) {
                console.log('[TestsUi] Calling onRenameTestCase');
                onRenameTestCase(renameId, renameName.trim());
            }
        }
        setRenameId(null);
        setRenameType(null);
        setRenameParentId(null);
        setRenameName('');
    };

    const cancelRename = () => {
        setRenameId(null);
        setRenameType(null);
        setRenameParentId(null);
        setRenameName('');
    };

    // New suite creation handlers
    const handleProjectSelect = (projectName: string) => {
        const project = projects.find(p => p.name === projectName);
        if (!project) return;
        
        const suggestedName = `TestSuite ${((project.testSuites || []).length + 1)}`;
        setNewSuiteProjectName(projectName);
        setNewSuiteName(suggestedName);
        setIsAddingSuite(true);
        setShowAddSuiteMenu(false);
    };

    const submitNewSuite = () => {
        if (newSuiteName.trim() && newSuiteProjectName) {
            onAddSuite(newSuiteProjectName, newSuiteName.trim());
            setIsAddingSuite(false);
            setNewSuiteName('');
            setNewSuiteProjectName('');
        } else {
            setIsAddingSuite(false);
            setNewSuiteName('');
            setNewSuiteProjectName('');
        }
    };

    const cancelNewSuite = () => {
        setIsAddingSuite(false);
        setNewSuiteName('');
        setNewSuiteProjectName('');
    };

    // Aggregate all test suites from all projects
    const allSuites: FlatSuite[] = projects.flatMap(p =>
        (p.testSuites || []).map(suite => ({ suite, projectName: p.name }))
    );



    return (
        <>
            <TestsContainer>
                {/* Header */}
                <SidebarHeader>
                    <SidebarHeaderTitle>
                        Test Suites ({allSuites.length})
                    </SidebarHeaderTitle>
                    <SidebarHeaderActions>
                        <HeaderActions>
                            <HeaderButton
                                onClick={() => setShowAddSuiteMenu(!showAddSuiteMenu)}
                                title="Add Test Suite"
                            >
                                <Plus size={16} />
                            </HeaderButton>

                            {/* Project Selection Dropdown */}
                            {showAddSuiteMenu && (
                                <AddSuiteMenu>
                                    <AddSuiteMenuTitle>
                                        Add suite to project:
                                    </AddSuiteMenuTitle>
                                    {projects.length === 0 ? (
                                        <AddSuiteMenuEmpty>
                                            No projects loaded
                                        </AddSuiteMenuEmpty>
                                    ) : (
                                        projects.map(p => (
                                            <AddSuiteMenuItem
                                                key={p.name}
                                                onClick={() => {
                                                    if (p.readOnly) return; // Disable for read-only projects
                                                    handleProjectSelect(p.name);
                                                }}
                                                $disabled={p.readOnly}
                                                title={p.readOnly ? 'Workspace is read-only; cannot add suites.' : undefined}
                                            >
                                                <FolderOpen size={14} />
                                                {p.name}
                                            </AddSuiteMenuItem>
                                        ))
                                    )}
                                </AddSuiteMenu>
                            )}
                        </HeaderActions>
                    </SidebarHeaderActions>
                </SidebarHeader>

                <TestsContent>

                    {/* Inline Suite Name Input */}
                    {isAddingSuite && (
                        <AddSuiteRow>
                            <InlineFormInput
                                autoFocus
                                placeholder="Suite Name"
                                value={newSuiteName}
                                onChange={e => setNewSuiteName(e.target.value)}
                                onBlur={submitNewSuite}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') submitNewSuite();
                                    if (e.key === 'Escape') cancelNewSuite();
                                }}
                                style={{ width: '100%' }}
                            />
                        </AddSuiteRow>
                    )}

                    {/* Empty State */}
                    {allSuites.length === 0 && (
                        <EmptyState
                            icon={FlaskConical}
                            title="No test suites yet."
                            description="Click + to add a test suite."
                        />
                    )}

                    {/* Unique Test Suites List (Deduplicated) */}
                    {Array.from(new Map(projects.flatMap(p => (p.testSuites || []).map(s => [s.id, s]))).values()).map(suite => {
                        const isSuiteSelected = selectedTestSuite?.id === suite.id && !selectedTestCase;
                        return (
                            <div key={suite.id}>
                                {/* Suite Header */}
                                <SuiteOperationItem
                                    $active={isSuiteSelected}
                                    onClick={() => {
                                        // Notify parent - let context handle state
                                        onSelectSuite(suite.id);
                                    }}
                                >
                                    <SuiteToggle
                                        onClick={(e) => { e.stopPropagation(); onToggleSuiteExpand(suite.id); }}
                                    >
                                        {suite.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </SuiteToggle>
                                    <SuiteIcon>
                                        <ListChecks size={14} />
                                    </SuiteIcon>
                                    <SuiteName>{suite.name}</SuiteName>
                                    <SuiteCount>
                                        ({suite.testCases?.length || 0})
                                    </SuiteCount>
                                    {isSuiteSelected && (
                                        <>
                                            <HeaderButton onClick={(e) => { e.stopPropagation(); onRunSuite(suite.id); }} title="Run Suite">
                                                <Play size={12} />
                                            </HeaderButton>
                                            <HeaderButton onClick={(e) => { e.stopPropagation(); onAddTestCase(suite.id); }} title="Add Test Case">
                                                <Plus size={12} />
                                            </HeaderButton>
                                            <HeaderButton
                                                onClick={(e) => { e.stopPropagation(); onDeleteSuite(suite.id); }}
                                                title={deleteConfirm === suite.id ? 'Click again to confirm' : 'Delete Suite'}
                                                $shake={deleteConfirm === suite.id}
                                            >
                                                <Trash2 size={12} />
                                            </HeaderButton>
                                        </>
                                    )}
                                </SuiteOperationItem>

                                {/* Test Cases */}
                                {suite.expanded !== false && (suite.testCases || []).map(tc => {
                                    const isSelected = selectedTestCase?.id === tc.id;
                                    return (
                                        <React.Fragment key={tc.id}>
                                            <CaseRequestItem
                                                $active={isSelected}
                                                onClick={() => {
                                                    // Notify parent - let context handle state
                                                    onSelectTestCase(tc.id);
                                                }}
                                                onContextMenu={(e) => handleContextMenu(e, tc.id, tc.name, 'case')}
                                            >
                                                <CaseToggle
                                                    onClick={(e) => { e.stopPropagation(); onToggleCaseExpand(tc.id); }}
                                                >
                                                    {tc.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </CaseToggle>
                                                {renameId === tc.id ? (
                                                    <InlineFormInput
                                                        type="text"
                                                        title="Rename test case"
                                                        placeholder="Rename"
                                                        value={renameName}
                                                        onChange={(e) => setRenameName(e.target.value)}
                                                        onBlur={submitRename}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') submitRename();
                                                            if (e.key === 'Escape') cancelRename();
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        autoFocus
                                                    />
                                                ) : (
                                                    <CaseName title="Right-click to rename">{tc.name}</CaseName>
                                                )}
                                                <CaseCount>
                                                    {tc.steps?.length || 0}
                                                </CaseCount>
                                                {isSelected && (
                                                    <>
                                                        <HeaderButton onClick={(e) => { e.stopPropagation(); onRunCase(tc.id); }} title="Run Test Case">
                                                            <Play size={12} />
                                                        </HeaderButton>
                                                        <HeaderButton
                                                            onClick={(e) => { e.stopPropagation(); onDeleteTestCase(tc.id); }}
                                                            title={deleteConfirm === tc.id ? 'Click again to confirm' : 'Delete Case'}
                                                            $shake={deleteConfirm === tc.id}
                                                        >
                                                            <Trash2 size={12} />
                                                        </HeaderButton>
                                                    </>
                                                )}
                                            </CaseRequestItem>

                                            {/* Test Steps */}
                                            {tc.expanded !== false && (tc.steps || []).map(step => (
                                                <StepItem
                                                    key={step.id}
                                                    $active={selectedStepId === step.id}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedStepId(step.id);
                                                        // Also select the parent case if we want context, but usually explicit step selection is enough
                                                        // if (selectedCaseId !== tc.id) setSelectedCaseId(tc.id);
                                                        if (onSelectTestStep) onSelectTestStep(tc.id, step.id);
                                                    }}
                                                    onContextMenu={(e) => handleContextMenu(e, tc.id, step.name, 'step', step.id)}
                                                >
                                                    {renameId === step.id ? (
                                                        <InlineFormInput
                                                            type="text"
                                                            title="Rename test step"
                                                            placeholder="Rename"
                                                            value={renameName}
                                                            onChange={(e) => setRenameName(e.target.value)}
                                                            onBlur={submitRename}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') submitRename();
                                                                if (e.key === 'Escape') cancelRename();
                                                            }}
                                                            onClick={(e) => e.stopPropagation()}
                                                            autoFocus
                                                            style={{ marginLeft: '4px', fontSize: '0.9em' }}
                                                        />
                                                    ) : (
                                                        <>
                                                            <StepTypeIcon>
                                                                {(() => {
                                                                    switch (step.type) {
                                                                        case 'delay': return <Clock size={12} />;
                                                                        case 'transfer': return <ArrowRight size={12} />;
                                                                        case 'script': return <FileCode size={12} />;
                                                                        case 'request':
                                                                        default: return <FileText size={12} />;
                                                                    }
                                                                })()}
                                                            </StepTypeIcon>
                                                            <StepName title="Right-click to rename">
                                                                {step.name}
                                                            </StepName>
                                                        </>
                                                    )}
                                                </StepItem>
                                            ))}
                                        </React.Fragment>
                                    );
                                })}
                            </div>
                        );
                    })}
                </TestsContent>
            </TestsContainer>

            {/* Context Menu */}
            {contextMenu && (
                <SidebarContextMenu
                    x={contextMenu.x}
                    y={contextMenu.y}
                    sections={[{ title: 'Actions', items: [{ icon: Pencil, label: 'Rename', onClick: handleRenameFromMenu }] }] as CtxMenuSection[]}
                    onClose={closeContextMenu}
                />
            )}
        </>
    );
};

import React, { useState } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { SoapUIProject } from '@shared/models';
import { Play, Plus, ChevronRight, ChevronDown, FlaskConical, Trash2 } from 'lucide-react';

const shakeAnimation = keyframes`
  0% { transform: translateX(0); }
  25% { transform: translateX(-3px) rotate(-5deg); }
  50% { transform: translateX(3px) rotate(5deg); }
  75% { transform: translateX(-3px) rotate(-5deg); }
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
        animation: ${shakeAnimation} 0.4s ease-in-out infinite;
        color: var(--vscode-errorForeground) !important;
    `}
`;

const TreeItem = styled.div<{ depth: number, active?: boolean }>`
    padding: 2px 8px;
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

interface ProjectTestTreeProps {
    project: SoapUIProject;
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
    deleteConfirm?: string | null;
    setDeleteConfirm?: (id: string | null) => void;

}

export const ProjectTestTree: React.FC<ProjectTestTreeProps> = ({
    project,
    onAddSuite,
    onDeleteSuite,
    onRunSuite,
    onAddTestCase,
    onDeleteTestCase,
    onSelectSuite,
    onSelectTestCase,
    onToggleSuiteExpand,
    onToggleCaseExpand,
    deleteConfirm

}) => {
    const [rootExpanded, setRootExpanded] = useState(true);

    return (
        <div>
            {/* Suites Header - acts as root of tests for this project */}
            <TreeItem depth={0} onClick={(e) => { e.stopPropagation(); setRootExpanded(!rootExpanded); }}>
                {rootExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <FlaskConical size={14} style={{ marginRight: 6, marginLeft: 4 }} />
                Test Suites
                <div style={{ marginLeft: 'auto' }}>
                    <IconButton onClick={(e) => {
                        e.stopPropagation();
                        onAddSuite(project.name);
                    }} title="Add Test Suite">
                        <Plus size={14} />
                    </IconButton>
                </div>
            </TreeItem>

            {rootExpanded && (
                <div>
                    {(project.testSuites || []).map(suite => (
                        <div key={suite.id}>
                            <TreeItem
                                depth={1}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleSuiteExpand?.(suite.id);
                                    onSelectSuite?.(suite.id);
                                }}
                            >
                                {suite.expanded !== false ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
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
                                        console.log('[ProjectTestTree] Run Suite clicked, suiteId:', suite.id);
                                        onRunSuite(suite.id);
                                    }} title="Run Suite">
                                        <Play size={14} />
                                    </IconButton>

                                    <IconButton onClick={(e) => {
                                        e.stopPropagation();
                                        console.log('[ProjectTestTree] Delete Suite clicked, suiteId:', suite.id);
                                        onDeleteSuite(suite.id);
                                    }}
                                        title={deleteConfirm === suite.id ? "Click again to Confirm" : "Delete Suite"}
                                        style={{ color: deleteConfirm === suite.id ? 'var(--vscode-errorForeground)' : undefined }}
                                        shake={deleteConfirm === suite.id}
                                    >
                                        <Trash2 size={14} />
                                    </IconButton>
                                </div>
                            </TreeItem>
                            {suite.expanded !== false && (
                                <div>
                                    {(suite.testCases || []).map(tc => (
                                        <TreeItem
                                            key={tc.id}
                                            depth={2}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onToggleCaseExpand?.(tc.id);
                                                onSelectTestCase?.(tc.id);
                                            }}
                                        >
                                            {tc.expanded !== false ? <ChevronDown size={12} style={{ marginRight: 4 }} /> : <ChevronRight size={12} style={{ marginRight: 4 }} />}
                                            {tc.name}
                                            <div style={{ marginLeft: 'auto', display: 'flex' }}>

                                                <IconButton onClick={(e) => {
                                                    e.stopPropagation();
                                                    console.log('[ProjectTestTree] Delete Test Case clicked, caseId:', tc.id);
                                                    onDeleteTestCase(tc.id);
                                                }}
                                                    title={deleteConfirm === tc.id ? "Click again to Confirm" : "Delete Case"}
                                                    style={{ color: deleteConfirm === tc.id ? 'var(--vscode-errorForeground)' : undefined }}
                                                    shake={deleteConfirm === tc.id}
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
    );
};

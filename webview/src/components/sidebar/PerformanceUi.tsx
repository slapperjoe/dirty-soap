import React, { useState } from 'react';
import styled from 'styled-components';
import { Play, Square, Trash2, Plus, ChevronRight } from 'lucide-react';
import { SidebarPerformanceProps } from '../../types/props';

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

const DeleteButton = styled(IconButton)`
    color: #f14c4c;
    &:hover {
        background-color: rgba(241, 76, 76, 0.1);
    }
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
    setDeleteConfirm
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newSuiteName, setNewSuiteName] = useState('');

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

                {suites.map(suite => (
                    <div key={suite.id}>
                        {deleteConfirm === suite.id ? (
                            <div style={{ padding: '8px', background: 'var(--vscode-inputValidation-errorBackground)', border: '1px solid var(--vscode-inputValidation-errorBorder)' }}>
                                <div style={{ marginBottom: 5, fontSize: 12 }}>Delete {suite.name}?</div>
                                <div style={{ display: 'flex', gap: 5 }}>
                                    <button
                                        onClick={() => { onDeleteSuite(suite.id); setDeleteConfirm(null); }}
                                        style={{ background: '#f14c4c', color: 'white', border: 'none', padding: '4px 8px', borderRadius: 3, cursor: 'pointer' }}
                                    >
                                        Delete
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(null)}
                                        style={{ background: 'transparent', border: '1px solid currentColor', color: 'var(--vscode-foreground)', padding: '4px 8px', borderRadius: 3, cursor: 'pointer' }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <SuiteItem
                                active={selectedSuiteId === suite.id}
                                onClick={() => onSelectSuite(suite.id)}
                            >
                                <SuiteIcon>
                                    <ChevronRight size={14} />
                                </SuiteIcon>
                                <SuiteLabel>{suite.name}</SuiteLabel>
                                <Actions>
                                    <IconButton
                                        onClick={(e) => { e.stopPropagation(); onRunSuite(suite.id); }}
                                        title="Run Suite"
                                        style={{ color: 'var(--vscode-charts-green)' }}
                                    >
                                        <Play size={14} fill="currentColor" />
                                    </IconButton>
                                    <DeleteButton
                                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(suite.id); }}
                                        title="Delete Suite"
                                    >
                                        <Trash2 size={14} />
                                    </DeleteButton>
                                </Actions>
                            </SuiteItem>
                        )}
                    </div>
                ))}

                {suites.length === 0 && !isAdding && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--vscode-descriptionForeground)', fontSize: 13 }}>
                        No performance suites.<br />
                        Click + to create one.
                    </div>
                )}
            </List>
        </Container>
    );
};

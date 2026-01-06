/**
 * ImportRequestsModal Component
 * 
 * Modal for selecting requests from workspace projects to import into a performance suite.
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import { X, ChevronRight, ChevronDown, Check } from 'lucide-react';
import { SoapUIProject, SoapUIRequest } from '@shared/models';

const Overlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
`;

const Modal = styled.div`
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 8px;
    min-width: 500px;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 15px 20px;
    border-bottom: 1px solid var(--vscode-panel-border);
    
    h2 {
        margin: 0;
        font-size: 1.1em;
    }
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-foreground);
    opacity: 0.7;
    &:hover { opacity: 1; }
`;

const Content = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 15px 20px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const Button = styled.button<{ primary?: boolean }>`
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    border: none;
    background: ${props => props.primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)'};
    color: ${props => props.primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)'};
    
    &:hover {
        opacity: 0.9;
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const TreeItem = styled.div<{ level: number; selected?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    padding-left: ${props => 10 + props.level * 16}px;
    cursor: pointer;
    border-radius: 4px;
    background: ${props => props.selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const Checkbox = styled.div<{ checked: boolean }>`
    width: 16px;
    height: 16px;
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${props => props.checked ? 'var(--vscode-checkbox-background)' : 'transparent'};
    color: var(--vscode-checkbox-foreground);
`;

const EmptyState = styled.div`
    padding: 40px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
`;

interface ImportRequestsModalProps {
    open: boolean;
    onClose: () => void;
    onImport: (requests: SoapUIRequest[]) => void;
    projects: SoapUIProject[];
}

interface ExpandedState {
    projects: Set<string>;
    interfaces: Set<string>;
    operations: Set<string>;
}

export const ImportRequestsModal: React.FC<ImportRequestsModalProps> = ({
    open,
    onClose,
    onImport,
    projects
}) => {
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<ExpandedState>({
        projects: new Set(),
        interfaces: new Set(),
        operations: new Set()
    });

    if (!open) return null;

    const toggleExpanded = (type: keyof ExpandedState, id: string) => {
        setExpanded(prev => {
            const newSet = new Set(prev[type]);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return { ...prev, [type]: newSet };
        });
    };

    const toggleSelected = (requestId: string) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(requestId)) {
                newSet.delete(requestId);
            } else {
                newSet.add(requestId);
            }
            return newSet;
        });
    };

    const handleImport = () => {
        const requests: SoapUIRequest[] = [];
        for (const project of projects) {
            for (const iface of project.interfaces) {
                for (const op of iface.operations) {
                    for (const req of op.requests) {
                        const reqId = req.id || req.name;
                        if (reqId && selected.has(reqId)) {
                            requests.push(req);
                        }
                    }
                }
            }
        }
        onImport(requests);
        onClose();
        setSelected(new Set());
    };

    const selectAll = () => {
        const allIds = new Set<string>();
        for (const project of projects) {
            for (const iface of project.interfaces) {
                for (const op of iface.operations) {
                    for (const req of op.requests) {
                        const reqId = req.id || req.name;
                        if (reqId) allIds.add(reqId);
                    }
                }
            }
        }
        setSelected(allIds);
    };

    const totalRequests = projects.reduce((sum, p) =>
        sum + p.interfaces.reduce((iSum, i) =>
            iSum + i.operations.reduce((oSum, o) => oSum + o.requests.length, 0), 0), 0);

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={e => e.stopPropagation()}>
                <Header>
                    <h2>Import Requests from Workspace</h2>
                    <CloseButton onClick={onClose}><X size={18} /></CloseButton>
                </Header>

                <Content>
                    {projects.length === 0 || totalRequests === 0 ? (
                        <EmptyState>
                            No requests available in workspace.
                            <br />
                            Load a WSDL and add requests to projects first.
                        </EmptyState>
                    ) : (
                        <>
                            <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.9em', opacity: 0.7 }}>
                                    {selected.size} of {totalRequests} selected
                                </span>
                                <Button onClick={selectAll}>Select All</Button>
                            </div>

                            {projects.map(project => (
                                <div key={project.name}>
                                    <TreeItem
                                        level={0}
                                        onClick={() => toggleExpanded('projects', project.name)}
                                    >
                                        {expanded.projects.has(project.name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        <strong>{project.name}</strong>
                                    </TreeItem>

                                    {expanded.projects.has(project.name) && project.interfaces.map(iface => (
                                        <div key={iface.name}>
                                            <TreeItem
                                                level={1}
                                                onClick={() => toggleExpanded('interfaces', iface.name)}
                                            >
                                                {expanded.interfaces.has(iface.name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                {iface.name}
                                            </TreeItem>

                                            {expanded.interfaces.has(iface.name) && iface.operations.map(op => (
                                                <div key={op.name}>
                                                    <TreeItem
                                                        level={2}
                                                        onClick={() => toggleExpanded('operations', op.name)}
                                                    >
                                                        {expanded.operations.has(op.name) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                        {op.name} ({op.requests.length})
                                                    </TreeItem>

                                                    {expanded.operations.has(op.name) && op.requests.map(req => {
                                                        const reqId = req.id || req.name || '';
                                                        return (
                                                            <TreeItem
                                                                key={reqId}
                                                                level={3}
                                                                selected={selected.has(reqId)}
                                                                onClick={() => toggleSelected(reqId)}
                                                            >
                                                                <Checkbox checked={selected.has(reqId)}>
                                                                    {selected.has(reqId) && <Check size={12} />}
                                                                </Checkbox>
                                                                {req.name}
                                                            </TreeItem>
                                                        );
                                                    })}
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </>
                    )}
                </Content>

                <Footer>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button primary onClick={handleImport} disabled={selected.size === 0}>
                        Import {selected.size} Request{selected.size !== 1 ? 's' : ''}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};

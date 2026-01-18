/**
 * AddToProjectModal Component
 * 
 * Modal for selecting an existing project or creating a new one
 * when adding interfaces from WSDL Explorer.
 */

import React, { useState } from 'react';
import styled from 'styled-components';
import { X, FolderPlus, Folder } from 'lucide-react';

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
    min-width: 400px;
    max-width: 500px;
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
        display: flex;
        align-items: center;
        gap: 8px;
    }
`;

const CloseButton = styled.button`
    background: none;
    border: none;
    cursor: pointer;
    color: var(--vscode-icon-foreground);
    opacity: 0.7;
    &:hover { opacity: 1; }
`;

const Content = styled.div`
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 15px 20px;
    border-top: 1px solid var(--vscode-panel-border);
`;

const Button = styled.button<{ $primary?: boolean }>`
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9em;
    border: none;
    background: ${props => props.$primary ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)'};
    color: ${props => props.$primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)'};
    
    &:hover {
        opacity: 0.9;
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const RadioOption = styled.label<{ selected: boolean }>`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    border: 1px solid ${props => props.selected ? 'var(--vscode-focusBorder)' : 'var(--vscode-input-border)'};
    border-radius: 6px;
    cursor: pointer;
    background: ${props => props.selected ? 'var(--vscode-list-hoverBackground)' : 'transparent'};
    transition: all 0.15s ease;
    
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
    
    input[type="radio"] {
        margin: 0;
    }
`;

const Select = styled.select`
    width: 100%;
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 0.95em;
    margin-top: 10px;
    
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

const Input = styled.input`
    width: 100%;
    padding: 8px 12px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 0.95em;
    margin-top: 10px;
    
    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

const OptionContent = styled.div`
    flex: 1;
    
    .label {
        font-weight: 500;
        margin-bottom: 4px;
    }
    
    .description {
        font-size: 0.85em;
        opacity: 0.7;
    }
`;

interface AddToProjectModalProps {
    open: boolean;
    onClose: () => void;
    existingProjects: string[];
    onSelectProject: (projectName: string) => void;
    onCreateProject: (projectName: string) => void;
    interfaceName?: string;
}

type Mode = 'existing' | 'new';

export const AddToProjectModal: React.FC<AddToProjectModalProps> = ({
    open,
    onClose,
    existingProjects,
    onSelectProject,
    onCreateProject,
    interfaceName
}) => {
    const [mode, setMode] = useState<Mode>(existingProjects.length > 0 ? 'existing' : 'new');
    const [selectedProject, setSelectedProject] = useState(existingProjects[0] || '');
    const [newProjectName, setNewProjectName] = useState('');

    if (!open) return null;

    const handleConfirm = () => {
        if (mode === 'existing' && selectedProject) {
            onSelectProject(selectedProject);
        } else if (mode === 'new' && newProjectName.trim()) {
            onCreateProject(newProjectName.trim());
        }
        onClose();
        // Reset state
        setNewProjectName('');
    };

    const isValid = mode === 'existing'
        ? selectedProject.length > 0
        : newProjectName.trim().length > 0;

    return (
        <Overlay onClick={onClose}>
            <Modal onClick={e => e.stopPropagation()}>
                <Header>
                    <h2><FolderPlus size={18} /> Add to Project</h2>
                    <CloseButton onClick={onClose}><X size={18} /></CloseButton>
                </Header>

                <Content>
                    {interfaceName && (
                        <div style={{ fontSize: '0.9em', opacity: 0.8 }}>
                            Adding: <strong>{interfaceName}</strong>
                        </div>
                    )}

                    {existingProjects.length > 0 && (
                        <RadioOption
                            selected={mode === 'existing'}
                            onClick={() => setMode('existing')}
                        >
                            <input
                                type="radio"
                                name="mode"
                                checked={mode === 'existing'}
                                onChange={() => setMode('existing')}
                            />
                            <Folder size={18} />
                            <OptionContent>
                                <div className="label">Existing Project</div>
                                <div className="description">Add to an existing project</div>
                                {mode === 'existing' && (
                                    <Select
                                        value={selectedProject}
                                        onChange={e => setSelectedProject(e.target.value)}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        {existingProjects.map(name => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </Select>
                                )}
                            </OptionContent>
                        </RadioOption>
                    )}

                    <RadioOption
                        selected={mode === 'new'}
                        onClick={() => setMode('new')}
                    >
                        <input
                            type="radio"
                            name="mode"
                            checked={mode === 'new'}
                            onChange={() => setMode('new')}
                        />
                        <FolderPlus size={18} />
                        <OptionContent>
                            <div className="label">New Project</div>
                            <div className="description">Create a new project</div>
                            {mode === 'new' && (
                                <Input
                                    type="text"
                                    value={newProjectName}
                                    onChange={e => setNewProjectName(e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    placeholder="Enter project name..."
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && isValid) {
                                            handleConfirm();
                                        }
                                    }}
                                />
                            )}
                        </OptionContent>
                    </RadioOption>
                </Content>

                <Footer>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button $primary onClick={handleConfirm} disabled={!isValid}>
                        {mode === 'existing' ? 'Add to Project' : 'Create & Add'}
                    </Button>
                </Footer>
            </Modal>
        </Overlay>
    );
};

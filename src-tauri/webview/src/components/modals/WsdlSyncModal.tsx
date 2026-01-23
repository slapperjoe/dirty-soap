import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { X, Plus, Trash2, RefreshCw } from 'lucide-react';
import { WsdlDiff } from '@shared/models';

const Overlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

const ModalContainer = styled.div`
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  width: 800px;
  max-width: 90%;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  border-radius: 5px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  border: 1px solid var(--vscode-widget-border);
`;

const Header = styled.div`
  padding: 15px 20px;
  border-bottom: 1px solid var(--vscode-widget-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.1em;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 10px;
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vscode-icon-foreground);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

const Content = styled.div`
  padding: 20px;
  overflow-y: auto;
  flex: 1;
`;

const Footer = styled.div`
  padding: 15px 20px;
  border-top: 1px solid var(--vscode-widget-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
`;

const Button = styled.button<{ primary?: boolean; danger?: boolean }>`
  background-color: ${props => props.primary ? 'var(--vscode-button-background)' : 'transparent'};
  color: ${props => props.primary ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'};
  border: ${props => props.primary ? 'none' : '1px solid var(--vscode-button-secondaryHoverBackground)'};
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
  font-size: 13px;

  &:hover {
    background-color: ${props => props.primary ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-toolbar-hoverBackground)'};
  }
`;

const DiffSection = styled.div`
  margin-bottom: 20px;
`;

const SectionTitle = styled.h3`
  font-size: 0.9em;
  text-transform: uppercase;
  color: var(--vscode-descriptionForeground);
  margin-bottom: 10px;
  border-bottom: 1px solid var(--vscode-panel-border);
  padding-bottom: 5px;
`;

const OperationList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
`;

const DiffItem = styled.div<{ type: 'add' | 'remove' | 'modify' }>`
  display: flex;
  align-items: center;
  padding: 8px;
  background-color: ${props => {
        switch (props.type) {
            case 'add': return 'rgba(72, 187, 120, 0.1)';
            case 'remove': return 'rgba(245, 101, 101, 0.1)';
            default: return 'transparent';
        }
    }};
  border-left: 3px solid ${props => {
        switch (props.type) {
            case 'add': return '#48bb78';
            case 'remove': return '#f56565';
            case 'modify': return '#ecc94b';
            default: return '#ecc94b';
        }
    }};
`;

const ChangeLabel = styled.span`
  font-size: 0.8em;
  background-color: var(--vscode-badge-background);
  color: var(--vscode-badge-foreground);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 10px;
`;

const Checkbox = styled.input`
  margin-right: 10px;
`;

interface WsdlSyncModalProps {
    diff: WsdlDiff;
    onClose: () => void;
    onSync: (diff: WsdlDiff) => void;
}

export const WsdlSyncModal: React.FC<WsdlSyncModalProps> = ({ diff, onClose, onSync }) => {
    const [selectedAdds, setSelectedAdds] = useState<Set<string>>(new Set());
    const [selectedRemoves, setSelectedRemoves] = useState<Set<string>>(new Set());
    const [selectedMods, setSelectedMods] = useState<Set<string>>(new Set());

    useEffect(() => {
        // Select all by default
        setSelectedAdds(new Set(diff.addedOperations.map(op => op.name)));
        setSelectedRemoves(new Set(diff.removedOperations.map(op => op.name)));
        setSelectedMods(new Set(diff.modifiedOperations.map(op => op.operation.name)));
    }, [diff]);

    const toggleAdd = (name: string) => {
        const next = new Set(selectedAdds);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelectedAdds(next);
    };

    const toggleRemove = (name: string) => {
        const next = new Set(selectedRemoves);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelectedRemoves(next);
    };

    const toggleMod = (name: string) => {
        const next = new Set(selectedMods);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelectedMods(next);
    };

    const handleSync = () => {
        const finalDiff: WsdlDiff = {
            ...diff,
            addedOperations: diff.addedOperations.filter(op => selectedAdds.has(op.name)),
            removedOperations: diff.removedOperations.filter(op => selectedRemoves.has(op.name)),
            modifiedOperations: diff.modifiedOperations.filter(op => selectedMods.has(op.operation.name))
        };
        onSync(finalDiff);
    };

    const hasChanges = diff.addedOperations.length > 0 || diff.removedOperations.length > 0 || diff.modifiedOperations.length > 0;

    return (
        <Overlay>
            <ModalContainer>
                <Header>
                    <Title>
                        <RefreshCw size={18} />
                        Synchronize Interface: {diff.interfaceName}
                    </Title>
                    <CloseButton onClick={onClose} title="Close">
                        <X size={18} />
                    </CloseButton>
                </Header>

                <Content>
                    {!hasChanges && (
                        <div style={{ padding: 20, textAlign: 'center', opacity: 0.7 }}>
                            No changes detected. The interface is up to date.
                        </div>
                    )}

                    {diff.addedOperations.length > 0 && (
                        <DiffSection>
                            <SectionTitle style={{ color: '#48bb78' }}>New Operations ({diff.addedOperations.length})</SectionTitle>
                            <OperationList>
                                {diff.addedOperations.map(op => (
                                    <DiffItem key={op.name} type="add">
                                        <Checkbox
                                            type="checkbox"
                                            checked={selectedAdds.has(op.name)}
                                            onChange={() => toggleAdd(op.name)}
                                        />
                                        <Plus size={14} style={{ marginRight: 8, color: '#48bb78' }} />
                                        <span style={{ fontWeight: 500 }}>{op.name}</span>
                                    </DiffItem>
                                ))}
                            </OperationList>
                        </DiffSection>
                    )}

                    {diff.removedOperations.length > 0 && (
                        <DiffSection>
                            <SectionTitle style={{ color: '#f56565' }}>Removed Operations ({diff.removedOperations.length})</SectionTitle>
                            <OperationList>
                                {diff.removedOperations.map(op => (
                                    <DiffItem key={op.name} type="remove">
                                        <Checkbox
                                            type="checkbox"
                                            checked={selectedRemoves.has(op.name)}
                                            onChange={() => toggleRemove(op.name)}
                                        />
                                        <Trash2 size={14} style={{ marginRight: 8, color: '#f56565' }} />
                                        <span style={{ textDecoration: 'line-through', opacity: 0.8 }}>{op.name}</span>
                                    </DiffItem>
                                ))}
                            </OperationList>
                        </DiffSection>
                    )}

                    {diff.modifiedOperations.length > 0 && (
                        <DiffSection>
                            <SectionTitle style={{ color: '#ecc94b' }}>Modified Operations ({diff.modifiedOperations.length})</SectionTitle>
                            <OperationList>
                                {diff.modifiedOperations.map(mod => (
                                    <DiffItem key={mod.operation.name} type="modify">
                                        <Checkbox
                                            type="checkbox"
                                            checked={selectedMods.has(mod.operation.name)}
                                            onChange={() => toggleMod(mod.operation.name)}
                                        />
                                        <RefreshCw size={14} style={{ marginRight: 8, color: '#ecc94b' }} />
                                        <span style={{ fontWeight: 500 }}>{mod.operation.name}</span>
                                        {mod.changes.map(c => (
                                            <ChangeLabel key={c}>{c}</ChangeLabel>
                                        ))}
                                    </DiffItem>
                                ))}
                            </OperationList>
                        </DiffSection>
                    )}

                </Content>

                <Footer>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button primary onClick={handleSync} disabled={!hasChanges}>
                        Apply Changes
                    </Button>
                </Footer>
            </ModalContainer>
        </Overlay>
    );
};

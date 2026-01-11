/**
 * GlobalsTab.tsx
 * 
 * Global variables management for the Settings modal.
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import styled, { keyframes, css } from 'styled-components';
import {
    ApinoxConfig,
    EnvList,
    EnvItem,
    EnvDetail,
    FormGroup,
    Label,
    Input,
    IconButton,
} from './SettingsTypes';

// Shake animation for delete confirmation
const shakeAnimation = keyframes`
    0% { transform: translateX(0); }
    25% { transform: translateX(2px) rotate(5deg); }
    50% { transform: translateX(-2px) rotate(-5deg); }
    75% { transform: translateX(2px) rotate(5deg); }
    100% { transform: translateX(0); }
`;

const DeleteButton = styled(IconButton) <{ confirming?: boolean }>`
    color: ${props => props.confirming ? 'var(--vscode-errorForeground)' : 'var(--vscode-foreground)'};
    ${props => props.confirming && css`
        animation: ${shakeAnimation} 0.5s ease-in-out infinite;
    `}
`;

interface GlobalsTabProps {
    config: ApinoxConfig;
    selectedGlobalKey: string | null;
    setSelectedGlobalKey: (key: string | null) => void;
    onAddGlobal: () => void;
    onDeleteGlobal: (key: string) => void;
    onGlobalKeyChange: (oldKey: string, newKey: string) => void;
    onGlobalValueChange: (key: string, value: string) => void;
}

export const GlobalsTab: React.FC<GlobalsTabProps> = ({
    config,
    selectedGlobalKey,
    setSelectedGlobalKey,
    onAddGlobal,
    onDeleteGlobal,
    onGlobalKeyChange,
    onGlobalValueChange,
}) => {
    const globals = config.globals || {};
    const globalKeys = Object.keys(globals);

    // Delete confirmation state
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Reset confirm state when selection changes
    useEffect(() => {
        setConfirmDelete(false);
    }, [selectedGlobalKey]);

    const handleDeleteClick = () => {
        if (!selectedGlobalKey) return;

        if (confirmDelete) {
            onDeleteGlobal(selectedGlobalKey);
            setConfirmDelete(false);
        } else {
            setConfirmDelete(true);
        }
    };

    return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <EnvList>
                <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Globals</span>
                    <IconButton onClick={onAddGlobal} title="Add Variable">
                        <Plus size={14} />
                    </IconButton>
                </div>
                {globalKeys.map(key => (
                    <EnvItem
                        key={key}
                        active={key === selectedGlobalKey}
                        selected={key === selectedGlobalKey}
                        onClick={() => setSelectedGlobalKey(key)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{key}</span>
                        </div>
                    </EnvItem>
                ))}
            </EnvList>
            <EnvDetail>
                {selectedGlobalKey !== null && globals[selectedGlobalKey] !== undefined ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 12 }}>Variable</h3>
                            <DeleteButton
                                onClick={handleDeleteClick}
                                confirming={confirmDelete}
                                title={confirmDelete ? "Click again to confirm delete" : "Delete Variable"}
                            >
                                <Trash2 size={14} />
                            </DeleteButton>
                        </div>
                        <FormGroup>
                            <Label>Key Name</Label>
                            <Input
                                type="text"
                                value={selectedGlobalKey}
                                onChange={e => onGlobalKeyChange(selectedGlobalKey, e.target.value)}
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Value</Label>
                            <Input
                                type="text"
                                value={globals[selectedGlobalKey]}
                                onChange={e => onGlobalValueChange(selectedGlobalKey, e.target.value)}
                            />
                        </FormGroup>
                        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '10px', background: 'var(--vscode-textBlockQuote-background)', borderLeft: '3px solid var(--vscode-textBlockQuote-border)' }}>
                            <p style={{ margin: 0 }}>
                                Use <code>{'{{' + selectedGlobalKey + '}}'}</code> in your requests to insert this value.
                            </p>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-disabledForeground)' }}>
                        Select a global variable to edit
                    </div>
                )}

                {/* Predefined Variables Reference Panel */}
                <div style={{ marginTop: 20, borderTop: '1px solid var(--vscode-panel-border)', paddingTop: 15 }}>
                    <h4 style={{ margin: '0 0 10px 0', fontSize: 11, textTransform: 'uppercase', color: 'var(--vscode-sideBarTitle-foreground)' }}>
                        Predefined Variables
                    </h4>
                    <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', lineHeight: 1.6 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 15px' }}>
                            <code>{'{{uuid}}'}</code><span>Random UUID</span>
                            <code>{'{{now}}'}</code><span>ISO timestamp</span>
                            <code>{'{{epoch}}'}</code><span>Unix timestamp (seconds)</span>
                            <code>{'{{randomInt(1,100)}}'}</code><span>Random integer</span>
                            <code>{'{{lorem(5)}}'}</code><span>Lorem ipsum text</span>
                            <code>{'{{name}}'}</code><span>Random name</span>
                            <code>{'{{country}}'}</code><span>Random country</span>
                            <code>{'{{now+1d}}'}</code><span>Date math (+/- d/m/y)</span>
                        </div>
                        <div style={{ marginTop: 10, opacity: 0.8, fontStyle: 'italic' }}>
                            Use these in request bodies or endpoints.
                        </div>
                    </div>
                </div>
            </EnvDetail>
        </div>
    );
};

/**
 * EnvironmentsTab.tsx
 * 
 * Environment profiles management for the Settings modal.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Check, Download, Upload } from 'lucide-react';
import styled, { keyframes, css } from 'styled-components';
import {
    ApinoxConfig,
    EnvList,
    EnvItem,
    EnvDetail,
    FormGroup,
    Label,
    Input,
    Badge,
    IconButton,
    PrimaryButton,
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

interface EnvironmentsTabProps {
    config: ApinoxConfig;
    selectedEnvKey: string | null;
    setSelectedEnvKey: (key: string | null) => void;
    onAddEnv: () => void;
    onDeleteEnv: (key: string) => void;
    onSetActive: (key: string) => void;
    onEnvChange: (envKey: string, field: string, value: string) => void;
    onImportEnvironments?: (environments: Record<string, any>, activeEnv?: string) => void;
}

export const EnvironmentsTab: React.FC<EnvironmentsTabProps> = ({
    config,
    selectedEnvKey,
    setSelectedEnvKey,
    onAddEnv,
    onDeleteEnv,
    onSetActive,
    onEnvChange,
    onImportEnvironments,
}) => {
    const environments = config.environments || {};
    const envKeys = Object.keys(environments);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Delete confirmation state
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Reset confirm state when selection changes
    useEffect(() => {
        setConfirmDelete(false);
    }, [selectedEnvKey]);

    const handleDeleteClick = () => {
        if (!selectedEnvKey) return;

        if (confirmDelete) {
            onDeleteEnv(selectedEnvKey);
            setConfirmDelete(false);
        } else {
            setConfirmDelete(true);
        }
    };

    const handleExport = () => {
        const exportData = {
            environments: config.environments || {},
            activeEnvironment: config.activeEnvironment
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'apinox-environments.json';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !onImportEnvironments) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target?.result as string);
                if (data.environments && typeof data.environments === 'object') {
                    onImportEnvironments(data.environments, data.activeEnvironment);
                }
            } catch (err) {
                console.error('Failed to parse environments file:', err);
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be selected again
        e.target.value = '';
    };

    return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <EnvList>
                <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Profiles</span>
                    <div style={{ display: 'flex', gap: 4 }}>
                        <IconButton onClick={handleExport} title="Export Environments">
                            <Download size={14} />
                        </IconButton>
                        <IconButton onClick={handleImportClick} title="Import Environments">
                            <Upload size={14} />
                        </IconButton>
                        <IconButton onClick={onAddEnv} title="Add Environment">
                            <Plus size={14} />
                        </IconButton>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json"
                            style={{ display: 'none' }}
                            onChange={handleFileChange}
                        />
                    </div>
                </div>
                {envKeys.map(key => (
                    <EnvItem
                        key={key}
                        active={key === selectedEnvKey}
                        selected={key === selectedEnvKey}
                        onClick={() => setSelectedEnvKey(key)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{key}</span>
                            {config.activeEnvironment === key && <Badge>Active</Badge>}
                        </div>
                    </EnvItem>
                ))}
            </EnvList>
            <EnvDetail>
                {selectedEnvKey && environments[selectedEnvKey] ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 12 }}>{selectedEnvKey}</h3>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {config.activeEnvironment !== selectedEnvKey && (
                                    <PrimaryButton onClick={() => onSetActive(selectedEnvKey)} style={{ height: '20px', background: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}>
                                        <Check size={14} /> Set Active
                                    </PrimaryButton>
                                )}
                                <DeleteButton
                                    onClick={handleDeleteClick}
                                    confirming={confirmDelete}
                                    title={confirmDelete ? "Click again to confirm delete" : "Delete Environment"}
                                >
                                    <Trash2 size={14} />
                                </DeleteButton>
                            </div>
                        </div>
                        <FormGroup>
                            <Label>Endpoint URL</Label>
                            <Input
                                type="text"
                                value={environments[selectedEnvKey].endpoint_url ?? ''}
                                onChange={e => onEnvChange(selectedEnvKey, 'endpoint_url', e.target.value)}
                                placeholder="http://api.example.com/service.svc"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Short Code (used in {'{{env}}'})</Label>
                            <Input
                                type="text"
                                value={environments[selectedEnvKey].env ?? ''}
                                onChange={e => onEnvChange(selectedEnvKey, 'env', e.target.value)}
                                placeholder="dev01"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Color</Label>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Input
                                    type="color"
                                    value={environments[selectedEnvKey].color ?? '#58A6FF'}
                                    onChange={e => onEnvChange(selectedEnvKey, 'color', e.target.value)}
                                    style={{ width: '50px', padding: '2px', height: '30px' }}
                                />
                                <span style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>
                                    {environments[selectedEnvKey].color ?? '#58A6FF'}
                                </span>
                            </div>
                        </FormGroup>
                        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '10px', background: 'var(--vscode-textBlockQuote-background)', borderLeft: '3px solid var(--vscode-textBlockQuote-border)' }}>
                            <p style={{ margin: 0 }}>
                                Use <code>{'{{url}}'}</code> in your requests to reference the Endpoint URL.<br />
                                Use <code>{'{{env}}'}</code> to reference the Short Code.
                            </p>
                        </div>
                    </>
                ) : (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-disabledForeground)' }}>
                        Select an environment to edit
                    </div>
                )}
            </EnvDetail>
        </div>
    );
};

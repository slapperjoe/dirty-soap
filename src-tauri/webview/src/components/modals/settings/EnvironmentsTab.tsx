/**
 * EnvironmentsTab.tsx
 * 
 * Environment profiles management for the Settings modal.
 */

import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Check, Download, Upload, Eye, EyeOff, Lock, X } from 'lucide-react';
import styled, { keyframes, css } from 'styled-components';
import { bridge } from '../../../utils/bridge';
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

const CustomFieldsSection = styled.div`
    margin-top: 20px;
    border-top: 1px solid var(--vscode-panel-border);
    padding-top: 15px;
`;

const CustomFieldRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr auto auto auto;
    gap: 8px;
    align-items: center;
    margin-bottom: 8px;
`;

const SecretToggle = styled.button<{ $active: boolean }>`
    background: ${props => props.$active ? 'var(--vscode-button-background)' : 'transparent'};
    border: 1px solid var(--vscode-input-border);
    color: ${props => props.$active ? 'var(--vscode-button-foreground)' : 'var(--vscode-foreground)'};
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;

    &:hover {
        background: ${props => props.$active ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-toolbar-hoverBackground)'};
    }
`;

const MaskedInput = styled(Input)`
    font-family: ${props => props.type === 'password' ? 'monospace' : 'inherit'};
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
    
    // Custom fields state
    const [customFields, setCustomFields] = useState<Record<string, Record<string, string>>>({});
    const [newFieldName, setNewFieldName] = useState('');
    const [newFieldValue, setNewFieldValue] = useState('');
    
    // Secret visibility state (field name -> isVisible)
    const [secretVisibility, setSecretVisibility] = useState<Record<string, boolean>>({});
    
    // Decrypted secret values cache (field name -> decrypted value)
    const [decryptedSecrets, setDecryptedSecrets] = useState<Record<string, string>>({});

    // Load custom fields and decrypt secrets when environment changes
    useEffect(() => {
        if (!selectedEnvKey || !environments[selectedEnvKey]) return;
        
        const env = environments[selectedEnvKey];
        const fields: Record<string, string> = {};
        const secretFields = env._secretFields || [];
        
        // Extract custom fields (non-standard fields)
        for (const [key, value] of Object.entries(env)) {
            if (key !== 'endpoint_url' && key !== 'env' && key !== 'color' && key !== '_secretFields' && typeof value === 'string') {
                fields[key] = value;
                
                // Load decrypted value for secrets
                if (value.startsWith('__SECRET__:')) {
                    loadSecretValue(selectedEnvKey, key);
                }
            }
        }
        
        setCustomFields(prev => ({ ...prev, [selectedEnvKey]: fields }));
        setConfirmDelete(false);
    }, [selectedEnvKey]);

    const loadSecretValue = async (envName: string, fieldName: string) => {
        return new Promise<void>((resolve) => {
            const unsubscribe = bridge.onMessage((msg) => {
                if (msg.value !== undefined) {
                    setDecryptedSecrets(prev => ({ ...prev, [`${envName}:${fieldName}`]: msg.value }));
                    unsubscribe();
                    resolve();
                }
            });
            
            bridge.sendMessage({
                command: 'getEnvironmentSecret',
                envName,
                fieldName
            });
        });
    };

    const toggleSecretVisibility = (fieldName: string) => {
        setSecretVisibility(prev => ({ ...prev, [fieldName]: !prev[fieldName] }));
    };

    const toggleSecretField = async (fieldName: string) => {
        if (!selectedEnvKey) return;
        
        console.log('[Secrets] Toggle secret field:', fieldName, 'in env:', selectedEnvKey);
        
        const env = environments[selectedEnvKey];
        const secretFields = Array.isArray(env._secretFields) ? env._secretFields : [];
        const isCurrentlySecret = secretFields.includes(fieldName);
        const currentFieldValue = customFields[selectedEnvKey]?.[fieldName] || '';
        
        console.log('[Secrets] Current secret fields:', secretFields);
        console.log('[Secrets] Is currently secret:', isCurrentlySecret);
        console.log('[Secrets] Field value:', currentFieldValue);
        
        if (isCurrentlySecret) {
            // Remove from secrets
            const updatedSecretFields = secretFields.filter(f => f !== fieldName);
            console.log('[Secrets] Removing from secrets, new list:', updatedSecretFields);
            
            // Update _secretFields as array
            onEnvChange(selectedEnvKey, '_secretFields', updatedSecretFields as any);
            
            // Get decrypted value and use as plain value
            const decrypted = decryptedSecrets[`${selectedEnvKey}:${fieldName}`] || currentFieldValue;
            console.log('[Secrets] Setting plain value:', decrypted);
            onEnvChange(selectedEnvKey, fieldName, decrypted);
            
            // Delete from secret storage via bridge
            bridge.sendMessage({
                command: 'deleteEnvironmentSecret',
                envName: selectedEnvKey,
                fieldName
            });
            console.log('[Secrets] Sent delete command via bridge');
        } else {
            // Make it a secret
            const valueToEncrypt = currentFieldValue || '(empty)';
            console.log('[Secrets] Making secret, value to encrypt:', valueToEncrypt);
            
            // Store encrypted via bridge
            bridge.sendMessage({
                command: 'setEnvironmentSecret',
                envName: selectedEnvKey,
                fieldName,
                value: valueToEncrypt
            });
            console.log('[Secrets] Sent setEnvironmentSecret via bridge');
            
            // Update config with reference
            const reference = `__SECRET__:env:${selectedEnvKey}:${fieldName}`;
            console.log('[Secrets] Setting reference:', reference);
            onEnvChange(selectedEnvKey, fieldName, reference);
            
            // Add to secret fields list
            const updatedSecretFields = [...secretFields, fieldName];
            console.log('[Secrets] Adding to secrets, new list:', updatedSecretFields);
            onEnvChange(selectedEnvKey, '_secretFields', updatedSecretFields as any);
            
            // Cache decrypted value
            setDecryptedSecrets(prev => ({ ...prev, [`${selectedEnvKey}:${fieldName}`]: valueToEncrypt }));
            
            // Force reload custom fields
            setCustomFields(prev => ({
                ...prev,
                [selectedEnvKey]: {
                    ...prev[selectedEnvKey],
                    [fieldName]: reference
                }
            }));
        }
    };

    const addCustomField = () => {
        if (!selectedEnvKey || !newFieldName.trim()) return;
        
        onEnvChange(selectedEnvKey, newFieldName.trim(), newFieldValue);
        setCustomFields(prev => ({
            ...prev,
            [selectedEnvKey]: {
                ...prev[selectedEnvKey],
                [newFieldName.trim()]: newFieldValue
            }
        }));
        
        setNewFieldName('');
        setNewFieldValue('');
    };

    const deleteCustomField = (fieldName: string) => {
        if (!selectedEnvKey) return;
        
        onEnvChange(selectedEnvKey, fieldName, undefined as any);
        setCustomFields(prev => {
            const updated = { ...prev };
            if (updated[selectedEnvKey]) {
                delete updated[selectedEnvKey][fieldName];
            }
            return updated;
        });
    };

    const handleCustomFieldChange = (fieldName: string, value: string) => {
        if (!selectedEnvKey) return;
        
        const env = environments[selectedEnvKey];
        const secretFields = env._secretFields || [];
        const isSecret = secretFields.includes(fieldName);
        
        if (isSecret) {
            // Update decrypted cache
            setDecryptedSecrets(prev => ({ ...prev, [`${selectedEnvKey}:${fieldName}`]: value }));
        }
        
        onEnvChange(selectedEnvKey, fieldName, value);
        setCustomFields(prev => ({
            ...prev,
            [selectedEnvKey]: {
                ...prev[selectedEnvKey],
                [fieldName]: value
            }
        }));
    };

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
        // Redact secrets before export
        const environmentsToExport = Object.entries(config.environments || {}).reduce((acc, [envName, env]) => {
            const secretFields = (env as any)._secretFields || [];
            const cleanedEnv = { ...env };
            
            // Replace secret values with [REDACTED]
            secretFields.forEach((fieldName: string) => {
                if ((cleanedEnv as any)[fieldName]) {
                    (cleanedEnv as any)[fieldName] = '[REDACTED]';
                }
            });
            
            acc[envName] = cleanedEnv;
            return acc;
        }, {} as Record<string, any>);
        
        const exportData = {
            environments: environmentsToExport,
            activeEnvironment: config.activeEnvironment
        };
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'apinox-environments.json';
        a.click();
        URL.revokeObjectURL(url);
        
        // Show notification
        alert('Environments exported. Note: Secrets were replaced with [REDACTED] for security.');
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
                    // Clean up [REDACTED] values and preserve existing secrets
                    const cleanedEnvironments = Object.entries(data.environments).reduce((acc, [envName, env]: [string, any]) => {
                        const cleaned = { ...env };
                        
                        // Remove [REDACTED] values
                        for (const [key, value] of Object.entries(cleaned)) {
                            if (value === '[REDACTED]') {
                                delete cleaned[key];
                            }
                        }
                        
                        acc[envName] = cleaned;
                        return acc;
                    }, {} as Record<string, any>);
                    
                    onImportEnvironments(cleanedEnvironments, data.activeEnvironment);
                }
            } catch (err) {
                console.error('Failed to parse environments file:', err);
                alert('Failed to import environments. Please check the file format.');
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
                        
                        {/* Custom Fields Section */}
                        <CustomFieldsSection>
                            <Label style={{ marginBottom: 10 }}>Custom Variables</Label>
                            
                            {Object.entries(customFields[selectedEnvKey] || {}).map(([fieldName, fieldValue]) => {
                                const env = environments[selectedEnvKey];
                                const secretFields = (env as any)._secretFields || [];
                                const isSecret = secretFields.includes(fieldName);
                                const isVisible = secretVisibility[fieldName] || false;
                                const displayValue = isSecret 
                                    ? (isVisible ? (decryptedSecrets[`${selectedEnvKey}:${fieldName}`] || fieldValue) : '•'.repeat(12))
                                    : fieldValue;
                                
                                return (
                                    <CustomFieldRow key={fieldName}>
                                        <Input
                                            type="text"
                                            value={fieldName}
                                            readOnly
                                            style={{ background: 'var(--vscode-input-background)', opacity: 0.7 }}
                                        />
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <MaskedInput
                                                type={isSecret && !isVisible ? 'password' : 'text'}
                                                value={isSecret && isVisible ? (decryptedSecrets[`${selectedEnvKey}:${fieldName}`] || '') : displayValue}
                                                onChange={e => handleCustomFieldChange(fieldName, e.target.value)}
                                                placeholder="Value"
                                                style={{ paddingRight: isSecret ? 35 : 8 }}
                                            />
                                            {isSecret && (
                                                <IconButton
                                                    onClick={() => toggleSecretVisibility(fieldName)}
                                                    style={{ position: 'absolute', right: 4 }}
                                                    title={isVisible ? 'Hide' : 'Show'}
                                                >
                                                    {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                </IconButton>
                                            )}
                                        </div>
                                        <SecretToggle
                                            $active={isSecret}
                                            onClick={() => toggleSecretField(fieldName)}
                                            title={isSecret ? 'Remove encryption' : 'Encrypt this value'}
                                        >
                                            <Lock size={12} />
                                            {isSecret ? 'Secret' : 'Plain'}
                                        </SecretToggle>
                                        <IconButton
                                            onClick={() => deleteCustomField(fieldName)}
                                            title="Delete Field"
                                        >
                                            <X size={14} />
                                        </IconButton>
                                    </CustomFieldRow>
                                );
                            })}
                            
                            {/* Add new field */}
                            <CustomFieldRow>
                                <Input
                                    type="text"
                                    value={newFieldName}
                                    onChange={e => setNewFieldName(e.target.value)}
                                    placeholder="Field name (e.g., apiKey)"
                                />
                                <Input
                                    type="text"
                                    value={newFieldValue}
                                    onChange={e => setNewFieldValue(e.target.value)}
                                    placeholder="Value"
                                    onKeyDown={e => e.key === 'Enter' && addCustomField()}
                                />
                                <IconButton
                                    onClick={addCustomField}
                                    disabled={!newFieldName.trim()}
                                    title="Add Custom Field"
                                >
                                    <Plus size={14} />
                                </IconButton>
                            </CustomFieldRow>
                        </CustomFieldsSection>
                        
                        <div style={{ fontSize: 12, color: 'var(--vscode-descriptionForeground)', padding: '10px', background: 'var(--vscode-textBlockQuote-background)', borderLeft: '3px solid var(--vscode-textBlockQuote-border)', marginTop: 15 }}>
                            <p style={{ margin: 0 }}>
                                Use <code>{'{{url}}'}</code> in your requests to reference the Endpoint URL.<br />
                                Use <code>{'{{env}}'}</code> to reference the Short Code.<br />
                                Use <code>{'{{fieldName}}'}</code> to reference custom variables.<br />
                                <Lock size={10} style={{ display: 'inline', marginTop: 4 }} /> <strong>Secrets</strong> are encrypted at rest and never exported.
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

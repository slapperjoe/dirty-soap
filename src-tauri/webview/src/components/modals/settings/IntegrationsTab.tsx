/**
 * IntegrationsTab.tsx
 * 
 * Azure DevOps integration settings for the Settings modal.
 */

import React, { useState, useEffect } from 'react';
import { ExternalLink, Check, AlertCircle, Loader2, FolderOpen } from 'lucide-react';
import styled, { keyframes } from 'styled-components';
import {
    ApinoxConfig,
    ScrollableForm,
    FormGroup,
    Label,
    Input,
    Select,
    SectionHeader,
    PrimaryButton,
} from './SettingsTypes';
import { bridge, isTauri } from '../../../utils/bridge';
import { FrontendCommand } from '@shared/messages';

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const Spinner = styled(Loader2)`
    animation: ${spin} 1s linear infinite;
`;

const StatusMessage = styled.div<{ success?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-top: 10px;
    background: ${props => props.success
        ? 'var(--vscode-inputValidation-infoBackground)'
        : 'var(--vscode-inputValidation-errorBackground)'};
    color: ${props => props.success
        ? 'var(--vscode-inputValidation-infoForeground)'
        : 'var(--vscode-inputValidation-errorForeground)'};
    border-radius: 4px;
    font-size: 12px;
`;

const HelpText = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
`;

const PickerRow = styled.div`
    display: flex;
    gap: 8px;
    align-items: center;
`;

const IconButton = styled.button`
    background: transparent;
    border: 1px solid var(--vscode-input-border);
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 6px 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

interface AzureDevOpsProject {
    id: string;
    name: string;
}

interface IntegrationsTabProps {
    config: ApinoxConfig;
    onConfigChange: (field: string, value: any) => void;
    // Message sender for backend communication
    sendMessage: (message: any) => void;
}

export const IntegrationsTab: React.FC<IntegrationsTabProps> = ({
    config,
    onConfigChange,
    sendMessage,
}) => {
    const [pat, setPat] = useState('');
    const [hasPat, setHasPat] = useState(false);
    const [projects, setProjects] = useState<AzureDevOpsProject[]>([]);
    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    const azureDevOps = config.azureDevOps || {};
    const fileWatcher = config.fileWatcher || {};
    const tauriMode = isTauri();

    const updateFileWatcher = (next: { requestPath?: string; responsePath?: string }) => {
        onConfigChange('fileWatcher', next);
        if (tauriMode) {
            bridge.sendMessageAsync({
                command: FrontendCommand.SaveSettings,
                config: { fileWatcher: next }
            }).then(async () => {
                const data: any = await bridge.sendMessageAsync({
                    command: FrontendCommand.GetSettings
                });
                bridge.emit({
                    command: 'settingsUpdate',
                    config: data?.config ?? data ?? { fileWatcher: next },
                    raw: data?.raw,
                    configDir: data?.configDir,
                    configPath: data?.configPath
                } as any);
            }).catch(() => {
                sendMessage({
                    command: FrontendCommand.SaveSettings,
                    config: { fileWatcher: next }
                });
            });
        }
    };

    // Check if PAT exists on mount
    useEffect(() => {
        sendMessage({ command: 'adoHasPat' });

        const handleMessage = (event: MessageEvent) => {
            const msg = event.data;
            switch (msg.command) {
                case 'adoHasPatResult':
                    setHasPat(msg.hasPat);
                    break;
                case 'adoPatStored':
                    setHasPat(true);
                    setPat('');
                    // Auto-fetch projects after PAT stored
                    if (azureDevOps.orgUrl) {
                        fetchProjects();
                    }
                    break;
                case 'adoPatDeleted':
                    setHasPat(false);
                    setProjects([]);
                    break;
                case 'adoProjectsResult':
                    setLoading(false);
                    if (msg.success) {
                        setProjects(msg.projects);
                    } else {
                        setTestResult({ success: false, message: msg.error });
                    }
                    break;
                case 'adoTestConnectionResult':
                    setLoading(false);
                    setTestResult(msg);
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    const handleStorePat = () => {
        if (pat.trim()) {
            sendMessage({ command: 'adoStorePat', pat: pat.trim() });
        }
    };

    const handleDeletePat = () => {
        sendMessage({ command: 'adoDeletePat' });
        onConfigChange('azureDevOps', { ...azureDevOps, project: undefined });
    };

    const fetchProjects = () => {
        if (!azureDevOps.orgUrl) return;
        setLoading(true);
        setTestResult(null);
        sendMessage({ command: 'adoListProjects', orgUrl: azureDevOps.orgUrl });
    };

    const handleTestConnection = () => {
        if (!azureDevOps.orgUrl) return;
        setLoading(true);
        setTestResult(null);
        sendMessage({ command: 'adoTestConnection', orgUrl: azureDevOps.orgUrl });
    };

    const handleOrgUrlChange = (value: string) => {
        onConfigChange('azureDevOps', { ...azureDevOps, orgUrl: value });
        setProjects([]);
        setTestResult(null);
    };

    const handleProjectChange = (value: string) => {
        onConfigChange('azureDevOps', { ...azureDevOps, project: value });
    };

    const pickFile = async (kind: 'request' | 'response') => {
        if (tauriMode) {
            const dialog = await import('@tauri-apps/plugin-dialog');
            const selected = await dialog.open({
                multiple: false,
                filters: [{ name: 'XML Files', extensions: ['xml'] }]
            });
            if (typeof selected === 'string') {
                updateFileWatcher({
                    ...fileWatcher,
                    [kind === 'request' ? 'requestPath' : 'responsePath']: selected
                });
            }
            return;
        }

        sendMessage({
            command: kind === 'request'
                ? FrontendCommand.SelectWatcherRequestFile
                : FrontendCommand.SelectWatcherResponseFile
        });
    };

    return (
        <ScrollableForm>
            <SectionHeader>Azure DevOps</SectionHeader>

            <FormGroup>
                <Label>Organization URL</Label>
                <Input
                    type="text"
                    value={azureDevOps.orgUrl || ''}
                    onChange={e => handleOrgUrlChange(e.target.value)}
                    placeholder="https://dev.azure.com/your-org"
                />
                <HelpText>
                    Your Azure DevOps organization URL (e.g., https://dev.azure.com/myorg)
                </HelpText>
            </FormGroup>

            <FormGroup>
                <Label>Personal Access Token (PAT)</Label>
                {hasPat ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Input
                            type="password"
                            value="••••••••••••••••"
                            disabled
                            style={{ flex: 1 }}
                        />
                        <PrimaryButton
                            onClick={handleDeletePat}
                            style={{ background: 'var(--vscode-button-secondaryBackground)' }}
                        >
                            Remove
                        </PrimaryButton>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Input
                            type="password"
                            value={pat}
                            onChange={e => setPat(e.target.value)}
                            placeholder="Enter your PAT"
                            style={{ flex: 1 }}
                        />
                        <PrimaryButton onClick={handleStorePat} disabled={!pat.trim()}>
                            Save PAT
                        </PrimaryButton>
                    </div>
                )}
                <HelpText>
                    Create a PAT with "Work Items (Read & Write)" scope.{' '}
                    <a
                        href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
                        style={{ color: 'var(--vscode-textLink-foreground)' }}
                    >
                        Learn more <ExternalLink size={10} style={{ verticalAlign: 'middle' }} />
                    </a>
                </HelpText>
            </FormGroup>

            {hasPat && azureDevOps.orgUrl && (
                <FormGroup>
                    <Label>Project</Label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <Select
                            value={azureDevOps.project || ''}
                            onChange={e => handleProjectChange(e.target.value)}
                            style={{ flex: 1 }}
                            disabled={loading || projects.length === 0}
                        >
                            <option value="">Select a project...</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                            ))}
                        </Select>
                        <PrimaryButton
                            onClick={fetchProjects}
                            disabled={loading}
                            style={{ background: 'var(--vscode-button-secondaryBackground)' }}
                        >
                            {loading ? <Spinner size={14} /> : 'Refresh'}
                        </PrimaryButton>
                    </div>
                </FormGroup>
            )}


            {hasPat && azureDevOps.orgUrl && (
                <FormGroup>
                    <PrimaryButton onClick={handleTestConnection} disabled={loading}>
                        {loading ? <Spinner size={14} /> : <Check size={14} />}
                        Test Connection
                    </PrimaryButton>

                    {testResult && (
                        <StatusMessage success={testResult.success}>
                            {testResult.success ? <Check size={14} /> : <AlertCircle size={14} />}
                            {testResult.message}
                        </StatusMessage>
                    )}
                </FormGroup>
            )}

            <div style={{
                marginTop: 20,
                padding: 12,
                background: 'var(--vscode-textBlockQuote-background)',
                borderLeft: '3px solid var(--vscode-textBlockQuote-border)',
                fontSize: 12
            }}>
                <strong>How it works:</strong>
                <ol style={{ margin: '8px 0 0 0', paddingLeft: 20 }}>
                    <li>Configure your Azure DevOps org and PAT above</li>
                    <li>Select your project from the dropdown</li>
                    <li>A "Add to DevOps" button will appear on request screens</li>
                    <li>Enter a Work Item ID to add the request/response as a comment</li>
                </ol>
            </div>

            
            <SectionHeader style={{ marginTop: 24 }}>File Watcher</SectionHeader>

            <FormGroup>
                <Label>Request XML Path</Label>
                <PickerRow>
                    <Input
                        type="text"
                        value={fileWatcher.requestPath || ''}
                        onChange={e => updateFileWatcher({ ...fileWatcher, requestPath: e.target.value })}
                        placeholder="Request File"
                        style={{ flex: 1 }}
                    />
                    <IconButton onClick={() => pickFile('request')} title="Browse">
                        <FolderOpen size={14} />
                    </IconButton>
                </PickerRow>
                <HelpText>
                    Full path to the request XML file to watch.
                </HelpText>
            </FormGroup>

            <FormGroup>
                <Label>Response XML Path</Label>
                <PickerRow>
                    <Input
                        type="text"
                        value={fileWatcher.responsePath || ''}
                        onChange={e => updateFileWatcher({ ...fileWatcher, responsePath: e.target.value })}
                        placeholder="Response File"
                        style={{ flex: 1 }}
                    />
                    <IconButton onClick={() => pickFile('response')} title="Browse">
                        <FolderOpen size={14} />
                    </IconButton>
                </PickerRow>
                <HelpText>
                    Full path to the response XML file to watch.
                </HelpText>
            </FormGroup>
        </ScrollableForm>
    );
};

/**
 * GeneralTab.tsx
 * 
 * Network and UI settings for the Settings modal.
 */

import React from 'react';
import {
    ApinoxConfig,
    ScrollableForm,
    FormGroup,
    Label,
    Input,
    Select,
    CheckboxLabel,
    SectionHeader,
} from './SettingsTypes';
import { ProxyRulesEditor } from './ProxyRulesEditor';
import { useTheme } from '../../../contexts/ThemeContext';

interface GeneralTabProps {
    config: ApinoxConfig;
    onChange: (section: keyof ApinoxConfig, key: string, value: any) => void;
}

export const GeneralTab: React.FC<GeneralTabProps> = ({ config, onChange }) => {
    const { theme, setTheme, isTauriMode } = useTheme();

    return (
        <ScrollableForm>
            <div style={{ display: 'flex', gap: '30px' }}>
                {/* Left Column: User Interface */}
                <div style={{ flex: 1 }}>
                    <SectionHeader style={{ marginTop: 0 }}>User Interface</SectionHeader>

                    {/* Theme Selector - Only in Tauri Mode */}
                    {isTauriMode && (
                        <FormGroup>
                            <Label>Theme</Label>
                            <Select value={theme} onChange={e => setTheme(e.target.value as any)}>
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                                <option value="solarized-dark">Solarized Dark</option>
                                <option value="solarized-light">Solarized Light</option>
                            </Select>
                        </FormGroup>
                    )}

                    <FormGroup>
                        <Label>Layout Mode</Label>
                        <Select
                            value={config.ui?.layoutMode ?? 'vertical'}
                            onChange={e => onChange('ui', 'layoutMode', e.target.value)}
                        >
                            <option value="vertical">Vertical (Two Columns)</option>
                            <option value="horizontal">Horizontal (Stacked)</option>
                        </Select>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.showLineNumbers ?? true}
                                onChange={e => onChange('ui', 'showLineNumbers', e.target.checked)}
                            />
                            Show Line Numbers in Editor
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.alignAttributes ?? false}
                                onChange={e => onChange('ui', 'alignAttributes', e.target.checked)}
                            />
                            Align Attributes Vertically
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.ui?.inlineElementValues ?? false}
                                onChange={e => onChange('ui', 'inlineElementValues', e.target.checked)}
                            />
                            Inline simple values in XML Response (Experimental)
                        </CheckboxLabel>
                    </FormGroup>
                    <FormGroup>
                        <Label>Auto-Fold XML Elements</Label>
                        <div style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', marginBottom: 8 }}>
                            Enter element names to automatically collapse in editors (e.g., Security, Header)
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                            {(config.ui?.autoFoldElements || []).map((element, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: 4,
                                        padding: '4px 8px',
                                        background: 'var(--vscode-badge-background)',
                                        color: 'var(--vscode-badge-foreground)',
                                        borderRadius: 3,
                                        fontSize: '0.9em'
                                    }}
                                >
                                    <span>{element}</span>
                                    <button
                                        onClick={() => {
                                            const newElements = [...(config.ui?.autoFoldElements || [])];
                                            newElements.splice(idx, 1);
                                            onChange('ui', 'autoFoldElements', newElements);
                                        }}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'inherit',
                                            cursor: 'pointer',
                                            padding: 0,
                                            fontSize: '1.1em',
                                            lineHeight: 1
                                        }}
                                        title="Remove"
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: 4 }}>
                            <Input
                                type="text"
                                placeholder="Element name (e.g., Security)"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        const input = e.target as HTMLInputElement;
                                        const value = input.value.trim();
                                        if (value && !(config.ui?.autoFoldElements || []).includes(value)) {
                                            onChange('ui', 'autoFoldElements', [...(config.ui?.autoFoldElements || []), value]);
                                            input.value = '';
                                        }
                                    }
                                }}
                                style={{ flex: 1 }}
                            />
                        </div>
                    </FormGroup>
                </div>


                {/* Right Column: Network */}
                <div style={{ flex: 1 }}>
                    <SectionHeader style={{ marginTop: 0 }}>Network</SectionHeader>
                    <FormGroup>
                        <Label>Default Timeout (seconds)</Label>
                        <Input
                            type="number"
                            value={config.network?.defaultTimeout ?? 30}
                            onChange={e => onChange('network', 'defaultTimeout', parseInt(e.target.value))}
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label>Retry Count</Label>
                        <Input
                            type="number"
                            min={0}
                            max={10}
                            value={config.network?.retryCount ?? 0}
                            onChange={e => onChange('network', 'retryCount', parseInt(e.target.value))}
                        />
                    </FormGroup>
                    <FormGroup>
                        <Label>Proxy URL (Optional)</Label>
                        <Input
                            type="text"
                            placeholder="http://127.0.0.1:8080"
                            value={config.network?.proxy ?? ''}
                            onChange={e => onChange('network', 'proxy', e.target.value)}
                        />
                    </FormGroup>
                    <FormGroup>
                        <CheckboxLabel>
                            <input
                                type="checkbox"
                                checked={config.network?.strictSSL ?? true}
                                onChange={e => onChange('network', 'strictSSL', e.target.checked)}
                            />
                            Strict SSL (Verify Certificates)
                        </CheckboxLabel>
                    </FormGroup>

                    <ProxyRulesEditor config={config} onChange={onChange} />
                </div>
            </div>
        </ScrollableForm >
    );
};

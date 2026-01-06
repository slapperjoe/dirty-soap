import React from 'react';
import styled from 'styled-components';
import { Plus, Trash, Check, X } from 'lucide-react';
import { DirtySoapConfig, ProxyRule } from '@shared/models';

import { FormGroup, SectionHeader } from './SettingsTypes';

const RulesList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 10px;
`;

const RuleRow = styled.div<{ active: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px;
    background: var(--vscode-list-hoverBackground);
    border: 1px solid ${props => props.active ? 'var(--vscode-focusBorder)' : 'transparent'};
    border-radius: 4px;
`;

const Input = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px 6px;
    border-radius: 2px;
    font-size: 12px;
    flex: 1;

    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }
`;

const Select = styled.select`
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px;
    border-radius: 2px;
    font-size: 12px;
`;

const IconButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-button-foreground);
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 2px;
    opacity: 0.7;

    &:hover {
        opacity: 1;
        background: var(--vscode-toolbar-hoverBackground);
    }
`;

interface ProxyRulesEditorProps {
    config: DirtySoapConfig;
    onChange: (section: keyof DirtySoapConfig, key: string, value: any) => void;
}

export const ProxyRulesEditor: React.FC<ProxyRulesEditorProps> = ({ config, onChange }) => {
    const rules = config.network?.proxyRules || [];

    const updateRules = (newRules: ProxyRule[]) => {
        // We need to update the nested structure
        onChange('network', 'proxyRules', newRules);
    };

    const handleAddRule = () => {
        const newRule: ProxyRule = {
            id: crypto.randomUUID(),
            pattern: '*.example.com',
            useProxy: false,
            enabled: true
        };
        updateRules([...rules, newRule]);
    };

    const handleUpdateRule = (id: string, field: keyof ProxyRule, value: any) => {
        const newRules = rules.map(r => r.id === id ? { ...r, [field]: value } : r);
        updateRules(newRules);
    };

    const handleDeleteRule = (id: string) => {
        const newRules = rules.filter(r => r.id !== id);
        updateRules(newRules);
    };

    return (
        <FormGroup>
            <SectionHeader style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                Proxy Rules
                <IconButton onClick={handleAddRule} title="Add Rule">
                    <Plus size={14} />
                </IconButton>
            </SectionHeader>
            <div style={{ fontSize: '0.85em', color: 'var(--vscode-descriptionForeground)', marginBottom: 8 }}>
                Define wildcard overrides (*.example.com). Top-down priority.
            </div>

            <RulesList>
                {rules.map((rule) => (
                    <RuleRow key={rule.id} active={rule.enabled}>
                        <IconButton
                            onClick={() => handleUpdateRule(rule.id, 'enabled', !rule.enabled)}
                            title={rule.enabled ? 'Disable Rule' : 'Enable Rule'}
                            style={{ color: rule.enabled ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-disabledForeground)' }}
                        >
                            {rule.enabled ? <Check size={14} /> : <X size={14} />}
                        </IconButton>

                        <Input
                            value={rule.pattern}
                            onChange={(e) => handleUpdateRule(rule.id, 'pattern', e.target.value)}
                            placeholder="*.example.com"
                        />

                        <Select
                            value={rule.useProxy ? 'proxy' : 'direct'}
                            onChange={(e) => handleUpdateRule(rule.id, 'useProxy', e.target.value === 'proxy')}
                            style={{ width: '80px' }}
                        >
                            <option value="direct">Direct</option>
                            <option value="proxy">Proxy</option>
                        </Select>

                        <IconButton onClick={() => handleDeleteRule(rule.id)} title="Delete Rule">
                            <Trash size={14} />
                        </IconButton>
                    </RuleRow>
                ))}
                {rules.length === 0 && (
                    <div style={{ padding: '10px', textAlign: 'center', opacity: 0.5, fontStyle: 'italic', fontSize: '12px' }}>
                        No rules defined. Global proxy setting applies.
                    </div>
                )}
            </RulesList>
        </FormGroup>
    );
};

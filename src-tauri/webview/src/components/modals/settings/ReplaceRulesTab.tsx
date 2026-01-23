/**
 * ReplaceRulesTab.tsx
 * 
 * Replace rules management for the Settings modal.
 */

import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import styled, { keyframes, css } from 'styled-components';
import {
    ReplaceRuleSettings,
    EnvList,
    EnvItem,
    EnvDetail,
    FormGroup,
    Label,
    Input,
    Select,
    CheckboxLabel,
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

interface ReplaceRulesTabProps {
    rules: ReplaceRuleSettings[];
    selectedRuleId: string | null;
    setSelectedRuleId: (id: string | null) => void;
    onAddRule: () => void;
    onDeleteRule: (id: string) => void;
    onRuleChange: (id: string, field: keyof ReplaceRuleSettings, value: any) => void;
}

export const ReplaceRulesTab: React.FC<ReplaceRulesTabProps> = ({
    rules,
    selectedRuleId,
    setSelectedRuleId,
    onAddRule,
    onDeleteRule,
    onRuleChange,
}) => {
    const selectedRule = rules.find(r => r.id === selectedRuleId);

    // Delete confirmation state
    const [confirmDelete, setConfirmDelete] = useState(false);

    // Reset confirm state when selection changes
    useEffect(() => {
        setConfirmDelete(false);
    }, [selectedRuleId]);

    const handleDeleteClick = () => {
        if (!selectedRuleId) return;

        if (confirmDelete) {
            onDeleteRule(selectedRuleId);
            setConfirmDelete(false);
        } else {
            setConfirmDelete(true);
        }
    };

    return (
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <EnvList>
                <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>Rules</span>
                    <IconButton onClick={onAddRule} title="Add Rule">
                        <Plus size={14} />
                    </IconButton>
                </div>
                {rules.map(rule => (
                    <EnvItem
                        key={rule.id}
                        active={rule.id === selectedRuleId}
                        selected={rule.id === selectedRuleId}
                        onClick={() => setSelectedRuleId(rule.id)}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden', gap: 6 }}>
                            <input
                                type="checkbox"
                                checked={rule.enabled}
                                onChange={(e) => { e.stopPropagation(); onRuleChange(rule.id, 'enabled', e.target.checked); }}
                                onClick={(e) => e.stopPropagation()}
                            />
                            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', opacity: rule.enabled ? 1 : 0.5 }}>
                                {rule.name || rule.id.slice(0, 8)}
                            </span>
                        </div>
                    </EnvItem>
                ))}
                {rules.length === 0 && (
                    <div style={{ padding: '15px', textAlign: 'center', color: 'var(--vscode-disabledForeground)', fontSize: 12 }}>
                        No rules yet.<br />Create one from Proxy view.
                    </div>
                )}
            </EnvList>
            <EnvDetail>
                {selectedRule ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 12 }}>Edit Rule</h3>
                            <DeleteButton
                                onClick={handleDeleteClick}
                                confirming={confirmDelete}
                                title={confirmDelete ? "Click again to confirm delete" : "Delete Rule"}
                            >
                                <Trash2 size={14} />
                            </DeleteButton>
                        </div>
                        <FormGroup>
                            <Label>Name</Label>
                            <Input
                                type="text"
                                value={selectedRule.name || ''}
                                onChange={e => onRuleChange(selectedRule.id, 'name', e.target.value)}
                                placeholder="Rule Name"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>XPath</Label>
                            <Input
                                type="text"
                                value={selectedRule.xpath}
                                onChange={e => onRuleChange(selectedRule.id, 'xpath', e.target.value)}
                                placeholder="//element"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Match Text</Label>
                            <Input
                                type="text"
                                value={selectedRule.matchText}
                                onChange={e => onRuleChange(selectedRule.id, 'matchText', e.target.value)}
                                placeholder="Text to find"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Replace With</Label>
                            <Input
                                type="text"
                                value={selectedRule.replaceWith}
                                onChange={e => onRuleChange(selectedRule.id, 'replaceWith', e.target.value)}
                                placeholder="Replacement text"
                            />
                        </FormGroup>
                        <FormGroup>
                            <Label>Apply To</Label>
                            <Select
                                value={selectedRule.target}
                                onChange={e => onRuleChange(selectedRule.id, 'target', e.target.value)}
                            >
                                <option value="request">Request Only</option>
                                <option value="response">Response Only</option>
                                <option value="both">Both</option>
                            </Select>
                        </FormGroup>
                        <FormGroup>
                            <CheckboxLabel>
                                <input
                                    type="checkbox"
                                    checked={selectedRule.enabled}
                                    onChange={e => onRuleChange(selectedRule.id, 'enabled', e.target.checked)}
                                />
                                Enabled
                            </CheckboxLabel>
                        </FormGroup>
                    </>
                ) : (
                    <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-disabledForeground)' }}>
                        Select a rule to edit
                    </div>
                )}
            </EnvDetail>
        </div>
    );
};

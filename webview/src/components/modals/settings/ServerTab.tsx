/**
 * ServerTab.tsx
 * 
 * Unified server configuration tab for Settings modal.
 * Combines proxy and mock server settings with mode toggle.
 */

import React, { useState } from 'react';
import { Network, Power, Plus, Edit2, Trash2, FolderOpen, RotateCcw, GripVertical } from 'lucide-react';
import {
    DirtySoapConfig,
    ScrollableForm,
    FormGroup,
    Label,
    Input,
    CheckboxLabel,
    SectionHeader,
    IconButton,
    PrimaryButton,
} from './SettingsTypes';
import { ServerMode, MockRule, ServerConfig } from '../../../models';
import { MockRuleModal } from '../MockRuleModal';

interface ServerTabProps {
    config: DirtySoapConfig;
    serverConfig: ServerConfig;
    onServerConfigChange: (updates: Partial<ServerConfig>) => void;

    // Config Switcher
    configPath: string | null;
    onSelectConfigFile: () => void;
    onInjectConfig: () => void;
    onRestoreConfig: () => void;
}

const MODE_OPTIONS: { value: ServerMode; label: string; description: string }[] = [
    { value: 'off', label: 'Off', description: 'Server stopped' },
    { value: 'mock', label: 'Mock', description: 'Return canned responses' },
    { value: 'proxy', label: 'Proxy', description: 'Traffic logging + replace rules' },
    { value: 'both', label: 'Both', description: 'Mock + Proxy rules applied' },
];

export const ServerTab: React.FC<ServerTabProps> = ({
    config,
    serverConfig,
    onServerConfigChange,
    configPath,
    onSelectConfigFile,
    onInjectConfig,
    onRestoreConfig,
}) => {
    const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
    const [ruleModal, setRuleModal] = useState<{ open: boolean; rule?: MockRule | null }>({ open: false });
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const [dropTargetId, setDropTargetId] = useState<string | null>(null);

    const rules = serverConfig.mockRules || [];

    // Drag-drop handlers for rule reordering
    const handleDragStart = (e: React.DragEvent, id: string) => {
        setDraggedId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const handleDragOver = (e: React.DragEvent, id: string) => {
        e.preventDefault();
        if (draggedId && draggedId !== id) {
            setDropTargetId(id);
        }
    };

    const handleDragLeave = () => {
        setDropTargetId(null);
    };

    const handleDrop = (e: React.DragEvent, targetId: string) => {
        e.preventDefault();
        if (!draggedId || draggedId === targetId) return;

        const draggedIndex = rules.findIndex(r => r.id === draggedId);
        const targetIndex = rules.findIndex(r => r.id === targetId);

        if (draggedIndex >= 0 && targetIndex >= 0) {
            const reordered = [...rules];
            const [removed] = reordered.splice(draggedIndex, 1);
            reordered.splice(targetIndex, 0, removed);
            onServerConfigChange({ mockRules: reordered });
        }

        setDraggedId(null);
        setDropTargetId(null);
    };

    const handleDragEnd = () => {
        setDraggedId(null);
        setDropTargetId(null);
    };

    const handleAddRule = () => {
        setRuleModal({ open: true, rule: null });
    };

    const handleEditRule = (rule: MockRule) => {
        setRuleModal({ open: true, rule });
    };

    const handleSaveRule = (rule: MockRule) => {
        const existingIndex = rules.findIndex(r => r.id === rule.id);
        if (existingIndex >= 0) {
            const updated = [...rules];
            updated[existingIndex] = rule;
            onServerConfigChange({ mockRules: updated });
        } else {
            onServerConfigChange({ mockRules: [...rules, rule] });
        }
    };

    const handleDeleteRule = (id: string) => {
        onServerConfigChange({ mockRules: rules.filter(r => r.id !== id) });
        if (selectedRuleId === id) setSelectedRuleId(null);
    };

    const handleToggleRule = (id: string, enabled: boolean) => {
        onServerConfigChange({
            mockRules: rules.map(r => r.id === id ? { ...r, enabled } : r)
        });
    };

    return (
        <ScrollableForm>
            <SectionHeader style={{ marginTop: 0 }}>
                <Network size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Intercepting Server
            </SectionHeader>

            {/* Mode Selector */}
            <FormGroup>
                <Label>Mode</Label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {MODE_OPTIONS.map(opt => (
                        <label
                            key={opt.value}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '8px 14px',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: serverConfig.mode === opt.value
                                    ? 'var(--vscode-button-background)'
                                    : 'var(--vscode-input-background)',
                                color: serverConfig.mode === opt.value
                                    ? 'var(--vscode-button-foreground)'
                                    : 'var(--vscode-input-foreground)',
                                border: '1px solid var(--vscode-input-border)',
                                fontSize: 12,
                            }}
                        >
                            <input
                                type="radio"
                                name="serverMode"
                                value={opt.value}
                                checked={serverConfig.mode === opt.value}
                                onChange={() => onServerConfigChange({ mode: opt.value })}
                                style={{ display: 'none' }}
                            />
                            {opt.label}
                        </label>
                    ))}
                </div>
                <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 6 }}>
                    {MODE_OPTIONS.find(o => o.value === serverConfig.mode)?.description}
                </div>
            </FormGroup>

            {/* Port and Target URL */}
            <div style={{ display: 'flex', gap: 16 }}>
                <FormGroup style={{ flex: 1 }}>
                    <Label>Port</Label>
                    <Input
                        type="number"
                        min={1}
                        max={65535}
                        value={serverConfig.port}
                        onChange={e => onServerConfigChange({ port: parseInt(e.target.value) || 9000 })}
                    />
                </FormGroup>
                <FormGroup style={{ flex: 3 }}>
                    <Label>Target URL</Label>
                    <Input
                        type="text"
                        placeholder="https://api.example.com/services"
                        value={serverConfig.targetUrl}
                        onChange={e => onServerConfigChange({ targetUrl: e.target.value })}
                    />
                </FormGroup>
            </div>

            <FormGroup>
                <CheckboxLabel>
                    <input
                        type="checkbox"
                        checked={serverConfig.useSystemProxy ?? false}
                        onChange={e => onServerConfigChange({ useSystemProxy: e.target.checked })}
                    />
                    Use System Proxy (for corporate proxies)
                </CheckboxLabel>
            </FormGroup>

            {/* Config Switcher */}
            <SectionHeader>
                <FolderOpen size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
                Config Switcher
            </SectionHeader>

            <FormGroup>
                <Label>Web.config / App.config Path</Label>
                <div style={{ display: 'flex', gap: 8 }}>
                    <Input
                        type="text"
                        value={configPath || config.lastConfigPath || ''}
                        placeholder="Select a config file..."
                        readOnly
                        style={{ flex: 1 }}
                    />
                    <IconButton onClick={onSelectConfigFile} title="Browse">
                        <FolderOpen size={14} />
                    </IconButton>
                </div>
            </FormGroup>

            <div style={{ display: 'flex', gap: 10 }}>
                <PrimaryButton
                    onClick={onInjectConfig}
                    disabled={!configPath && !config.lastConfigPath}
                    style={{ opacity: (!configPath && !config.lastConfigPath) ? 0.5 : 1 }}
                >
                    <Power size={12} /> Inject Server URL
                </PrimaryButton>
                <PrimaryButton
                    onClick={onRestoreConfig}
                    disabled={!configPath && !config.lastConfigPath}
                    style={{
                        opacity: (!configPath && !config.lastConfigPath) ? 0.5 : 1,
                        background: 'var(--vscode-button-secondaryBackground)',
                        color: 'var(--vscode-button-secondaryForeground)'
                    }}
                >
                    <RotateCcw size={12} /> Restore Original
                </PrimaryButton>
            </div>

            {/* Mock Options */}
            <>
                <SectionHeader>Mock Options</SectionHeader>

                <FormGroup>
                    <CheckboxLabel>
                        <input
                            type="checkbox"
                            checked={serverConfig.passthroughEnabled}
                            onChange={e => onServerConfigChange({ passthroughEnabled: e.target.checked })}
                        />
                        Forward unmatched requests to target
                    </CheckboxLabel>
                </FormGroup>

                <FormGroup>
                    <CheckboxLabel>
                        <input
                            type="checkbox"
                            checked={serverConfig.recordMode ?? false}
                            onChange={e => onServerConfigChange({ recordMode: e.target.checked })}
                        />
                        <span style={{ color: serverConfig.recordMode ? 'var(--vscode-charts-yellow)' : undefined }}>
                            🔴 Record Mode (auto-capture responses as mocks)
                        </span>
                    </CheckboxLabel>
                </FormGroup>

                {/* Mock Rules List */}
                <FormGroup>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Label style={{ marginBottom: 0 }}>Mock Rules ({rules.length})</Label>
                        <PrimaryButton onClick={handleAddRule} style={{ padding: '4px 10px' }}>
                            <Plus size={12} /> Add Rule
                        </PrimaryButton>
                    </div>

                    {rules.length === 0 ? (
                        <div style={{
                            padding: 20,
                            textAlign: 'center',
                            color: 'var(--vscode-descriptionForeground)',
                            background: 'var(--vscode-input-background)',
                            borderRadius: 4,
                            fontSize: 12
                        }}>
                            No mock rules configured.
                            <br />
                            <span
                                style={{ color: 'var(--vscode-textLink-foreground)', cursor: 'pointer' }}
                                onClick={handleAddRule}
                            >
                                Click to add your first rule.
                            </span>
                        </div>
                    ) : (
                        <div style={{
                            border: '1px solid var(--vscode-input-border)',
                            borderRadius: 4,
                            overflow: 'hidden'
                        }}>
                            {rules.map((rule, index) => (
                                <div
                                    key={rule.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, rule.id)}
                                    onDragOver={(e) => handleDragOver(e, rule.id)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, rule.id)}
                                    onDragEnd={handleDragEnd}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        padding: '8px 12px',
                                        background: draggedId === rule.id
                                            ? 'var(--vscode-editor-selectionBackground)'
                                            : dropTargetId === rule.id
                                                ? 'var(--vscode-list-hoverBackground)'
                                                : selectedRuleId === rule.id
                                                    ? 'var(--vscode-list-activeSelectionBackground)'
                                                    : index % 2 === 0
                                                        ? 'var(--vscode-input-background)'
                                                        : 'transparent',
                                        borderBottom: index < rules.length - 1 ? '1px solid var(--vscode-input-border)' : 'none',
                                        cursor: 'grab',
                                        opacity: draggedId === rule.id ? 0.5 : rule.enabled ? 1 : 0.5,
                                        borderTop: dropTargetId === rule.id ? '2px solid var(--vscode-focusBorder)' : 'none'
                                    }}
                                    onClick={() => setSelectedRuleId(rule.id)}
                                >
                                    <GripVertical size={12} style={{ cursor: 'grab', opacity: 0.5 }} />
                                    <input
                                        type="checkbox"
                                        checked={rule.enabled}
                                        onChange={e => {
                                            e.stopPropagation();
                                            handleToggleRule(rule.id, e.target.checked);
                                        }}
                                        style={{ cursor: 'pointer' }}
                                    />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 500, fontSize: 12 }}>{rule.name}</div>
                                        <div style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)' }}>
                                            {rule.conditions.map(c => `${c.type}: ${c.pattern.substring(0, 25)}${c.pattern.length > 25 ? '...' : ''}`).join(' & ')}
                                        </div>
                                    </div>
                                    {rule.hitCount !== undefined && rule.hitCount > 0 && (
                                        <span style={{ fontSize: 10, opacity: 0.7 }}>({rule.hitCount})</span>
                                    )}
                                    <IconButton onClick={(e) => { e.stopPropagation(); handleEditRule(rule); }} title="Edit">
                                        <Edit2 size={12} />
                                    </IconButton>
                                    <IconButton
                                        onClick={(e) => { e.stopPropagation(); handleDeleteRule(rule.id); }}
                                        title="Delete"
                                        style={{ color: 'var(--vscode-testing-iconFailed)' }}
                                    >
                                        <Trash2 size={12} />
                                    </IconButton>
                                </div>
                            ))}
                        </div>
                    )}
                </FormGroup>
            </>



            {/* Mock Rule Modal */}
            <MockRuleModal
                open={ruleModal.open}
                rule={ruleModal.rule}
                onClose={() => setRuleModal({ open: false })}
                onSave={handleSaveRule}
            />
        </ScrollableForm>
    );
};

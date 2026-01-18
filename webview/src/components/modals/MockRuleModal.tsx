import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { MockRule, MockMatchCondition } from '@shared/models';

interface MockRuleModalProps {
    open: boolean;
    rule?: MockRule | null;
    onClose: () => void;
    onSave: (rule: MockRule) => void;
}

const CONDITION_TYPES: { value: MockMatchCondition['type'], label: string }[] = [
    { value: 'soapAction', label: 'SOAPAction' },
    { value: 'operation', label: 'Operation Name' },
    { value: 'url', label: 'URL Path' },
    { value: 'contains', label: 'Body Contains' },
    { value: 'xpath', label: 'XPath' },
    { value: 'header', label: 'Header' }
];

const DEFAULT_RESPONSE = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <Response>
      <Result>Mock Response</Result>
    </Response>
  </soap:Body>
</soap:Envelope>`;

export const MockRuleModal: React.FC<MockRuleModalProps> = ({
    open,
    rule,
    onClose,
    onSave
}) => {
    const [name, setName] = useState('');
    const [conditions, setConditions] = useState<MockMatchCondition[]>([]);
    const [statusCode, setStatusCode] = useState(200);
    const [responseBody, setResponseBody] = useState(DEFAULT_RESPONSE);
    const [contentType, setContentType] = useState('text/xml; charset=utf-8');
    const [delayMs, setDelayMs] = useState(0);
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (rule) {
            setName(rule.name);
            setConditions([...rule.conditions]);
            setStatusCode(rule.statusCode);
            setResponseBody(rule.responseBody);
            setContentType(rule.contentType || 'text/xml; charset=utf-8');
            setDelayMs(rule.delayMs || 0);
            setEnabled(rule.enabled);
        } else {
            // Reset for new rule
            setName('');
            setConditions([{ type: 'contains', pattern: '' }]);
            setStatusCode(200);
            setResponseBody(DEFAULT_RESPONSE);
            setContentType('text/xml; charset=utf-8');
            setDelayMs(0);
            setEnabled(true);
        }
    }, [rule, open]);

    if (!open) return null;

    const handleSave = () => {
        const validConditions = conditions.filter(c => c.pattern.trim());
        if (validConditions.length === 0) return;

        const newRule: MockRule = {
            id: rule?.id || `mock-${Date.now()}`,
            name: name || 'Unnamed Rule',
            enabled,
            conditions: validConditions,
            statusCode,
            responseBody,
            contentType,
            delayMs: delayMs > 0 ? delayMs : undefined,
            hitCount: rule?.hitCount || 0
        };
        onSave(newRule);
        onClose();
    };

    const addCondition = () => {
        setConditions([...conditions, { type: 'contains', pattern: '' }]);
    };

    const updateCondition = (index: number, updates: Partial<MockMatchCondition>) => {
        setConditions(conditions.map((c, i) => i === index ? { ...c, ...updates } : c));
    };

    const removeCondition = (index: number) => {
        if (conditions.length > 1) {
            setConditions(conditions.filter((_, i) => i !== index));
        }
    };

    const inputStyle: React.CSSProperties = {
        width: '100%',
        padding: '8px 12px',
        backgroundColor: 'var(--vscode-input-background)',
        color: 'var(--vscode-input-foreground)',
        border: '1px solid var(--vscode-input-border)',
        borderRadius: 4,
        fontSize: 13
    };

    const selectStyle: React.CSSProperties = {
        ...inputStyle,
        cursor: 'pointer'
    };

    const labelStyle: React.CSSProperties = {
        display: 'block',
        marginBottom: 6,
        fontSize: 12,
        color: 'var(--vscode-descriptionForeground)'
    };

    const rowStyle: React.CSSProperties = {
        marginBottom: 16
    };

    const hasValidConditions = conditions.some(c => c.pattern.trim());

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
        }} onClick={onClose}>
            <div style={{
                backgroundColor: 'var(--vscode-editor-background)',
                borderRadius: 8,
                width: 600,
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
            }} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--vscode-panel-border)'
                }}>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                        {rule ? 'Edit Mock Rule' : 'Add Mock Rule'}
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: 'var(--vscode-icon-foreground)',
                            padding: 4
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div style={{ padding: 20 }}>
                    {/* Name */}
                    <div style={rowStyle}>
                        <label style={labelStyle}>Rule Name *</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., GetCustomer Success Response"
                            style={inputStyle}
                        />
                    </div>

                    {/* Match Conditions */}
                    <div style={rowStyle}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <label style={{ ...labelStyle, marginBottom: 0 }}>Match Conditions (AND)</label>
                            <button
                                onClick={addCondition}
                                style={{
                                    background: 'none',
                                    border: '1px solid var(--vscode-button-background)',
                                    color: 'var(--vscode-button-background)',
                                    cursor: 'pointer',
                                    padding: '4px 8px',
                                    borderRadius: 4,
                                    fontSize: 12,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 4
                                }}
                            >
                                <Plus size={12} /> Add
                            </button>
                        </div>

                        {conditions.map((condition, index) => (
                            <div key={index} style={{
                                display: 'flex',
                                gap: 8,
                                marginBottom: 8,
                                padding: 10,
                                backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)',
                                borderRadius: 4
                            }}>
                                <select
                                    value={condition.type}
                                    onChange={e => updateCondition(index, { type: e.target.value as MockMatchCondition['type'] })}
                                    style={{ ...selectStyle, width: 140 }}
                                >
                                    {CONDITION_TYPES.map(t => (
                                        <option key={t.value} value={t.value}>{t.label}</option>
                                    ))}
                                </select>

                                {condition.type === 'header' && (
                                    <input
                                        type="text"
                                        value={condition.headerName || ''}
                                        onChange={e => updateCondition(index, { headerName: e.target.value })}
                                        placeholder="Header name"
                                        style={{ ...inputStyle, width: 120 }}
                                    />
                                )}

                                <input
                                    type="text"
                                    value={condition.pattern}
                                    onChange={e => updateCondition(index, { pattern: e.target.value })}
                                    placeholder={
                                        condition.type === 'xpath' ? '//ns:CustomerID' :
                                            condition.type === 'soapAction' ? 'http://example.com/GetCustomer' :
                                                'Match pattern...'
                                    }
                                    style={{ ...inputStyle, flex: 1 }}
                                />

                                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                                    <input
                                        type="checkbox"
                                        checked={condition.isRegex || false}
                                        onChange={e => updateCondition(index, { isRegex: e.target.checked })}
                                    />
                                    Regex
                                </label>

                                <button
                                    onClick={() => removeCondition(index)}
                                    disabled={conditions.length === 1}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        cursor: conditions.length > 1 ? 'pointer' : 'not-allowed',
                                        color: conditions.length > 1 ? 'var(--vscode-testing-iconFailed)' : 'var(--vscode-disabledForeground)',
                                        padding: 4
                                    }}
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Response Configuration */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Status Code</label>
                            <input
                                type="number"
                                value={statusCode}
                                onChange={e => setStatusCode(parseInt(e.target.value) || 200)}
                                style={inputStyle}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Content-Type</label>
                            <select
                                value={contentType}
                                onChange={e => setContentType(e.target.value)}
                                style={selectStyle}
                            >
                                <option value="text/xml; charset=utf-8">text/xml</option>
                                <option value="application/soap+xml; charset=utf-8">application/soap+xml</option>
                                <option value="application/json">application/json</option>
                                <option value="text/plain">text/plain</option>
                            </select>
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={labelStyle}>Delay (ms)</label>
                            <input
                                type="number"
                                value={delayMs}
                                onChange={e => setDelayMs(parseInt(e.target.value) || 0)}
                                min={0}
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Response Body */}
                    <div style={rowStyle}>
                        <label style={labelStyle}>Response Body *</label>
                        <textarea
                            value={responseBody}
                            onChange={e => setResponseBody(e.target.value)}
                            placeholder="Enter response XML/JSON..."
                            style={{
                                ...inputStyle,
                                minHeight: 200,
                                fontFamily: 'monospace',
                                resize: 'vertical'
                            }}
                        />
                    </div>

                    {/* Enabled */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            id="ruleEnabled"
                            checked={enabled}
                            onChange={e => setEnabled(e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <label htmlFor="ruleEnabled" style={{ fontSize: 13, cursor: 'pointer' }}>
                            Enabled
                        </label>
                    </div>
                </div>

                {/* Footer */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: 10,
                    padding: '16px 20px',
                    borderTop: '1px solid var(--vscode-panel-border)'
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: 'none',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 13
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!hasValidConditions}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: hasValidConditions ? 'var(--vscode-button-background)' : 'var(--vscode-disabledForeground)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: 4,
                            cursor: hasValidConditions ? 'pointer' : 'not-allowed',
                            fontSize: 13
                        }}
                    >
                        {rule ? 'Save' : 'Add Rule'}
                    </button>
                </div>
            </div>
        </div>
    );
};

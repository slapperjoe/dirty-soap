import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export interface Breakpoint {
    id: string;
    name?: string;
    enabled: boolean;
    pattern: string;
    isRegex?: boolean;
    target: 'request' | 'response' | 'both';
    matchOn: 'url' | 'body' | 'header';
    headerName?: string;
}

interface BreakpointModalProps {
    open: boolean;
    breakpoint?: Breakpoint | null;
    onClose: () => void;
    onSave: (breakpoint: Breakpoint) => void;
}

export const BreakpointModal: React.FC<BreakpointModalProps> = ({
    open,
    breakpoint,
    onClose,
    onSave
}) => {
    const [name, setName] = useState('');
    const [pattern, setPattern] = useState('');
    const [isRegex, setIsRegex] = useState(false);
    const [target, setTarget] = useState<'request' | 'response' | 'both'>('both');
    const [matchOn, setMatchOn] = useState<'url' | 'body' | 'header'>('body');
    const [headerName, setHeaderName] = useState('');
    const [enabled, setEnabled] = useState(true);

    useEffect(() => {
        if (breakpoint) {
            setName(breakpoint.name || '');
            setPattern(breakpoint.pattern);
            setIsRegex(breakpoint.isRegex || false);
            setTarget(breakpoint.target);
            setMatchOn(breakpoint.matchOn);
            setHeaderName(breakpoint.headerName || '');
            setEnabled(breakpoint.enabled);
        } else {
            // Reset for new breakpoint
            setName('');
            setPattern('');
            setIsRegex(false);
            setTarget('both');
            setMatchOn('body');
            setHeaderName('');
            setEnabled(true);
        }
    }, [breakpoint, open]);

    if (!open) return null;

    const handleSave = () => {
        const bp: Breakpoint = {
            id: breakpoint?.id || `bp-${Date.now()}`,
            name: name || undefined,
            enabled,
            pattern,
            isRegex,
            target,
            matchOn,
            headerName: matchOn === 'header' ? headerName : undefined
        };
        onSave(bp);
        onClose();
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
                width: 450,
                maxHeight: '80vh',
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
                        {breakpoint ? 'Edit Breakpoint' : 'Add Breakpoint'}
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
                    <div style={rowStyle}>
                        <label style={labelStyle}>Name (optional)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g., Break on GetCustomer"
                            style={inputStyle}
                        />
                    </div>

                    <div style={rowStyle}>
                        <label style={labelStyle}>Pattern *</label>
                        <input
                            type="text"
                            value={pattern}
                            onChange={e => setPattern(e.target.value)}
                            placeholder={isRegex ? "e.g., GetCustomer.*Request" : "e.g., GetCustomer"}
                            style={inputStyle}
                        />
                    </div>

                    <div style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            id="isRegex"
                            checked={isRegex}
                            onChange={e => setIsRegex(e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <label htmlFor="isRegex" style={{ fontSize: 13, cursor: 'pointer' }}>
                            Use Regular Expression
                        </label>
                    </div>

                    <div style={{ display: 'flex', gap: 16 }}>
                        <div style={{ ...rowStyle, flex: 1 }}>
                            <label style={labelStyle}>Target</label>
                            <select
                                value={target}
                                onChange={e => setTarget(e.target.value as any)}
                                style={selectStyle}
                            >
                                <option value="both">Both</option>
                                <option value="request">Request Only</option>
                                <option value="response">Response Only</option>
                            </select>
                        </div>

                        <div style={{ ...rowStyle, flex: 1 }}>
                            <label style={labelStyle}>Match On</label>
                            <select
                                value={matchOn}
                                onChange={e => setMatchOn(e.target.value as any)}
                                style={selectStyle}
                            >
                                <option value="body">Body Content</option>
                                <option value="url">URL</option>
                                <option value="header">Header</option>
                            </select>
                        </div>
                    </div>

                    {matchOn === 'header' && (
                        <div style={rowStyle}>
                            <label style={labelStyle}>Header Name</label>
                            <input
                                type="text"
                                value={headerName}
                                onChange={e => setHeaderName(e.target.value)}
                                placeholder="e.g., Content-Type"
                                style={inputStyle}
                            />
                        </div>
                    )}

                    <div style={{ ...rowStyle, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input
                            type="checkbox"
                            id="enabled"
                            checked={enabled}
                            onChange={e => setEnabled(e.target.checked)}
                            style={{ width: 16, height: 16, cursor: 'pointer' }}
                        />
                        <label htmlFor="enabled" style={{ fontSize: 13, cursor: 'pointer' }}>
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
                        disabled={!pattern.trim()}
                        style={{
                            padding: '8px 16px',
                            backgroundColor: pattern.trim() ? 'var(--vscode-button-background)' : 'var(--vscode-disabledForeground)',
                            color: 'var(--vscode-button-foreground)',
                            border: 'none',
                            borderRadius: 4,
                            cursor: pattern.trim() ? 'pointer' : 'not-allowed',
                            fontSize: 13
                        }}
                    >
                        {breakpoint ? 'Save' : 'Add Breakpoint'}
                    </button>
                </div>
            </div>
        </div>
    );
};

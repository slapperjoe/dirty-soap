/**
 * QueryParamsPanel - Key-value editor for REST query parameters
 * Similar to HeadersPanel but for URL query strings
 */

import React from 'react';
import styled from 'styled-components';
import { Plus, Trash2 } from 'lucide-react';
import { MonacoSingleLineInput } from './MonacoSingleLineInput';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 10px;
    gap: 10px;
    overflow-y: auto;
`;

const ParamRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`;

const IconButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 4px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
        color: var(--vscode-foreground);
    }
`;

const Label = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    margin-bottom: 4px;
`;

interface QueryParamsPanelProps {
    params: Record<string, string>;
    onChange: (params: Record<string, string>) => void;
    title?: string;
    paramLabel?: string;
    readOnly?: boolean;
}

export const QueryParamsPanel: React.FC<QueryParamsPanelProps> = ({
    params,
    onChange,
    title = 'Query Parameters',
    paramLabel = 'Param',
    readOnly = false
}) => {
    const entries = Object.entries(params || {});

    const updateParam = (oldKey: string, newKey: string, newValue: string) => {
        if (readOnly) return;
        const newParams = { ...params };
        if (oldKey !== newKey) {
            delete newParams[oldKey];
        }
        newParams[newKey] = newValue;
        onChange(newParams);
    };

    const removeParam = (key: string) => {
        if (readOnly) return;
        const newParams = { ...params };
        delete newParams[key];
        onChange(newParams);
    };

    const addParam = () => {
        if (readOnly) return;
        const newParams = { ...params };
        let count = 1;
        while (newParams[`${paramLabel.toLowerCase()}${count}`]) count++;
        newParams[`${paramLabel.toLowerCase()}${count}`] = '';
        onChange(newParams);
    };

    return (
        <Container>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <h3 style={{ margin: 0 }}>{title}</h3>
                {!readOnly && (
                    <IconButton onClick={addParam} title={`Add ${paramLabel}`}>
                        <Plus size={16} /> Add
                    </IconButton>
                )}
            </div>

            {/* Column Headers */}
            <ParamRow style={{ opacity: 0.7 }}>
                <div style={{ flex: 1 }}><Label>Key</Label></div>
                <div style={{ flex: 1 }}><Label>Value</Label></div>
                {!readOnly && <div style={{ width: 30 }}></div>}
            </ParamRow>

            {entries.length === 0 && (
                <div style={{ opacity: 0.6, fontStyle: 'italic', padding: 10, textAlign: 'center' }}>
                    {readOnly ? `No ${title.toLowerCase()} defined.` : `No ${title.toLowerCase()} defined. Click "Add" to create one.`}
                </div>
            )}

            {entries.map(([key, value], index) => (
                <ParamRow key={index}>
                    <div style={{ flex: 1 }}>
                        <MonacoSingleLineInput
                            value={key}
                            onChange={(newKey: string) => updateParam(key, newKey, value)}
                            placeholder="parameter_name"
                            readOnly={readOnly}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <MonacoSingleLineInput
                            value={value}
                            onChange={(newValue: string) => updateParam(key, key, newValue)}
                            placeholder="value"
                            readOnly={readOnly}
                        />
                    </div>
                    {!readOnly && (
                        <IconButton onClick={() => removeParam(key)} title={`Delete ${paramLabel}`}>
                            <Trash2 size={14} />
                        </IconButton>
                    )}
                </ParamRow>
            ))}

            {entries.length > 0 && (
                <div style={{
                    marginTop: 10,
                    padding: 8,
                    background: 'var(--vscode-textBlockQuote-background)',
                    borderRadius: 4,
                    fontSize: 11,
                    fontFamily: 'monospace',
                    wordBreak: 'break-all'
                }}>
                    <Label>Preview</Label>
                    ?{entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}
                </div>
            )}
        </Container>
    );
};

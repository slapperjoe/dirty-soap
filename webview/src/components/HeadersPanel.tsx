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

const HeaderRow = styled.div`
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

interface HeadersPanelProps {
    headers: Record<string, string>;
    onChange: (headers: Record<string, string>) => void;
}

export const HeadersPanel: React.FC<HeadersPanelProps> = ({ headers, onChange }) => {
    const entries = Object.entries(headers || {});

    const updateHeader = (oldKey: string, newKey: string, newValue: string) => {
        const newHeaders = { ...headers };
        if (oldKey !== newKey) {
            delete newHeaders[oldKey];
        }
        newHeaders[newKey] = newValue;
        onChange(newHeaders);
    };

    const removeHeader = (key: string) => {
        const newHeaders = { ...headers };
        delete newHeaders[key];
        onChange(newHeaders);
    };

    const addHeader = () => {
        const newHeaders = { ...headers };
        // Find unique key
        let count = 1;
        while (newHeaders[`Header${count}`]) count++;
        newHeaders[`Header${count}`] = '';
        onChange(newHeaders);
    };

    return (
        <Container>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                <h3>HTTP Headers</h3>
                <IconButton onClick={addHeader} title="Add Header">
                    <Plus size={16} /> Add
                </IconButton>
            </div>

            {entries.length === 0 && (
                <div style={{ opacity: 0.6, fontStyle: 'italic', padding: 10, textAlign: 'center' }}>
                    No custom headers defined.
                </div>
            )}

            {entries.map(([key, value], index) => (
                <HeaderRow key={index}>
                    <div style={{ flex: 1 }}>
                        <MonacoSingleLineInput
                            value={key}
                            onChange={(newKey: string) => updateHeader(key, newKey, value)}
                            placeholder="Header Name"
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <MonacoSingleLineInput
                            value={value}
                            onChange={(newValue: string) => updateHeader(key, key, newValue)}
                            placeholder="Value"
                        />
                    </div>
                    <IconButton onClick={() => removeHeader(key)} title="Delete Header">
                        <Trash2 size={14} />
                    </IconButton>
                </HeaderRow>
            ))}
        </Container>
    );
};

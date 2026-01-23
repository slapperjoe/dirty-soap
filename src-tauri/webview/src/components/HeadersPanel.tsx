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
    contentType?: string; // Managed by toolbar dropdown, shown read-only here
}

export const HeadersPanel: React.FC<HeadersPanelProps> = ({ headers, onChange, contentType }) => {
    // Filter out Content-Type as it's managed by the toolbar dropdown
    const filteredHeaders = Object.fromEntries(
        Object.entries(headers || {}).filter(([key]) => key.toLowerCase() !== 'content-type')
    );
    const entries = Object.entries(filteredHeaders);
    const displayContentType = contentType || 'application/soap+xml';

    const updateHeader = (oldKey: string, newKey: string, newValue: string) => {
        // Prevent adding Content-Type via this panel
        if (newKey.toLowerCase() === 'content-type') {
            return; // Silently ignore - Content-Type is managed by toolbar
        }
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

            {/* Read-only Content-Type row */}
            <HeaderRow style={{ opacity: 0.7 }}>
                <div style={{ flex: 1 }}>
                    <div style={{
                        padding: '6px 8px',
                        background: 'var(--vscode-input-background)',
                        border: '1px solid var(--vscode-input-border)',
                        borderRadius: 4,
                        color: 'var(--vscode-disabledForeground)',
                        fontFamily: 'monospace',
                        fontSize: 12
                    }}>
                        Content-Type
                    </div>
                </div>
                <div style={{ flex: 1 }}>
                    <div style={{
                        padding: '6px 8px',
                        background: 'var(--vscode-input-background)',
                        border: '1px solid var(--vscode-input-border)',
                        borderRadius: 4,
                        color: 'var(--vscode-disabledForeground)',
                        fontFamily: 'monospace',
                        fontSize: 12
                    }}>
                        {displayContentType}
                    </div>
                </div>
                <div style={{ width: 30, textAlign: 'center', fontSize: 10, opacity: 0.5 }} title="Managed by toolbar dropdown">
                    🔒
                </div>
            </HeaderRow>

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

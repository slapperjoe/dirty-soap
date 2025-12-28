import React, { useState, useEffect } from 'react';
import { Modal, Button } from './Modal';

export interface ExtractorData {
    xpath: string;
    value: string;
    source: 'body' | 'header';
    variableName: string;
}

interface ExtractorModalProps {
    isOpen: boolean;
    data: ExtractorData | null;
    onClose: () => void;
    onSave: (data: ExtractorData) => void;
}

export const ExtractorModal: React.FC<ExtractorModalProps> = ({ isOpen, data, onClose, onSave }) => {
    const [localData, setLocalData] = useState<ExtractorData>({ xpath: '', value: '', source: 'body', variableName: '' });

    useEffect(() => {
        if (isOpen && data) {
            setLocalData(data);
        }
    }, [isOpen, data]);

    if (!isOpen || !data) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Create Property Extractor"
            width={600}
            footer={
                <>
                    <Button onClick={onClose} style={{ marginRight: 10, background: 'transparent', border: '1px solid var(--vscode-button-secondaryForeground)' }}>Cancel</Button>
                    <Button onClick={() => onSave(localData)} disabled={!localData.variableName.trim()}>Save Extractor</Button>
                </>
            }
        >
            <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Target Variable Name</label>
                <input
                    style={{ width: '100%', padding: 8, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 2 }}
                    value={localData.variableName}
                    placeholder="e.g. authToken"
                    onChange={(e) => setLocalData({ ...localData, variableName: e.target.value })}
                    autoFocus
                />
                <div style={{ fontSize: '0.8em', opacity: 0.7, marginTop: 4 }}>
                    This variable will be available in subsequent steps as <code>{'${#TestCase#VariableName}'}</code>.
                </div>
            </div>

            <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>XPath Expression</label>
                <textarea
                    style={{ width: '100%', height: 60, padding: 8, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)', borderRadius: 2, fontFamily: 'monospace', fontSize: '0.9em' }}
                    value={localData.xpath}
                    onChange={(e) => setLocalData({ ...localData, xpath: e.target.value })}
                />
            </div>

            <div style={{ marginBottom: 10 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 'bold' }}>Value Preview</label>
                <div style={{ padding: 8, background: 'var(--vscode-textCodeBlock-background)', borderRadius: 2, fontFamily: 'monospace', fontSize: '0.9em', maxHeight: 100, overflow: 'auto', whiteSpace: 'pre-wrap', border: '1px solid var(--vscode-panel-border)' }}>
                    {localData.value}
                </div>
            </div>
        </Modal>
    );
};

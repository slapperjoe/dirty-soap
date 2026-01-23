import React, { useState, useEffect } from 'react';
import { Modal, Button } from './Modal';

interface RenameModalProps {
    isOpen: boolean;
    title: string; // e.g., "Rename Project"
    initialValue: string;
    onSave: (newValue: string) => void;
    onCancel: () => void;
}

export const RenameModal: React.FC<RenameModalProps> = ({ isOpen, title, initialValue, onSave, onCancel }) => {
    const [value, setValue] = useState(initialValue);

    useEffect(() => {
        if (isOpen) setValue(initialValue);
    }, [isOpen, initialValue]);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={title}
            footer={
                <Button onClick={() => onSave(value)}>Save</Button>
            }
        >
            <input
                style={{
                    width: '100%',
                    padding: 5,
                    background: 'var(--vscode-input-background)',
                    color: 'var(--vscode-input-foreground)',
                    border: '1px solid var(--vscode-input-border)',
                    outline: 'none'
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                    if (e.key === 'Enter') onSave(value);
                    if (e.key === 'Escape') onCancel();
                }}
            />
        </Modal>
    );
};

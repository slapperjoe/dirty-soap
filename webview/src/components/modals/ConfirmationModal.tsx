import React from 'react';
import { Modal, Button } from './Modal';

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({ isOpen, title, message, onConfirm, onCancel }) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title={title}
            footer={
                <>
                    <Button onClick={onCancel} style={{ background: 'transparent', border: '1px solid var(--vscode-button-secondaryForeground)', color: 'var(--vscode-button-secondaryForeground)' }}>Cancel</Button>
                    <Button onClick={onConfirm} style={{ background: 'var(--vscode-errorForeground)', color: 'white' }}>Delete</Button>
                </>
            }
        >
            <div style={{ padding: '10px 0' }}>
                {message}
            </div>
        </Modal>
    );
};

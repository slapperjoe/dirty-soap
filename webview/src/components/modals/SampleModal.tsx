import React from 'react';
import { Modal } from './Modal';
import { SchemaViewer } from '../SchemaViewer';

interface SampleModalProps {
    isOpen: boolean;
    operationName: string;
    schema: any | null;
    onClose: () => void;
}

export const SampleModal: React.FC<SampleModalProps> = ({ isOpen, operationName, schema, onClose }) => {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={`Schema: ${operationName}`}
            width={600}
        >
            <div style={{ height: 500, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                {schema && <SchemaViewer schema={schema} />}
            </div>
        </Modal>
    );
};

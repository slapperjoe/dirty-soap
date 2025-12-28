import React, { ReactNode } from 'react';
import styled from 'styled-components';
import { X } from 'lucide-react';

export const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
`;

export const ModalContent = styled.div<{ width?: string | number }>`
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  width: ${props => typeof props.width === 'number' ? `${props.width}px` : (props.width || '400px')};
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
`;

export const ModalHeader = styled.div`
    padding: 10px 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const ModalTitle = styled.div`
    font-weight: bold;
`;

export const ModalBody = styled.div`
    padding: 15px;
    overflow-y: auto;
    flex: 1;
`;

export const ModalFooter = styled.div`
    padding: 10px 15px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

export const Button = styled.button`
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
  &:disabled {
    opacity: 0.5;
    cursor: NOT-allowed;
  }
`;

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    footer?: ReactNode;
    width?: string | number;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, footer, width }) => {
    if (!isOpen) return null;

    return (
        <ModalOverlay onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
        }}>
            <ModalContent width={width}>
                <ModalHeader>
                    <ModalTitle>{title}</ModalTitle>
                    <Button onClick={onClose} style={{ background: 'transparent' }}><X size={16} /></Button>
                </ModalHeader>
                <ModalBody>
                    {children}
                </ModalBody>
                {footer && (
                    <ModalFooter>
                        {footer}
                    </ModalFooter>
                )}
            </ModalContent>
        </ModalOverlay>
    );
};

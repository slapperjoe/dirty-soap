import React, { ReactNode } from 'react';
import styled, { keyframes } from 'styled-components';
import { X } from 'lucide-react';

const overlayEnter = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  /* VS Code doesn't have a standard modal backdrop variable, but we can try to matches quick input backdrop if available, otherwise fallback to existing but maybe valid? 
     Actually, standard VS Code usually just dims. 
     Let's try to find a variable or keep it if no good match. 
     QuickInput uses 'pickerGroup.border' maybe? No. 
     Let's stick to the shadow replacement and maybe use a variable for the overlay if I find one. 
     For now, replacing the shadow. */
  background-color: rgba(0, 0, 0, 0.5); 
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  animation: ${overlayEnter} 0.2s ease-out;
`;


const modalEnter = keyframes`
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
`;

const ModalContent = styled.div<{ width?: string | number }>`
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px var(--vscode-widget-shadow);
  width: ${props => typeof props.width === 'number' ? `${props.width}px` : (props.width || '400px')};
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  animation: ${modalEnter} 0.2s ease-out;
`;

const ModalHeader = styled.div`
    padding: 10px 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const ModalTitle = styled.div`
    font-weight: bold;
`;

const ModalBody = styled.div`
    padding: 15px;
    overflow-y: auto;
    flex: 1;
`;

const ModalFooter = styled.div`
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

const IconButton = styled.button`
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--vscode-icon-foreground);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 4px;
  &:hover {
    background: var(--vscode-toolbar-hoverBackground);
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
          <IconButton onClick={onClose} title="Close"><X size={16} /></IconButton>
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

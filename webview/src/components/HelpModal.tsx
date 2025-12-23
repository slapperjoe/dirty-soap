import React from 'react';
import styled from 'styled-components';
import { X, Globe, Shield, Terminal } from 'lucide-react';

const Overlay = styled.div`
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

const ModalContainer = styled.div`
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  border: 1px solid var(--vscode-widget-border);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.5);
  width: 600px;
  max-width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  border-radius: 4px;
`;

const ModalHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background-color: var(--vscode-titleBar-activeBackground);
  color: var(--vscode-titleBar-activeForeground);
  font-weight: bold;
`;

const CloseButton = styled.button`
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  &:hover {
    color: var(--vscode-button-hoverBackground);
  }
`;

const ModalContent = styled.div`
  padding: 20px;
  overflow-y: auto;
  line-height: 1.6;

  h3 {
    margin-top: 20px;
    margin-bottom: 10px;
    border-bottom: 1px solid var(--vscode-settings-headerBorder);
    padding-bottom: 5px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  ul {
    padding-left: 20px;
  }

  code {
      font-family: var(--vscode-editor-font-family);
      background-color: var(--vscode-textBlockQuote-background);
      padding: 2px 4px;
      border-radius: 3px;
  }
`;

interface HelpModalProps {
    onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
    return (
        <Overlay onClick={onClose}>
            <ModalContainer onClick={(e) => e.stopPropagation()}>
                <ModalHeader>
                    Dirty Soap Help
                    <CloseButton onClick={onClose}><X size={18} /></CloseButton>
                </ModalHeader>
                <ModalContent>
                    <p>Welcome to <strong>Dirty Soap</strong>, your Visual SOAP Client for VS Code.</p>

                    <h3><Globe size={16} /> Loading WSDLs</h3>
                    <ul>
                        <li><strong>URL:</strong> Enter the full URL to the WSDL (e.g., <code>https://example.com/service?wsdl</code>).</li>
                        <li><strong>File:</strong> Select a local <code>.wsdl</code> file from your filesystem.</li>
                    </ul>

                    <h3><Shield size={16} /> Network & Security (New!)</h3>
                    <ul>
                        <li><strong>Proxy Support:</strong> The extension automatically detects your system or VS Code proxy settings (<code>HTTP_PROXY</code>, <code>HTTPS_PROXY</code>). It supports authenticated proxies and correctly tunnels HTTPS.</li>
                        <li><strong>SSL Handling:</strong> For WSDL parsing and requests, SSL certificate verification is <strong>disabled</strong> by default. This allows you to work with internal dev servers using self-signed certificates without configuration.</li>
                        <li><strong>Headers:</strong> Requests mimic a standard browser User-Agent to ensure compatibility with strict firewalls (WAFs).</li>
                    </ul>

                    <h3><Terminal size={16} /> Request Variables</h3>
                    <p>You can use dynamic variables in your requests to avoid hardcoding values:</p>
                    <ul>
                        <li>Syntax: <code>{`{{VariableName}}`}</code></li>
                        <li>Define these variables in the <strong>Settings</strong> menu.</li>
                        <li>Useful for tokens, session IDs, or environment-specific URLs.</li>
                    </ul>

                    <h3>Tips</h3>
                    <ul>
                        <li>Use the <strong>"Wrap Text"</strong> button in the footer to toggle word wrap.</li>
                        <li>Right-click on Operations to <strong>Add to Project</strong>.</li>
                        <li>Requests marked with a yellow dot (●) have unsaved changes.</li>
                    </ul>
                </ModalContent>
            </ModalContainer>
        </Overlay>
    );
};

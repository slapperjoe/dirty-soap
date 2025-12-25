import React, { useState } from 'react';
import styled from 'styled-components';
import { X, MonitorPlay, Eye, FileJson } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
`;

const ModalContent = styled.div`
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--vscode-panel-border);
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
  width: 900px;
  max-width: 95%;
  height: 80vh;
  display: flex;
  flex-direction: column;
`;

const ModalHeader = styled.div`
    padding: 10px 15px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background-color: var(--vscode-editorGroupHeader-tabsBackground);
`;

const ModalBody = styled.div`
    flex: 1;
    display: flex;
    overflow: hidden;
`;

const Sidebar = styled.div`
    width: 200px;
    background-color: var(--vscode-sideBar-background);
    border-right: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
`;

const Tab = styled.button<{ active: boolean }>`
    background: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)'};
    border: none;
    padding: 10px 15px;
    text-align: left;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;

    &:hover {
        background: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

const ContentArea = styled.div`
    flex: 1;
    padding: 20px 30px;
    overflow-y: auto;
    background-color: var(--vscode-editor-background);

    h1 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 10px; margin-bottom: 20px; font-size: 24px; }
    h2 { margin-top: 25px; margin-bottom: 15px; font-size: 18px; color: var(--vscode-textLink-foreground); }
    h3 { margin-top: 20px; margin-bottom: 10px; font-size: 16px; font-weight: bold; }
    p { margin-bottom: 15px; line-height: 1.5; }
    ul { margin-left: 20px; margin-bottom: 15px; }
    li { margin-bottom: 5px; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 15px; border-radius: 4px; overflow-x: auto; margin-bottom: 15px; }
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    &:hover { color: var(--vscode-errorForeground); }
`;

interface HelpModalProps {
  onClose: () => void;
}

const SECTIONS = [
  {
    id: 'wsdl-editor',
    label: 'WSDL Editor',
    icon: FileJson,
    content: `
# WSDL Request Editor

The core of Dirty SOAP is the interactive WSDL Editor. It allows you to explore SOAP services, construct requests, and analyze responses directly within VS Code.

## Key Features

### 1. Request Construction
- **Auto-Generation**: Requests are automatically generated from the WSDL schema with placeholder "wildcards" (e.g., \`?\`).
- **Inline Formatting**: Toggle between "Block" and "Inline" value formatting using the **Align Left** icon in the editor toolbar.
- **Causality Data Stripping**: Hide annoying VS Debugger causality data (comments and elements) using the **Bug** icon.

### 2. Response Analysis
- **Syntax Highlighting**: Responses are formatted and highlighted as XML.
- **Headers Tab**: View both Request headers (editable) and Response headers (read-only).
- **Assertions**: Define XPath or Regex assertions to validate responses automatically (Green/Red indicators in the sidebar).

### 3. Environment Variables
- Use \`{{variable}}\` syntax in your requests or headers.
- Define environments in the **Settings** (Gear Icon).
- Switch environments using the dropdown in the editor toolbar.

### 4. User JS Wildcards
- Use \`{{js:MyScript}}\` to execute custom JavaScript located in \`.dirty-soap/scripts/MyScript.js\`.
- The script should export a function returning a string.
`
  },
  {
    id: 'dirty-proxy',
    label: 'Dirty Proxy',
    icon: MonitorPlay,
    content: `
# Dirty Proxy

The "Dirty Proxy" allows you to intercept and monitor HTTP/S traffic between your application and backend SOAP services without setting up complex tools like Fiddler or Wireshark.

## getting Started

1.  **Configure**: Set the **Port** (e.g., 3000) and **Target URL** (the real backend service) in the Proxy tab.
2.  **Start**: Click "Start Proxy". The indicator will turn Green.
3.  **Route Traffic**: Point your application (or \`web.config\`) to \`http://localhost:3000\` instead of the real URL.
4.  **Monitor**: Requests will appear in the "Live Traffic" list.

## advanced Features

### HTTPS Support
The proxy automatically generates a self-signed certificate to handle HTTPS traffic.
- If your target is \`https://\`, the proxy will listen on HTTPS as well.
- You may need to trust the generated certificate or ignore SSL errors in your client application.

### Comparison & Diffing
- Click on any traffic item to inspect the Request and Response.
- **Single Save**: Click the **Download** icon next to an item to save a Markdown report of that specific transaction.

### Persistence
- The last used Proxy Target is remembered across sessions.
`
  },
  {
    id: 'file-watcher',
    label: 'File Watcher',
    icon: Eye,
    content: `
# File Watcher

The File Watcher allows Dirty SOAP to act as a viewer for external processes that write SOAP requests/responses to disk (common in legacy enterprise systems).

## Setup

1.  Create a folder named \`.dirty-soap/watch\` in your workspace.
2.  Configure your external application to write:
    -   Outgoing XML to \`requestXML.xml\`
    -   Incoming XML to \`responseXML.xml\`
3.  Click **Start Watcher** in the Dirty SOAP sidebar.

## Functionality

- **Real-time Updates**: The sidebar list will update automatically whenever these files change.
- **Smart Naming**: The watcher attempts to name the event based on the first child element of \`soap:Body\`.
- **Read-Only View**: Watcher items are read-only but can be inspected just like regular requests.
- **Debouncing**: Rapid file writes are debounced to prevent flooding the UI.
`
  }
];

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  const [activeTabId, setActiveTabId] = useState(SECTIONS[0].id);
  const activeSection = SECTIONS.find(s => s.id === activeTabId) || SECTIONS[0];

  return (
    <ModalOverlay onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <ModalContent>
        <ModalHeader>
          <div style={{ fontWeight: 'bold' }}>Dirty Soap Help</div>
          <CloseButton onClick={onClose}>
            <X size={20} />
          </CloseButton>
        </ModalHeader>
        <ModalBody>
          <Sidebar>
            {SECTIONS.map(section => (
              <Tab
                key={section.id}
                active={activeTabId === section.id}
                onClick={() => setActiveTabId(section.id)}
              >
                <section.icon size={16} />
                {section.label}
              </Tab>
            ))}
          </Sidebar>
          <ContentArea>
            <ReactMarkdown>{activeSection.content}</ReactMarkdown>
          </ContentArea>
        </ModalBody>
      </ModalContent>
    </ModalOverlay>
  );
};

import React, { useState } from 'react';
import styled from 'styled-components';
import { X, MonitorPlay, Eye, FileJson, Network, Radio } from 'lucide-react';
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
    id: 'server',
    label: 'Server (Unified)',
    icon: Network,
    content: `
# Unified Server

The **Server** tab provides a unified interface for both Proxy and Mock server functionality. Choose from four modes:

## Server Modes

| Mode | Description |
|------|-------------|
| **Off** | Server stopped |
| **Mock** | Return canned responses matching your rules |
| **Proxy** | Traffic logging with breakpoints and replace rules |
| **Both** | Mock + Proxy combined |

## Using the Server Tab

1. **Select Mode**: Click the mode button (Mock, Proxy, or Both)
2. **Start Server**: Click the Play button to start
3. **Monitor Traffic**: View combined traffic history below

## Mode-Specific Features

When **Mock** or **Both** is selected:
- **Mock Rules** section appears for managing mock responses
- Add, edit, toggle, and delete rules directly from the sidebar

When **Proxy** or **Both** is selected:
- **Breakpoints** section appears for request/response interception
- Pause and modify traffic in real-time

## Settings

Click the **Gear** icon to open settings with:
- Port and Target URL configuration
- Replace Rules management
- Advanced mock options (passthrough, record mode)
`
  },
  {
    id: 'dirty-proxy',
    label: 'Dirty Proxy',
    icon: MonitorPlay,
    content: `
# Dirty Proxy

The Dirty Proxy intercepts and monitors HTTP/S traffic between your application and backend SOAP services.

## Getting Started

1.  **Configure**: Set the **Port** (e.g., 9000) and **Target URL** in Settings → Server tab
2.  **Start**: Select **Proxy** or **Both** mode in the Server tab, then click Start
3.  **Route Traffic**: Point your application to \`http://localhost:9000\` instead of the real URL
4.  **Monitor**: Requests appear in the Traffic history

## Breakpoints

Breakpoints let you pause and modify requests/responses in real-time:

- **Add Breakpoint**: Click + in the Breakpoints section
- **Pattern Matching**: Match by URL, operation name, or custom regex
- **Target**: Choose to break on Request, Response, or Both
- **Timeout**: Set auto-resume timeout (default 30s)

## Replace Rules

Replace Rules automatically modify content in-flight:
- Configure in **Settings → Replace Rules** tab
- XPath-scoped replacement for surgical edits
- Apply to requests, responses, or both

## HTTPS Support

The proxy automatically generates certificates for HTTPS traffic.
- Trust the certificate or ignore SSL errors in your client
`
  },
  {
    id: 'mock-server',
    label: 'Mock Server',
    icon: Radio,
    content: `
# Mock Server

The Mock Server returns predefined responses without hitting the real backend. Ideal for:
- Offline development
- Testing error scenarios
- Simulating slow responses

## Getting Started

1. Select **Mock** or **Both** mode in the Server tab
2. Add mock rules to define responses
3. Start the server
4. Point your application to the mock server

## Mock Rules

Each rule defines when and what to respond:

### Matching Conditions
- **URL Path**: Match specific endpoints
- **XPath**: Match XML content within requests
- **Regex**: Advanced pattern matching

### Response Configuration
- **Status Code**: HTTP status (200, 500, etc.)
- **Response Body**: The XML/JSON to return
- **Headers**: Custom response headers
- **Delay**: Simulate network latency

## Special Features

### Record Mode
Enable to auto-capture real responses as mock rules:
1. Turn on "Record Mode" in settings
2. Send requests through the mock server
3. Real responses are saved as new rules

### Passthrough
Unmatched requests can be forwarded to the real backend:
- Enable "Forward unmatched requests" in settings
- Optionally route passthrough through Dirty Proxy
`
  },
  {
    id: 'file-watcher',
    label: 'File Watcher',
    icon: Eye,
    content: `
# File Watcher

The File Watcher monitors external processes that write SOAP requests/responses to disk.

## Setup

1.  Create a folder named \`.dirty-soap/watch\` in your workspace
2.  Configure your external application to write:
    -   Outgoing XML to \`requestXML.xml\`
    -   Incoming XML to \`responseXML.xml\`
3.  Click **Start Watcher** in the Dirty SOAP sidebar

## Functionality

- **Real-time Updates**: The sidebar updates when files change
- **Smart Naming**: Events are named based on the first child of \`soap:Body\`
- **Read-Only View**: Watcher items can be inspected but not edited
- **Debouncing**: Rapid file writes are batched to prevent UI flooding
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

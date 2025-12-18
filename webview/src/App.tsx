import { useState, useEffect } from 'react';
import styled from 'styled-components';
import { vscode } from './vscode';
import { RequestEditor } from './components/RequestEditor';
import { ResponseViewer } from './components/ResponseViewer';

// Define types locally
interface SoapOperation {
    name: string;
    input: any;
    output: any;
    description?: string;
    targetNamespace?: string;
}

interface SoapService {
    name: string;
    ports: string[];
    operations: SoapOperation[];
}

const Container = styled.div`
  display: flex;
  height: 100vh;
  background-color: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
`;

const Sidebar = styled.div`
  width: 300px;
  border-right: 1px solid var(--vscode-sideBar-border);
  background-color: var(--vscode-sideBar-background);
  display: flex;
  flex-direction: column;
`;

const SidebarHeader = styled.div`
  padding: 10px;
  border-bottom: 1px solid var(--vscode-sideBar-border);
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Input = styled.input`
  background: var(--vscode-input-background);
  color: var(--vscode-input-foreground);
  border: 1px solid var(--vscode-input-border);
  padding: 4px;
  width: 100%;
  margin-bottom: 8px;
`;

const Button = styled.button`
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  border: none;
  padding: 6px 12px;
  cursor: pointer;
  width: 100%;
  &:hover {
    background: var(--vscode-button-hoverBackground);
  }
`;

const ServiceItem = styled.div`
  padding: 5px 10px;
  font-weight: bold;
`;

const OperationItem = styled.div<{ active: boolean }>`
  padding: 4px 10px 4px 25px;
  cursor: pointer;
  background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
  color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
  &:hover {
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
  }
`;

function App() {
    const [wsdlUrl, setWsdlUrl] = useState('http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL');
    const [inputType, setInputType] = useState<'url' | 'file'>('url');
    const [localFiles, setLocalFiles] = useState<string[]>([]);
    const [selectedFile, setSelectedFile] = useState('');
    const [services, setServices] = useState<SoapService[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [selectedOperation, setSelectedOperation] = useState<SoapOperation | null>(null);
    const [response, setResponse] = useState<any>(null);

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                case 'wsdlParsed':
                    setServices(message.services);
                    setLoading(false);
                    break;
                case 'response':
                    setResponse(message.result);
                    setLoading(false);
                    break;
                case 'error':
                    setError(message.message);
                    setLoading(false);
                    break;
                case 'localWsdls':
                    setLocalFiles(message.files);
                    if (message.files.length > 0 && !selectedFile) {
                        setSelectedFile(message.files[0]);
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedFile]);

    useEffect(() => {
        if (inputType === 'file') {
            vscode.postMessage({ command: 'getLocalWsdls' });
        }
    }, [inputType]);

    const loadWsdl = () => {
        setLoading(true);
        setError(null);
        vscode.postMessage({
            command: 'loadWsdl',
            url: inputType === 'url' ? wsdlUrl : selectedFile,
            isLocal: inputType === 'file'
        });
    };

    const executeRequest = (xml: string) => {
        setResponse(null);
        setLoading(true);
        vscode.postMessage({
            command: 'executeRequest',
            url: inputType === 'url' ? wsdlUrl : selectedFile, // pass relevant ID/URL
            operation: selectedOperation?.name,
            xml: xml
        });
    };

    const cancelRequest = () => {
        setLoading(false);
        vscode.postMessage({
            command: 'cancelRequest'
        });
    };

    const downloadWsdl = () => {
        setLoading(true);
        setError(null);
        vscode.postMessage({
            command: 'downloadWsdl',
            url: wsdlUrl
        });
    };

    return (
        <Container>
            <Sidebar>
                {/* ... Sidebar content unchanged ... */}
                <SidebarHeader>
                    <div style={{ marginBottom: 5, fontWeight: 'bold' }}>Dirty SOAP</div>

                    <div style={{ display: 'flex', marginBottom: 8, gap: 10 }}>
                        <label>
                            <input
                                type="radio"
                                checked={inputType === 'url'}
                                onChange={() => setInputType('url')}
                            /> URL
                        </label>
                        <label>
                            <input
                                type="radio"
                                checked={inputType === 'file'}
                                onChange={() => setInputType('file')}
                            /> File
                        </label>
                    </div>

                    {inputType === 'url' ? (
                        <Input
                            value={wsdlUrl}
                            onChange={(e) => setWsdlUrl(e.target.value)}
                            placeholder="WSDL URL"
                        />
                    ) : (
                        <select
                            style={{ width: '100%', marginBottom: 8, padding: 4, background: 'var(--vscode-input-background)', color: 'var(--vscode-input-foreground)', border: '1px solid var(--vscode-input-border)' }}
                            value={selectedFile}
                            onChange={(e) => setSelectedFile(e.target.value)}
                        >
                            {localFiles.length === 0 ? <option value="">No files found</option> : null}
                            {localFiles.map(file => (
                                <option key={file} value={file}>{file}</option>
                            ))}
                        </select>
                    )}

                    {inputType === 'url' ? (
                        <div style={{ display: 'flex', gap: 5 }}>
                            <Button onClick={loadWsdl} disabled={loading} style={{ flex: 2 }}>
                                {loading ? 'Loading...' : 'Load WSDL'}
                            </Button>
                            <Button
                                onClick={downloadWsdl}
                                disabled={loading}
                                title="Download WSDL and imports to local files"
                                style={{ flex: 1, backgroundColor: 'var(--vscode-button-secondaryBackground)', color: 'var(--vscode-button-secondaryForeground)' }}
                            >
                                ⇩
                            </Button>
                        </div>
                    ) : (
                        <Button onClick={loadWsdl} disabled={loading}>
                            {loading ? 'Loading...' : 'Load WSDL'}
                        </Button>
                    )}
                </SidebarHeader>
                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {services.map((service, i) => (
                        <div key={i}>
                            <ServiceItem>{service.name}</ServiceItem>
                            {service.operations.map((op, j) => (
                                <OperationItem
                                    key={j}
                                    active={selectedOperation === op}
                                    onClick={() => { setSelectedOperation(op); setResponse(null); }}
                                >
                                    {op.name}
                                </OperationItem>
                            ))}
                        </div>
                    ))}
                </div>
            </Sidebar>
            <Content>
                {error && <div style={{ padding: 20, color: 'var(--vscode-errorForeground)' }}>Error: {error}</div>}

                {selectedOperation ? (
                    <>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                            <RequestEditor
                                operation={selectedOperation}
                                onExecute={executeRequest}
                                onCancel={cancelRequest}
                                loading={loading}
                            />
                        </div>
                        {response && <ResponseViewer response={response} />}
                    </>
                ) : (
                    <div style={{ padding: 20 }}>
                        <h1>Welcome to Dirty SOAP</h1>
                        <p>Load a WSDL to see available operations.</p>
                    </div>
                )}
            </Content>
        </Container>
    );
}

export default App;

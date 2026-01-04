import React, { useState } from 'react';
import { Globe, FileCode, Play, Plus, Trash2 } from 'lucide-react';
import { SoapUIInterface, SoapUIOperation, SoapUIRequest } from '../../models';
import { HeaderButton, SectionHeader, Input } from './shared/SidebarStyles';
import { ServiceTree } from './ServiceTree';

// Default public SOAP services for testing
const DEFAULT_WSDL_URLS = [
    { url: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL', label: 'Country Info Service' },
    { url: 'http://www.dneonline.com/calculator.asmx?WSDL', label: 'Calculator Service' },
    { url: 'https://www.dataaccess.com/webservicesserver/numberconversion.wso?WSDL', label: 'Number Conversion' },
    { url: 'https://www.w3schools.com/xml/tempconvert.asmx?WSDL', label: 'Temperature Converter' },
];

export interface WsdlExplorerProps {
    exploredInterfaces: SoapUIInterface[];
    backendConnected: boolean;
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    wsdlUrlHistory?: string[];
    selectedFile: string | null;
    loadWsdl: () => void;
    pickLocalWsdl: () => void;
    downloadStatus: string[] | null;

    // Proxy toggle
    useProxy?: boolean;
    setUseProxy?: (useProxy: boolean) => void;

    // Actions
    addToProject: (iface: SoapUIInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: SoapUIInterface) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;

    // Selection State
    selectedInterface: SoapUIInterface | null;
    setSelectedInterface: (iface: SoapUIInterface | null) => void;
    selectedOperation: SoapUIOperation | null;
    setSelectedOperation: (op: SoapUIOperation | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setResponse: (res: any) => void;

    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
}

export const WsdlExplorer: React.FC<WsdlExplorerProps> = ({
    exploredInterfaces,
    backendConnected,
    inputType,
    setInputType,
    wsdlUrl,
    setWsdlUrl,
    wsdlUrlHistory = [],
    selectedFile,
    loadWsdl,
    pickLocalWsdl,
    downloadStatus,
    useProxy,
    setUseProxy,
    addToProject,
    addAllToProject,
    clearExplorer,
    removeFromExplorer,
    toggleExploredInterface,
    toggleExploredOperation,
    selectedInterface,
    setSelectedInterface,
    selectedOperation,
    setSelectedOperation,
    selectedRequest,
    setSelectedRequest,
    setResponse,
    handleContextMenu
}) => {
    // Local state for delete confirmation
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // Local state for URL dropdown
    const [showUrlDropdown, setShowUrlDropdown] = useState(false);

    // Build dropdown options: user history first, then defaults
    const userHistoryUrls = wsdlUrlHistory.filter(url => !DEFAULT_WSDL_URLS.some(d => d.url === url));
    const dropdownOptions = [
        ...userHistoryUrls.map(url => {
            let label = url;
            try { label = new URL(url).hostname; } catch { /* use full url */ }
            return { url, label, isHistory: true };
        }),
        ...DEFAULT_WSDL_URLS.map(item => ({ url: item.url, label: item.label, isHistory: false }))
    ];


    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

            <div style={{ borderBottom: '1px solid var(--vscode-sideBarSectionHeader-border)' }}>
                <SectionHeader>
                    <div style={{ fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--vscode-sideBarTitle-foreground)', flex: 1, display: 'flex', alignItems: 'center', gap: 5 }}>
                        WSDL Explorer
                        <div style={{
                            width: 8, height: 8, borderRadius: '50%',
                            backgroundColor: backendConnected ? '#4caf50' : '#f44336',
                            marginLeft: 10
                        }} title={backendConnected ? "Backend Connected" : "Backend Disconnected"}></div>
                    </div>
                    {exploredInterfaces.length > 0 && (
                        <>
                            <div style={{ flex: 1 }}></div>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); addAllToProject(); }} title="Add All to Project">
                                <Plus size={16} />
                            </HeaderButton>
                            <HeaderButton onClick={(e) => { e.stopPropagation(); clearExplorer(); }} title="Clear Explorer">
                                <Trash2 size={16} />
                            </HeaderButton>
                        </>
                    )}
                </SectionHeader>
            </div>

            <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
                {/* Input Buttons */}
                <div style={{ display: 'flex', gap: 5 }}>
                    <HeaderButton onClick={() => setInputType('url')} title="Load from URL"
                        style={{ flex: 1, textAlign: 'center', backgroundColor: inputType === 'url' ? 'var(--vscode-button-background)' : 'transparent', color: inputType === 'url' ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-button-border)', marginLeft: 0, gap: 5, justifyContent: 'center' }}>
                        <Globe size={14} /> URL
                    </HeaderButton>
                    <HeaderButton onClick={() => setInputType('file')} title="Load from File"
                        style={{ flex: 1, textAlign: 'center', backgroundColor: inputType === 'file' ? 'var(--vscode-button-background)' : 'transparent', color: inputType === 'file' ? 'var(--vscode-button-foreground)' : 'inherit', border: '1px solid var(--vscode-button-border)', marginLeft: 0, gap: 5, justifyContent: 'center' }}>
                        <FileCode size={14} /> File
                    </HeaderButton>
                </div>
                {/* Input Fields */}
                {inputType === 'url' ? (
                    <div style={{ display: 'flex', gap: 5 }}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <Input
                                value={wsdlUrl}
                                onChange={(e) => setWsdlUrl(e.target.value)}
                                placeholder="WSDL URL - type or select from history"
                                onFocus={() => setShowUrlDropdown(true)}
                                onClick={() => setShowUrlDropdown(true)}
                                onBlur={() => setShowUrlDropdown(false)}
                                style={{ width: '100%' }}
                            />
                            {showUrlDropdown && dropdownOptions.length > 0 && (
                                <div
                                    style={{
                                        position: 'absolute',
                                        top: '100%',
                                        left: 0,
                                        right: 0,
                                        backgroundColor: 'var(--vscode-dropdown-background)',
                                        border: '1px solid var(--vscode-dropdown-border)',
                                        zIndex: 1000,
                                        maxHeight: 200,
                                        overflowY: 'auto',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
                                    }}
                                    onMouseDown={(e) => e.preventDefault()} // Prevent input blur
                                >
                                    {dropdownOptions.map((item, i) => (
                                        <div
                                            key={`option-${i}`}
                                            onClick={() => {
                                                setWsdlUrl(item.url);
                                                setShowUrlDropdown(false);
                                            }}
                                            style={{
                                                padding: '6px 8px',
                                                cursor: 'pointer',
                                                borderBottom: i < dropdownOptions.length - 1 ? '1px solid var(--vscode-dropdown-border)' : 'none',
                                                fontSize: '12px'
                                            }}
                                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                        >
                                            <div style={{ fontWeight: 500 }}>{item.label}</div>
                                            <div style={{
                                                fontSize: '10px',
                                                color: 'var(--vscode-descriptionForeground)',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {item.url}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <HeaderButton onClick={loadWsdl} title="Load WSDL" style={{ border: '1px solid var(--vscode-button-border)', margin: 0 }}><Play size={14} /></HeaderButton>
                    </div>
                ) : (
                    <div style={{ display: 'flex', gap: 5 }}>
                        <HeaderButton onClick={pickLocalWsdl} title="Select Local WSDL" style={{ flex: 1, textAlign: 'center', border: '1px solid var(--vscode-button-border)', margin: 0 }}>Select File</HeaderButton>
                        {selectedFile && <HeaderButton onClick={loadWsdl} title="Load WSDL" style={{ border: '1px solid var(--vscode-button-border)', margin: 0 }}><Play size={14} /></HeaderButton>}
                    </div>
                )}
                {selectedFile && inputType === 'file' && <div style={{ fontSize: '0.8em', color: 'var(--vscode-descriptionForeground)' }}>{selectedFile}</div>}

                {/* Use Proxy checkbox - only show for URL mode */}
                {inputType === 'url' && setUseProxy && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '12px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={useProxy || false}
                                onChange={(e) => setUseProxy(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            <span style={{ color: 'var(--vscode-descriptionForeground)' }}>Use System Proxy</span>
                        </label>
                    </div>
                )}

                {downloadStatus && <div style={{ padding: '0 10px 5px', fontSize: '0.8em' }}>{downloadStatus.map((f, i) => <div key={i}>• {f}</div>)}</div>}

                <ServiceTree
                    interfaces={exploredInterfaces}
                    isExplorer={true}
                    selectedInterface={selectedInterface}
                    selectedOperation={selectedOperation}
                    selectedRequest={selectedRequest}
                    confirmDeleteId={confirmDeleteId}
                    setConfirmDeleteId={setConfirmDeleteId}


                    onToggleInterface={(iface) => toggleExploredInterface(iface.name)}
                    onSelectInterface={(iface) => {
                        // Only select, don't expand
                        setSelectedInterface(iface);
                        setSelectedOperation(null);
                        setSelectedRequest(null);
                    }}
                    onToggleOperation={(op, iface) => toggleExploredOperation(iface.name, op.name)}
                    onSelectOperation={(op, iface) => {
                        // Only select, don't expand - expand is chevron-only
                        setSelectedInterface(iface);
                        setSelectedOperation(op);

                        const hasSingleRequest = op.requests.length === 1;
                        if (hasSingleRequest && op.requests[0]) {
                            setSelectedRequest(op.requests[0]);
                            setResponse(null);
                        } else {
                            setSelectedRequest(null);
                        }
                    }}
                    onSelectRequest={(req, op, iface) => {
                        setSelectedInterface(iface);
                        setSelectedOperation(op);
                        setSelectedRequest(req);
                        setResponse(null);
                    }}
                    onContextMenu={(e, type, data) => handleContextMenu(e, type, data, true)}

                    onAddToProject={addToProject}
                    onRemoveFromExplorer={removeFromExplorer}
                />
            </div>
        </div>
    );
};

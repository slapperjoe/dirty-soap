/**
 * DiagnosticsTab.tsx
 * 
 * Certificate and proxy diagnostics tools integrated into the Debug modal
 */

import React, { useState } from 'react';
import { Shield, Network, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { bridge, isTauri } from '../../utils/bridge';

interface DiagnosticsTabProps {
    serverConfig?: any;
}

type DiagnosticResult = {
    status: 'success' | 'warning' | 'error' | 'info';
    message: string;
    details?: string;
};

export const DiagnosticsTab: React.FC<DiagnosticsTabProps> = ({ serverConfig }) => {
    const [certResults, setCertResults] = useState<DiagnosticResult[]>([]);
    const [proxyResults, setProxyResults] = useState<DiagnosticResult[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [activeTest, setActiveTest] = useState<string | null>(null);

    const getStatusIcon = (status: DiagnosticResult['status']) => {
        switch (status) {
            case 'success': return <CheckCircle size={16} color="var(--vscode-testing-iconPassed)" />;
            case 'error': return <XCircle size={16} color="var(--vscode-testing-iconFailed)" />;
            case 'warning': return <AlertTriangle size={16} color="var(--vscode-charts-yellow)" />;
            default: return <Shield size={16} color="var(--vscode-foreground)" />;
        }
    };

    const runCertificateDiagnostics = async () => {
        setIsRunning(true);
        setActiveTest('certificate');
        setCertResults([]);
        
        const results: DiagnosticResult[] = [];

        try {
            // Check if certificate files exist
            results.push({ status: 'info', message: 'Checking certificate files...' });
            const certCheck = await bridge.sendMessageAsync({ command: 'checkCertificate' });
            
            if (certCheck.exists) {
                results.push({
                    status: 'success',
                    message: 'Certificate files found',
                    details: `Path: ${certCheck.certPath}`
                });
                
                // Check if cert is in LocalMachine store
                results.push({ status: 'info', message: 'Checking certificate store location...' });
                const storeCheck = await bridge.sendMessageAsync({ 
                    command: 'checkCertificateStore',
                    thumbprint: certCheck.thumbprint 
                });
                
                if (storeCheck.inLocalMachine) {
                    results.push({
                        status: 'success',
                        message: 'Certificate installed in LocalMachine\\Root store',
                        details: `Thumbprint: ${certCheck.thumbprint}`
                    });
                } else if (storeCheck.inCurrentUser) {
                    results.push({
                        status: 'warning',
                        message: 'Certificate is in CurrentUser store (should be LocalMachine)',
                        details: 'Click "Fix Certificate Location" to move it'
                    });
                } else {
                    results.push({
                        status: 'error',
                        message: 'Certificate not installed in any trust store',
                        details: 'Click "Install Certificate" to fix'
                    });
                }
                
                // Test HTTPS server
                results.push({ status: 'info', message: 'Testing HTTPS server...' });
                const httpsTest = await bridge.sendMessageAsync({ command: 'testHttpsServer' });
                
                if (httpsTest.success) {
                    results.push({
                        status: 'success',
                        message: 'HTTPS server test passed',
                        details: 'Certificate and key are valid'
                    });
                } else {
                    results.push({
                        status: 'error',
                        message: 'HTTPS server test failed',
                        details: httpsTest.error || 'Certificate/key may be malformed'
                    });
                }
            } else {
                results.push({
                    status: 'warning',
                    message: 'Certificate not generated yet',
                    details: 'Start proxy with an HTTPS target to generate'
                });
            }
        } catch (error: any) {
            results.push({
                status: 'error',
                message: 'Diagnostic check failed',
                details: error.message
            });
        }
        
        setCertResults(results);
        setIsRunning(false);
        setActiveTest(null);
    };

    const runProxyDiagnostics = async () => {
        setIsRunning(true);
        setActiveTest('proxy');
        setProxyResults([]);
        
        const results: DiagnosticResult[] = [];

        try {
            // Check proxy configuration
            const targetUrl = serverConfig?.targetUrl || '';
            const clientPort = serverConfig?.port || 9000;
            
            const targetIsHttps = targetUrl.toLowerCase().startsWith('https');
            
            results.push({
                status: 'info',
                message: 'Proxy Configuration',
                details: `Target: ${targetUrl}\nPort: ${clientPort}\nProtocol: ${targetIsHttps ? 'HTTPS' : 'HTTP'}`
            });
            
            // Check protocol consistency
            if (targetIsHttps) {
                results.push({
                    status: 'warning',
                    message: 'HTTPS target detected',
                    details: `Your client must connect to https://localhost:${clientPort} (not http://)`
                });
            } else if (targetUrl) {
                results.push({
                    status: 'info',
                    message: 'HTTP target detected',
                    details: `Client can connect to http://localhost:${clientPort}`
                });
            }
            
            // Check if proxy is running
            const statusCheck = await bridge.sendMessageAsync({ command: 'getProxyStatus' });
            
            if (statusCheck.running) {
                results.push({
                    status: 'success',
                    message: 'Proxy server is running'
                });
            } else {
                results.push({
                    status: 'warning',
                    message: 'Proxy server is not running',
                    details: 'Start the proxy to test connections'
                });
            }
            
        } catch (error: any) {
            results.push({
                status: 'error',
                message: 'Proxy diagnostic check failed',
                details: error.message
            });
        }
        
        setProxyResults(results);
        setIsRunning(false);
        setActiveTest(null);
    };

    const installCertificate = async () => {
        try {
            const result = await bridge.sendMessageAsync({ command: 'installCertificateToLocalMachine' });
            if (result.success) {
                alert('Certificate installed successfully!\n\nRun diagnostics again to verify.');
                runCertificateDiagnostics();
            } else {
                alert(`Failed to install certificate:\n${result.error}`);
            }
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const fixCertificateLocation = async () => {
        try {
            const result = await bridge.sendMessageAsync({ command: 'moveCertificateToLocalMachine' });
            if (result.success) {
                alert('Certificate moved to LocalMachine store successfully!\n\nRun diagnostics again to verify.');
                runCertificateDiagnostics();
            } else {
                alert(`Failed to move certificate:\n${result.error}`);
            }
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    const regenerateCertificate = async () => {
        if (!confirm('This will delete the old certificate and generate a new one. Continue?')) {
            return;
        }
        
        try {
            const result = await bridge.sendMessageAsync({ command: 'regenerateCertificate' });
            if (result.success) {
                alert('Certificate regenerated successfully!\n\nYou may need to restart the proxy.');
                runCertificateDiagnostics();
            } else {
                alert(`Failed to regenerate certificate:\n${result.error}`);
            }
        } catch (error: any) {
            alert(`Error: ${error.message}`);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Certificate Diagnostics */}
            <div>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid var(--vscode-panel-border)'
                }}>
                    <h3 style={{ 
                        margin: 0, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        fontSize: '1.1em'
                    }}>
                        <Shield size={18} />
                        Certificate Diagnostics
                    </h3>
                    <button
                        onClick={runCertificateDiagnostics}
                        disabled={isRunning && activeTest === 'certificate'}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.85em',
                            background: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: '1px solid var(--vscode-button-border)',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            borderRadius: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: isRunning ? 0.5 : 1
                        }}
                    >
                        <RefreshCw size={14} />
                        {isRunning && activeTest === 'certificate' ? 'Running...' : 'Run Certificate Check'}
                    </button>
                </div>
                
                {certResults.length > 0 && (
                    <div style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        gap: '8px',
                        marginBottom: '12px'
                    }}>
                        {certResults.map((result, index) => (
                            <div 
                                key={index}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    padding: '10px',
                                    background: 'var(--vscode-editor-inactiveSelectionBackground)',
                                    borderRadius: '4px',
                                    fontSize: '0.9em'
                                }}
                            >
                                {getStatusIcon(result.status)}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500 }}>{result.message}</div>
                                    {result.details && (
                                        <div style={{ 
                                            fontSize: '0.85em', 
                                            opacity: 0.7, 
                                            marginTop: '4px',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {result.details}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={installCertificate}
                        style={{
                            padding: '8px 14px',
                            fontSize: '0.85em',
                            background: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: '1px solid var(--vscode-button-border)',
                            cursor: 'pointer',
                            borderRadius: '2px'
                        }}
                    >
                        Install Certificate
                    </button>
                    <button
                        onClick={fixCertificateLocation}
                        style={{
                            padding: '8px 14px',
                            fontSize: '0.85em',
                            background: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: '1px solid var(--vscode-button-border)',
                            cursor: 'pointer',
                            borderRadius: '2px'
                        }}
                    >
                        Fix Certificate Location
                    </button>
                    <button
                        onClick={regenerateCertificate}
                        style={{
                            padding: '8px 14px',
                            fontSize: '0.85em',
                            background: 'var(--vscode-button-secondaryBackground)',
                            color: 'var(--vscode-button-secondaryForeground)',
                            border: '1px solid var(--vscode-button-border)',
                            cursor: 'pointer',
                            borderRadius: '2px'
                        }}
                    >
                        Regenerate Certificate
                    </button>
                </div>
            </div>

            {/* Proxy Diagnostics */}
            <div>
                <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: '12px',
                    paddingBottom: '8px',
                    borderBottom: '1px solid var(--vscode-panel-border)'
                }}>
                    <h3 style={{ 
                        margin: 0, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '8px',
                        fontSize: '1.1em'
                    }}>
                        <Network size={18} />
                        Proxy Configuration Check
                    </h3>
                    <button
                        onClick={runProxyDiagnostics}
                        disabled={isRunning && activeTest === 'proxy'}
                        style={{
                            padding: '6px 12px',
                            fontSize: '0.85em',
                            background: 'var(--vscode-button-background)',
                            color: 'var(--vscode-button-foreground)',
                            border: '1px solid var(--vscode-button-border)',
                            cursor: isRunning ? 'not-allowed' : 'pointer',
                            borderRadius: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            opacity: isRunning ? 0.5 : 1
                        }}
                    >
                        <RefreshCw size={14} />
                        {isRunning && activeTest === 'proxy' ? 'Running...' : 'Run Proxy Check'}
                    </button>
                </div>
                
                {proxyResults.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {proxyResults.map((result, index) => (
                            <div 
                                key={index}
                                style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '10px',
                                    padding: '10px',
                                    background: 'var(--vscode-editor-inactiveSelectionBackground)',
                                    borderRadius: '4px',
                                    fontSize: '0.9em'
                                }}
                            >
                                {getStatusIcon(result.status)}
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 500 }}>{result.message}</div>
                                    {result.details && (
                                        <div style={{ 
                                            fontSize: '0.85em', 
                                            opacity: 0.7, 
                                            marginTop: '4px',
                                            whiteSpace: 'pre-wrap'
                                        }}>
                                            {result.details}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Help Text */}
            <div style={{
                padding: '12px',
                background: 'var(--vscode-textBlockQuote-background)',
                border: '1px solid var(--vscode-textBlockQuote-border)',
                borderRadius: '4px',
                fontSize: '0.85em',
                opacity: 0.8
            }}>
                <strong>Common Issues:</strong>
                <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                    <li><strong>TLS handshake errors:</strong> Make sure your client URL protocol (http/https) matches the proxy's target protocol</li>
                    <li><strong>Certificate not trusted:</strong> Certificate must be in LocalMachine\Root store (not CurrentUser)</li>
                    <li><strong>SEC_E_INVALID_TOKEN:</strong> Certificate/key mismatch - try regenerating the certificate</li>
                    <li><strong>Error 1312:</strong> Certificate not in LocalMachine store - click "Fix Certificate Location"</li>
                </ul>
            </div>
        </div>
    );
};

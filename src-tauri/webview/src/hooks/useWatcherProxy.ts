/**
 * useWatcherProxy.ts
 * 
 * Hook for managing watcher and proxy state and handlers.
 * Extracted from App.tsx to reduce complexity.
 */

import { useState, useCallback, useEffect } from 'react';
import { WatcherEvent, ApiRequest, ApiOperation, ApiInterface, SidebarView, MockEvent, MockConfig, ApinoxConfig } from '@shared/models';
import { formatXml } from '@shared/utils/xmlFormatter';
import { bridge, isTauri } from '../utils/bridge';
import { FrontendCommand } from '@shared/messages';
import { useMockProxy } from '../contexts/MockProxyContext';

interface UseWatcherProxyParams {
    // UI State
    activeView: SidebarView;
    inlineElementValues: boolean;
    hideCausalityData: boolean;

    // Selection setters
    setSelectedInterface: React.Dispatch<React.SetStateAction<ApiInterface | null>>;
    setSelectedOperation: React.Dispatch<React.SetStateAction<ApiOperation | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<ApiRequest | null>>;
    setSelectedTestCase: React.Dispatch<React.SetStateAction<any>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
    
    // Config (for loading saved proxy target)
    config: ApinoxConfig | null;
}

interface UseWatcherProxyReturn {
    // Watcher State
    watcherHistory: WatcherEvent[];
    setWatcherHistory: React.Dispatch<React.SetStateAction<WatcherEvent[]>>;
    watcherRunning: boolean;
    setWatcherRunning: React.Dispatch<React.SetStateAction<boolean>>;

    // Proxy State
    proxyHistory: WatcherEvent[];
    setProxyHistory: React.Dispatch<React.SetStateAction<WatcherEvent[]>>;
    proxyRunning: boolean;
    setProxyRunning: React.Dispatch<React.SetStateAction<boolean>>;
    proxyConfig: { port: number; target: string; systemProxyEnabled: boolean };
    setProxyConfig: React.Dispatch<React.SetStateAction<{ port: number; target: string; systemProxyEnabled: boolean }>>;

    // Handlers
    handleSelectWatcherEvent: (event: WatcherEvent) => void;

    // Mock State
    mockHistory: MockEvent[];
    setMockHistory: React.Dispatch<React.SetStateAction<MockEvent[]>>;
    mockRunning: boolean;
    setMockRunning: React.Dispatch<React.SetStateAction<boolean>>;
    mockConfig: MockConfig | null;
    setMockConfig: React.Dispatch<React.SetStateAction<MockConfig | null>>;
    handleSelectMockEvent: (event: MockEvent) => void;
    handleClearMockHistory: () => void;

    // Unified Server Mode
    serverMode: 'off' | 'proxy' | 'mock' | 'both';
    setServerMode: React.Dispatch<React.SetStateAction<'off' | 'proxy' | 'mock' | 'both'>>;
}

export function useWatcherProxy({
    activeView,
    inlineElementValues,
    hideCausalityData,
    setSelectedInterface,
    setSelectedOperation,
    setSelectedRequest,
    setSelectedTestCase,
    setResponse,
    config
}: UseWatcherProxyParams): UseWatcherProxyReturn {

    // Get proxy/mock state from context instead of local state
    const {
        proxyHistory,
        setProxyHistory,
        proxyRunning,
        setProxyRunning,
        proxyConfig,
        setProxyConfig,
        mockHistory,
        setMockHistory,
        mockRunning,
        setMockRunning,
        mockConfig,
        setMockConfig
    } = useMockProxy();

    // Watcher State (still local since it's separate from server)
    const [watcherHistory, setWatcherHistory] = useState<WatcherEvent[]>([]);
    const [watcherRunning, setWatcherRunning] = useState(false);

    // Unified Server Mode (controlled by UI, not derived from running states)
    const [serverMode, setServerMode] = useState<'off' | 'proxy' | 'mock' | 'both'>('off');

    // Initialize serverMode and proxyConfig from config.server when available
    useEffect(() => {
        if (config?.server) {
            if (config.server.mode) {
                setServerMode(config.server.mode);
            }
            if (config.server.targetUrl || config.server.port !== undefined) {
                setProxyConfig((prev: any) => ({
                    ...prev,
                    port: config.server?.port || prev.port || 9000,
                    target: config.server?.targetUrl || prev.target || ''
                }));
            }
        } else if (config?.lastProxyTarget) {
            // Fallback: Load proxy target from legacy config
            setProxyConfig((prev: any) => ({
                ...prev,
                target: config.lastProxyTarget || ''
            }));
        }
    }, [config?.server, config?.lastProxyTarget, setProxyConfig, setServerMode]);

    useEffect(() => {
        if (!isTauri()) return;

        let timer: NodeJS.Timeout | undefined;

        if (watcherRunning) {
            bridge.sendMessage({ command: FrontendCommand.GetWatcherHistory });
            timer = setInterval(() => {
                bridge.sendMessage({ command: FrontendCommand.GetWatcherHistory });
            }, 1000);
        }

        return () => {
            if (timer) clearInterval(timer);
        };
    }, [watcherRunning]);

    const handleSelectWatcherEvent = useCallback((event: WatcherEvent) => {
        let requestBody = event.formattedBody;
        if (requestBody === undefined) {
            const raw = event.requestContent || event.requestBody || '';
            requestBody = formatXml(raw, true, inlineElementValues, hideCausalityData);

            // Cache the formatted body so it doesn't re-format on next click
            if (activeView === SidebarView.SERVER) {
                setProxyHistory(prev => prev.map(e => e.id === event.id ? { ...e, formattedBody: requestBody } : e));
            } else {
                setWatcherHistory(prev => prev.map(e => e.id === event.id ? { ...e, formattedBody: requestBody } : e));
            }
        }

        const tempRequest: ApiRequest = {
            id: event.id,
            name: `Logged: ${event.timestampLabel}`,
            request: requestBody,
            dirty: false,
            headers: event.requestHeaders || {},
            endpoint: event.url || '',
            method: event.method || 'POST',
            contentType: 'application/soap+xml'
        };

        const tempOp: ApiOperation = {
            name: 'External Request',
            input: '',
            requests: [tempRequest],
            action: 'WatcherAction'
        };

        const tempIface: ApiInterface = {
            name: 'File Watcher',
            type: 'wsdl',
            soapVersion: '1.1',
            definition: '',
            operations: [tempOp],
            bindingName: 'WatcherBinding'
        };

        setSelectedInterface(tempIface);
        setSelectedOperation(tempOp);
        setSelectedInterface(tempIface);
        setSelectedOperation(tempOp);
        setSelectedRequest(tempRequest);
        setSelectedTestCase(null); // Ensure we exit test case context

        const responseContent = event.responseContent || event.responseBody;
        if (responseContent) {
            setResponse({
                rawResponse: responseContent,
                duration: event.duration || 0,
                lineCount: responseContent.split(/\r\n|\r|\n/).length,
                success: event.success,
                headers: event.responseHeaders
            });
        } else {
            setResponse(null);
        }
    }, [activeView, inlineElementValues, hideCausalityData, setSelectedInterface, setSelectedOperation, setSelectedRequest, setSelectedTestCase, setResponse]);

    // Mock Event Selection Handler
    const handleSelectMockEvent = useCallback((event: MockEvent) => {
        const requestBody = formatXml(event.requestBody || '', true, inlineElementValues, hideCausalityData);

        const tempRequest: ApiRequest = {
            id: event.id,
            name: `Mock: ${event.timestampLabel}`,
            request: requestBody,
            dirty: false,
            headers: event.requestHeaders || {},
            endpoint: event.url || '',
            method: event.method || 'POST',
            contentType: 'application/soap+xml'
        };

        const tempOp: ApiOperation = {
            name: event.matchedRule ? `Mock: ${event.matchedRule}` : 'Mock Request',
            input: '',
            requests: [tempRequest],
            action: 'MockAction'
        };

        const tempIface: ApiInterface = {
            name: 'Mock Server',
            type: 'wsdl',
            soapVersion: '1.1',
            definition: '',
            operations: [tempOp],
            bindingName: 'MockBinding'
        };

        setSelectedInterface(tempIface);
        setSelectedOperation(tempOp);
        setSelectedRequest(tempRequest);
        setSelectedTestCase(null);

        if (event.responseBody) {
            setResponse({
                rawResponse: event.responseBody,
                duration: event.duration || 0,
                lineCount: event.responseBody.split(/\r\n|\r|\n/).length,
                success: event.status ? event.status >= 200 && event.status < 300 : false,
                headers: event.responseHeaders
            });
        } else {
            setResponse(null);
        }
    }, [inlineElementValues, hideCausalityData, setSelectedInterface, setSelectedOperation, setSelectedRequest, setSelectedTestCase, setResponse]);

    const handleClearMockHistory = useCallback(() => {
        setMockHistory([]);
    }, []);

    return {
        // Watcher
        watcherHistory,
        setWatcherHistory,
        watcherRunning,
        setWatcherRunning,
        // Proxy
        proxyHistory,
        setProxyHistory,
        proxyRunning,
        setProxyRunning,
        proxyConfig: proxyConfig || { port: 9000, target: '', systemProxyEnabled: true },
        setProxyConfig,
        // Handler
        handleSelectWatcherEvent,
        // Mock
        mockHistory,
        setMockHistory,
        mockRunning,
        setMockRunning,
        mockConfig: mockConfig || {
            enabled: false,
            port: 9001,
            targetUrl: '',
            rules: [],
            passthroughEnabled: true,
            routeThroughProxy: false
        },
        setMockConfig,
        handleSelectMockEvent,
        handleClearMockHistory,
        // Unified Server Mode
        serverMode,
        setServerMode
    };
}

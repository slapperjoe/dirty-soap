import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { BackendCommand } from '@shared/messages';
import { MockConfig, MockEvent, ProxyEvent } from '@shared/models';
import { bridge } from '../utils/bridge';

interface MockProxyContextType {
    // Mock
    mockRunning: boolean;
    setMockRunning: (running: boolean) => void;
    mockConfig: MockConfig | null;
    setMockConfig: (config: MockConfig) => void;
    mockHistory: MockEvent[];
    setMockHistory: React.Dispatch<React.SetStateAction<MockEvent[]>>;
    toggleMock: () => void;
    clearMockHistory: () => void;

    // Proxy
    proxyRunning: boolean;
    setProxyRunning: (running: boolean) => void;
    proxyHistory: ProxyEvent[]; // or any[] if type unclear, assuming ProxyEvent exists or use any
    setProxyHistory: React.Dispatch<React.SetStateAction<ProxyEvent[]>>;
    proxyConfig: any;
    setProxyConfig: React.Dispatch<React.SetStateAction<any>>;
    toggleProxy: () => void;
    clearProxyHistory: () => void;
}

const MockProxyContext = createContext<MockProxyContextType | undefined>(undefined);

export const useMockProxy = () => {
    const context = useContext(MockProxyContext);
    if (!context) {
        throw new Error('useMockProxy must be used within a MockProxyProvider');
    }
    return context;
};

export const MockProxyProvider = ({ children }: { children: ReactNode }) => {
    // Mock State
    const [mockRunning, setMockRunning] = useState<boolean>(false);
    const [mockConfig, setMockConfig] = useState<MockConfig | null>(null);
    const [mockHistory, setMockHistory] = useState<MockEvent[]>([]);

    // Proxy State
    const [proxyRunning, setProxyRunning] = useState<boolean>(false);
    const [proxyHistory, setProxyHistory] = useState<ProxyEvent[]>([]);
    // Initialize with default or empty
    const [proxyConfig, setProxyConfig] = useState<any>({});

    // Handlers
    const toggleMock = () => {
        const newState = !mockRunning;
        setMockRunning(newState);
        bridge.sendMessage({ command: 'toggleMock', enabled: newState });
    };

    const clearMockHistory = () => {
        setMockHistory([]);
        bridge.sendMessage({ command: 'clearMockHistory' });
    };

    const toggleProxy = () => {
        const newState = !proxyRunning;
        setProxyRunning(newState);
        bridge.sendMessage({ command: 'toggleProxy', enabled: newState });
    };

    const clearProxyHistory = () => {
        setProxyHistory([]);
        bridge.sendMessage({ command: 'clearProxyHistory' });
    };

    // Message Handling
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                // Mock
                case BackendCommand.MockStatus:
                    setMockRunning(message.running);
                    break;
                case BackendCommand.MockRulesUpdated:
                    if (message.rules) {
                        // Create default config if none exists, ensuring all required props
                        setMockConfig(prev => prev ? { ...prev, rules: message.rules } : {
                            enabled: false,
                            port: 9001,
                            targetUrl: 'http://localhost:8080',
                            rules: message.rules,
                            passthroughEnabled: true,
                            routeThroughProxy: false
                        });
                    }
                    if (message.config) {
                        setMockConfig(message.config);
                    }
                    break;
                case BackendCommand.MockHit:
                    // log only
                    break;
                case BackendCommand.MockHistoryStart:
                    if (message.history) setMockHistory(message.history);
                    break;
                case BackendCommand.MockHistoryUpdate:
                    if (message.event) {
                        setMockHistory(prev => [message.event, ...prev].slice(0, 50));
                    }
                    break;

                // Proxy
                case BackendCommand.ProxyStatus:
                    setProxyRunning(message.running);
                    break;
                case BackendCommand.ProxyLog:
                    if (message.event) {
                        setProxyHistory(prev => [message.event, ...prev].slice(0, 50));
                    }
                    break;
                case BackendCommand.UpdateProxyTarget:
                    if (message.target) {
                        // Update local config
                        const newConfig = { ...proxyConfig, target: message.target };
                        setProxyConfig(newConfig);
                    }
                    break;
                case BackendCommand.ConfigUpdate:
                    if (message.config) {
                        if (message.config.mockServer) {
                            setMockConfig(message.config.mockServer);
                        }
                        if (message.config.lastProxyTarget) {
                            setProxyConfig((prev: any) => ({ ...prev, target: message.config.lastProxyTarget }));
                        }
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [proxyConfig]); // Dep on proxyConfig for UpdateProxyTarget spread?

    return (
        <MockProxyContext.Provider value={{
            mockRunning,
            setMockRunning,
            mockConfig,
            setMockConfig,
            mockHistory,
            setMockHistory,
            toggleMock,
            clearMockHistory,
            proxyRunning,
            setProxyRunning,
            proxyHistory,
            setProxyHistory,
            toggleProxy,
            clearProxyHistory,
            proxyConfig, // Provide it
            setProxyConfig
        }}>
            {children}
        </MockProxyContext.Provider>
    );
};

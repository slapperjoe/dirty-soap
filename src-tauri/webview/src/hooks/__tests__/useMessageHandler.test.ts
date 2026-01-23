import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMessageHandler, MessageHandlerState } from '../useMessageHandler';
import { BackendCommand } from '@shared/messages';
import { bridge } from '../../utils/bridge';

// Mock bridge
vi.mock('../../utils/bridge', () => ({
    bridge: {
        sendMessage: vi.fn(),
        onMessage: vi.fn(() => vi.fn())
    }
}));

describe('useMessageHandler', () => {
    let mockState: MessageHandlerState;
    let messageHandlerCallback: (msg: any) => void;

    beforeEach(() => {
        vi.clearAllMocks();

        // Capture the message handler callback
        vi.mocked(bridge.onMessage).mockImplementation((callback) => {
            messageHandlerCallback = callback;
            return vi.fn(); // cleanup function
        });

        // Initialize mock state with vitest functions
        mockState = {
            setProjects: vi.fn(),
            setExploredInterfaces: vi.fn(),
            setExplorerExpanded: vi.fn(),
            setLoading: vi.fn(),
            setResponse: vi.fn(),
            setDownloadStatus: vi.fn(),
            setSelectedFile: vi.fn(),
            setSampleModal: vi.fn(),
            setBackendConnected: vi.fn(),
            setConfig: vi.fn(),
            setRawConfig: vi.fn(),
            setLayoutMode: vi.fn(),
            setShowLineNumbers: vi.fn(),
            setSplitRatio: vi.fn(),
            setInlineElementValues: vi.fn(),
            setConfigPath: vi.fn(),
            setSelectedProjectName: vi.fn(),
            setWsdlUrl: vi.fn(),
            setWorkspaceDirty: vi.fn(),
            setSavedProjects: vi.fn(),
            setChangelog: vi.fn(),
            setWatcherHistory: vi.fn(),
            setActiveView: vi.fn(),
            setActiveBreakpoint: vi.fn(),
            setRequestHistory: vi.fn(),
            setWsdlDiff: vi.fn(),

            wsdlUrl: '',
            projects: [],
            config: {},
            selectedTestCase: null,
            selectedRequest: null,
            startTimeRef: { current: 0 },
            saveProject: vi.fn()
        };
    });

    it('should register message listener on mount', () => {
        renderHook(() => useMessageHandler(mockState));
        expect(bridge.onMessage).toHaveBeenCalled();
    });

    it('should handle WsdlParsed message', () => {
        renderHook(() => useMessageHandler(mockState));

        const wsdlData = [
            {
                name: 'TestService',
                operations: [
                    { name: 'GetTest', portName: 'Default', originalEndpoint: 'http://test' }
                ]
            }
        ];

        messageHandlerCallback({
            command: BackendCommand.WsdlParsed,
            services: wsdlData
        });

        expect(mockState.setExploredInterfaces).toHaveBeenCalled();
        expect(mockState.setExplorerExpanded).toHaveBeenCalledWith(true);
    });

    it('should handle EchoResponse message', () => {
        renderHook(() => useMessageHandler(mockState));

        messageHandlerCallback({
            command: BackendCommand.EchoResponse
        });

        expect(mockState.setBackendConnected).toHaveBeenCalledWith(true);
    });

    it('should handle Error message', () => {
        renderHook(() => useMessageHandler(mockState));

        messageHandlerCallback({
            command: BackendCommand.Error,
            message: 'Something went wrong'
        });

        expect(mockState.setLoading).toHaveBeenCalledWith(false);
        expect(mockState.setResponse).toHaveBeenCalledWith({ error: 'Something went wrong' });
    });

    it('should handle SettingsUpdate message', () => {
        renderHook(() => useMessageHandler(mockState));

        const config = { ui: { layoutMode: 'horizontal' } };
        messageHandlerCallback({
            command: BackendCommand.SettingsUpdate,
            config
        });

        expect(mockState.setConfig).toHaveBeenCalledWith(config);
        expect(mockState.setLayoutMode).toHaveBeenCalledWith('horizontal');
    });

    it('should handle ProjectLoaded message', () => {
        renderHook(() => useMessageHandler(mockState));

        const project = { id: 'p1', name: 'New Project', testSuites: [] };
        messageHandlerCallback({
            command: BackendCommand.ProjectLoaded,
            project,
            filename: 'test.xml'
        });

        expect(mockState.setProjects).toHaveBeenCalled();
        expect(mockState.setWorkspaceDirty).toHaveBeenCalledWith(true);
    });
});

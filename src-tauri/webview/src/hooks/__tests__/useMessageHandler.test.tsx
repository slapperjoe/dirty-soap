/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, ReactNode } from '@testing-library/react';
import { useMessageHandler, MessageHandlerState } from '../useMessageHandler';
import { BackendCommand } from '@shared/messages';
import { bridge } from '../../utils/bridge';
import { NavigationProvider } from '../../contexts/NavigationContext';
import { SidebarView } from '@shared/models';

// Mock bridge
vi.mock('../../utils/bridge', () => ({
    bridge: {
        sendMessage: vi.fn(),
        onMessage: vi.fn(() => vi.fn())
    }
}));

// The legacy WSDL-parsed -> explorer-staging pipeline (F-19) was retired;
// useMessageHandler no longer sources setExploredInterfaces from
// useNavigation(). Only the hooks the remaining handlers use are replaced;
// the provider still renders and satisfies useNavigation's
// "must be inside provider" check.
const mockNavSetActiveView = vi.fn();
vi.mock('../../contexts/NavigationContext', async () => {
    const actual = await vi.importActual('../../contexts/NavigationContext');
    return {
        ...actual,
        useNavigation: () => ({
            setActiveView: mockNavSetActiveView
        })
    };
});

// Mock __APP_VERSION__
vi.mock('react', async () => {
    const actual = await vi.importActual('react');
    return {
        ...actual,
    };
});

// Wrapper component for NavigationProvider
function Wrapper({ children }: { children: ReactNode }) {
    return (
        <NavigationProvider>
            {children}
        </NavigationProvider>
    );
}

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
            setLoading: vi.fn(),
            setResponse: vi.fn(),
            setBackendConnected: vi.fn(),
            setConfig: vi.fn(),
            setRawConfig: vi.fn(),
            setLayoutMode: vi.fn(),
            setShowLineNumbers: vi.fn(),
            setSplitRatio: vi.fn(),
            setInlineElementValues: vi.fn(),
            setConfigPath: vi.fn(),
            setSelectedProjectName: vi.fn(),
            setWorkspaceDirty: vi.fn(),
            setSavedProjects: vi.fn(),
            setChangelog: vi.fn(),
            setWatcherHistory: vi.fn(),
            setActiveView: vi.fn(),
            setActiveBreakpoint: vi.fn(),
            setRequestHistory: vi.fn(),
            setWsdlDiff: vi.fn(),

            projects: [],
            config: {},
            selectedTestCase: null,
            selectedRequest: null,
            startTimeRef: { current: 0 },
            saveProject: vi.fn()
        };
    });

    it('should register message listener on mount', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });
        expect(bridge.onMessage).toHaveBeenCalled();
    });

    it('should handle EchoResponse message', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        messageHandlerCallback({
            command: BackendCommand.EchoResponse
        });

        expect(mockState.setBackendConnected).toHaveBeenCalledWith(true);
    });

    it('should handle Error message', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        messageHandlerCallback({
            command: BackendCommand.Error,
            message: 'Something went wrong'
        });

        expect(mockState.setLoading).toHaveBeenCalledWith(false);
        expect(mockState.setResponse).toHaveBeenCalledWith({ error: 'Something went wrong' });
    });

    it('should handle SettingsUpdate message', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        const config = { ui: { layoutMode: 'horizontal' } };
        messageHandlerCallback({
            command: BackendCommand.SettingsUpdate,
            config
        });

        expect(mockState.setConfig).toHaveBeenCalledWith(config);
        expect(mockState.setLayoutMode).toHaveBeenCalledWith('horizontal');
    });

    it('should handle ProjectLoaded message', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        const project = { id: 'p1', name: 'New Project', testSuites: [] };
        messageHandlerCallback({
            command: BackendCommand.ProjectLoaded,
            project,
            filename: 'test.xml'
        });

        expect(mockState.setProjects).toHaveBeenCalled();
        expect(mockState.setWorkspaceDirty).toHaveBeenCalledWith(true);

        const updater = vi.mocked(mockState.setProjects).mock.calls[0][0] as (prev: any[]) => any[];
        const updatedProjects = updater([{ id: 'p1', name: 'New Project', loading: true, expanded: false }]);
        expect(updatedProjects[0]).toMatchObject({
            id: 'p1',
            name: 'New Project',
            fileName: 'test.xml',
            loading: false,
            expanded: false
        });
    });

    it('should mark autosaved projects as loading before reloading them from disk', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        messageHandlerCallback({
            command: BackendCommand.RestoreAutosave,
            content: JSON.stringify({
                projects: [
                    { id: 'p1', name: 'Workspace A', fileName: '/tmp/workspace-a', expanded: false },
                    { id: 'p2', name: 'Scratch Project', expanded: true }
                ],
                lastSelectedProject: 'Workspace A'
            })
        });

        expect(mockState.setProjects).toHaveBeenCalled();
        const updater = vi.mocked(mockState.setProjects).mock.calls[0][0] as (prev: any[]) => any[];
        const restoredProjects = updater([]);

        expect(restoredProjects).toEqual([
            expect.objectContaining({
                id: 'p1',
                name: 'Workspace A',
                fileName: '/tmp/workspace-a',
                expanded: false,
                loading: true
            }),
            expect.objectContaining({
                id: 'p2',
                name: 'Scratch Project',
                expanded: true,
                loading: false
            })
        ]);
        expect(bridge.sendMessage).toHaveBeenCalledWith({ command: 'loadProject', path: '/tmp/workspace-a' });
    });
});

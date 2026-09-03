/**
 * @vitest-environment jsdom
 */

import React, { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { BackendCommand } from '@shared/messages';
import { NavigationProvider } from '../../contexts/NavigationContext';
import { useMessageHandler, MessageHandlerState } from '../useMessageHandler';
import { bridge } from '../../utils/bridge';

vi.mock('../../utils/bridge', () => ({
    bridge: {
        sendMessage: vi.fn(),
        onMessage: vi.fn(() => vi.fn())
    }
}));

function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(NavigationProvider, null, children);
}

describe('useMessageHandler loading states', () => {
    let mockState: MessageHandlerState;
    let messageHandlerCallback: (msg: any) => void;

    beforeEach(() => {
        vi.clearAllMocks();
        (globalThis as any).__APP_VERSION__ = '0.0.0';
        (globalThis as any).localStorage = {
            getItem: vi.fn(() => null),
            setItem: vi.fn(),
            removeItem: vi.fn(),
            clear: vi.fn(),
            key: vi.fn(() => null),
            length: 0
        };

        vi.mocked(bridge.onMessage).mockImplementation((callback) => {
            messageHandlerCallback = callback;
            return vi.fn();
        });

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
            setConfigDir: vi.fn(),
            setSelectedProjectName: vi.fn(),
            setWorkspaceDirty: vi.fn(),
            setSavedProjects: vi.fn(),
            setSaveErrors: vi.fn(),
            setChangelog: vi.fn(),
            setActiveView: vi.fn(),
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

    it('marks restored autosave projects as loading until disk reload completes', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        act(() => {
            messageHandlerCallback({
                command: BackendCommand.RestoreAutosave,
                content: JSON.stringify({
                    projects: [
                        { id: 'p1', name: 'Workspace A', fileName: '/tmp/workspace-a', expanded: false },
                        { id: 'p2', name: 'Scratch Project', expanded: true }
                    ]
                })
            });
        });

        const updater = vi.mocked(mockState.setProjects).mock.calls[0][0] as (prev: any[]) => any[];
        expect(updater([])).toEqual([
            expect.objectContaining({ name: 'Workspace A', loading: true, expanded: false }),
            expect.objectContaining({ name: 'Scratch Project', loading: false, expanded: true })
        ]);
        expect(bridge.sendMessage).toHaveBeenCalledWith({ command: 'loadProject', path: '/tmp/workspace-a' });
    });

    it('clears the loading flag once a project load finishes', () => {
        renderHook(() => useMessageHandler(mockState), { wrapper: Wrapper });

        act(() => {
            messageHandlerCallback({
                command: BackendCommand.ProjectLoaded,
                project: { id: 'p1', name: 'Workspace A', testSuites: [] },
                filename: '/tmp/workspace-a'
            });
        });

        const updater = vi.mocked(mockState.setProjects).mock.calls[0][0] as (prev: any[]) => any[];
        expect(updater([{ id: 'p1', name: 'Workspace A', loading: true, expanded: false }])).toEqual([
            expect.objectContaining({
                id: 'p1',
                name: 'Workspace A',
                fileName: '/tmp/workspace-a',
                loading: false,
                expanded: false
            })
        ]);
    });
});

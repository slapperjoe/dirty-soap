/**
 * Platform Bridge
 * 
 * Provides unified communication between the webview and the backend,
 * supporting both VS Code extension host and Tauri sidecar.
 */

declare global {
    interface Window {
        acquireVsCodeApi?: () => any;
        __TAURI__?: any;
        __TAURI_INTERNALS__?: any;
    }
}

// ============== Environment Detection ==============

export const isVsCode = (): boolean => typeof window !== 'undefined' && !!window.acquireVsCodeApi;
export const isTauri = (): boolean => typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);
export const isStandalone = (): boolean => !isVsCode() && !isTauri();

export type Platform = 'vscode' | 'tauri' | 'standalone';
export const getPlatform = (): Platform => {
    if (isVsCode()) return 'vscode';
    if (isTauri()) return 'tauri';
    return 'standalone';
};

// ============== VS Code API ==============

let vscodeApi: any = null;
if (isVsCode() && !vscodeApi) {
    vscodeApi = window.acquireVsCodeApi!();
}

// ============== Tauri Imports (lazy loaded) ==============

let tauriInvoke: ((cmd: string, args?: any) => Promise<any>) | null = null;
let tauriListen: ((event: string, handler: (e: any) => void) => Promise<() => void>) | null = null;
let sidecarPort: number | null = null;
let tauriInitPromise: Promise<void> | null = null;

async function initTauri(): Promise<void> {
    if (!isTauri()) return;

    try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { listen } = await import('@tauri-apps/api/event');
        tauriInvoke = invoke;
        tauriListen = listen;

        // Get sidecar port from Rust backend
        sidecarPort = await invoke<number>('get_sidecar_port');
    } catch (e) {
        console.error('[Bridge] Failed to initialize Tauri:', e);
    }
}

function ensureTauriInitialized(): Promise<void> {
    if (!isTauri()) return Promise.resolve();
    if (!tauriInitPromise) {
        tauriInitPromise = initTauri();
    }
    return tauriInitPromise;
}

// Initialize Tauri on load
if (isTauri()) {
    ensureTauriInitialized();
}

// ============== Message Types ==============

import { FrontendCommand, BackendCommand } from '@shared/messages';

interface BridgeMessage {
    command: FrontendCommand | string;
    [key: string]: any;
}

export interface BackendMessage {
    command: BackendCommand | string;
    [key: string]: any;
}

// ============== Sidecar HTTP Client (for Tauri) ==============

async function sendToSidecar(message: BridgeMessage): Promise<any> {
    if (!sidecarPort) {
        await ensureTauriInitialized();
        if (tauriInvoke && !sidecarPort) {
            sidecarPort = await tauriInvoke('get_sidecar_port');
        }
        if (!sidecarPort) {
            throw new Error('Sidecar not ready');
        }
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${sidecarPort}/command`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    command: message.command,
                    payload: message
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'Sidecar command failed');
            }
            return result.data;
        } catch (e) {
            lastError = e;
            if (attempt < 2) {
                await new Promise(resolve => setTimeout(resolve, 200));
            }
        }
    }

    throw lastError instanceof Error ? lastError : new Error('Sidecar command failed');
}

// ============== Response to Event Mapping ==============

/**
 * Maps sidecar HTTP responses to BackendCommand events
 * This allows the frontend to receive events just like in VS Code mode
 */
function mapResponseToBackendEvent(command: string, data: any): BackendMessage | null {
    // Map frontend commands to their corresponding backend response events
    const commandToEventMap: Record<string, (data: any) => BackendMessage | null> = {
        [FrontendCommand.LoadWsdl]: (data) => ({
            command: BackendCommand.WsdlParsed,
            // Sidecar returns array of services directly from parseWsdl
            services: Array.isArray(data) ? data : (data?.services || data || []),
            wsdlUrl: data?.wsdlUrl || '',
            targetProjectId: data?.targetProjectId
        }),
        [FrontendCommand.ExecuteRequest]: (data) => ({
            command: BackendCommand.Response,
            // Frontend expects response data in 'result' property
            result: (data && 'response' in data) ? data.response : data || { rawResponse: '', headers: {}, status: 0, timeTaken: 0 }
        }),
        [FrontendCommand.GetHistory]: (data) => ({
            command: BackendCommand.HistoryLoaded,
            entries: data || []
        }),
        [FrontendCommand.GetWatcherHistory]: (data) => ({
            command: BackendCommand.WatcherUpdate,
            history: data || []
        }),
        [FrontendCommand.GetSettings]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            // Frontend expects 'config' not 'settings'
            config: data?.config ?? data,
            raw: data?.raw,
            configDir: data?.configDir,
            configPath: data?.configPath
        }),
        [FrontendCommand.SaveProject]: (data) => ({
            command: BackendCommand.ProjectSaved,
            ...data
        }),
        [FrontendCommand.SaveSettings]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            config: data?.config,
            raw: data?.raw,
            configDir: data?.configDir,
            configPath: data?.configPath
        }),
        [FrontendCommand.SaveUiState]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            config: data?.config,
            raw: data?.raw
        }),
        [FrontendCommand.AddPerformanceSuite]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            config: data?.config ?? data
        }),
        [FrontendCommand.UpdatePerformanceSuite]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            config: data?.config ?? data
        }),
        [FrontendCommand.DeletePerformanceSuite]: (data) => ({
            command: BackendCommand.SettingsUpdate,
            config: data?.config ?? data
        }),
        [FrontendCommand.LoadProject]: (data) => {
            const project = data?.project ?? data;
            const fileName = data?.filename || data?.fileName;
            return {
                command: BackendCommand.ProjectLoaded,
                project: fileName && project ? { ...project, fileName } : project,
                filename: fileName
            };
        },
        [FrontendCommand.GetMockStatus]: (data) => ({
            command: BackendCommand.MockStatus,
            ...data
        }),
        ['webviewReady']: (data) => data, // Pass through sidecar response with samplesProject and changelog
        // Add more mappings as needed
    };

    const mapper = commandToEventMap[command];
    if (mapper) {
        return mapper(data);
    }

    // For commands without specific mappings, return null (no event emitted)
    return null;
}

// ============== Unified Bridge API ==============

type MessageListener = (message: BackendMessage) => void;
const listeners: Set<MessageListener> = new Set();

export const bridge = {
    /**
     * Send message to Backend (VS Code extension or Tauri sidecar)
     * In Tauri mode, responses are converted to backend messages for listeners
     */
    sendMessage: (message: BridgeMessage): void => {
        if (isVsCode() && vscodeApi) {
            vscodeApi.postMessage(message);
        } else if (isTauri()) {
            // Send to sidecar and convert response to backend message
            sendToSidecar(message)
                .then(data => {
                    // Emit test runner updates for Tauri test runs
                    if ((message.command === FrontendCommand.RunTestCase || message.command === FrontendCommand.RunTestSuite) && data?.updates) {
                        data.updates.forEach((update: any) => {
                            listeners.forEach(cb => cb({
                                command: BackendCommand.TestRunnerUpdate,
                                update
                            }));
                        });
                    }

                    // Sidecar can return history entries for executeRequest
                    if (message.command === FrontendCommand.ExecuteRequest && data?.historyEntry) {
                        listeners.forEach(cb => cb({
                            command: BackendCommand.HistoryUpdate,
                            entry: data.historyEntry
                        }));
                    }

                    if (message.command === FrontendCommand.ExecuteRequest && data?.error) {
                        listeners.forEach(cb => cb({
                            command: BackendCommand.Error,
                            error: data.error,
                            message: data.error,
                            originalCommand: message.command
                        }));
                        return;
                    }

                    // Map command responses to backend events
                    const backendEvent = mapResponseToBackendEvent(message.command, data);
                    if (backendEvent) {
                        // Emit to all listeners
                        listeners.forEach(cb => cb(backendEvent));
                    }
                })
                .catch(e => {
                    console.error('[Bridge] Sidecar error:', e);
                    // Emit error to listeners
                    listeners.forEach(cb => cb({
                        command: BackendCommand.Error,
                        error: e.message,
                        originalCommand: message.command
                    }));
                });
        } else {
            console.warn('[Bridge] No backend available (standalone mode)');
        }
    },

    /**
     * Send message and wait for response (Tauri only, VS Code uses events)
     */
    sendMessageAsync: async <T = any>(message: BridgeMessage): Promise<T> => {
        if (isTauri()) {
            return await sendToSidecar(message) as T;
        } else if (isVsCode() && vscodeApi) {
            // VS Code doesn't have request/response, use postMessage
            vscodeApi.postMessage(message);
            return undefined as T;
        }
        throw new Error('No backend available');
    },

    /**
     * Listen for messages from Backend
     */
    onMessage: (callback: MessageListener): (() => void) => {
        listeners.add(callback);

        // VS Code: listen to window messages
        const vsCodeHandler = (event: MessageEvent) => {
            const message = event.data;
            if (message && message.command) {
                callback(message);
            }
        };

        if (isVsCode()) {
            window.addEventListener('message', vsCodeHandler);
        }

        // Tauri: listen to events from backend
        let tauriUnlisten: (() => void) | null = null;
        if (isTauri() && tauriListen) {
            tauriListen('backend_command', (event: any) => {
                callback(event.payload);
            }).then(unlisten => {
                tauriUnlisten = unlisten;
            });
        }

        return () => {
            listeners.delete(callback);
            if (isVsCode()) {
                window.removeEventListener('message', vsCodeHandler);
            }
            if (tauriUnlisten) {
                tauriUnlisten();
            }
        };
    },

    /**
     * State Persistence
     */
    setState: (state: any): void => {
        if (isVsCode() && vscodeApi) {
            vscodeApi.setState(state);
        } else if (isTauri()) {
            // Use localStorage for Tauri
            try {
                localStorage.setItem('apinox_state', JSON.stringify(state));
            } catch (e) {
                console.error('[Bridge] Failed to save state:', e);
            }
        }
    },

    getState: (): any => {
        if (isVsCode() && vscodeApi) {
            return vscodeApi.getState();
        } else if (isTauri()) {
            try {
                const saved = localStorage.getItem('apinox_state');
                return saved ? JSON.parse(saved) : undefined;
            } catch (e) {
                return undefined;
            }
        }
        return undefined;
    },

    /**
     * Emit a local event to all listeners (simulating a backend event)
     */
    emit: (message: BackendMessage): void => {
        listeners.forEach(cb => cb(message));
    },

    /**
     * Get current platform
     */
    getPlatform,
    isVsCode,
    isTauri,
    isStandalone
};

// Export for backwards compatibility
export { FrontendCommand, BackendCommand };

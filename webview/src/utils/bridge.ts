import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { open, save } from '@tauri-apps/plugin-dialog';

// Wrapper to bridge VS Code API and Tauri API transparently

declare global {
    interface Window {
        acquireVsCodeApi?: () => any;
        __TAURI__?: any;
    }
}

// VS Code API singleton
let vscodeApi: any = null;

// Environment Detection
export const isTauri = () => !!window.__TAURI__;
export const isVsCode = () => !!window.acquireVsCodeApi;

// Initialize API
if (isVsCode() && !vscodeApi) {
    vscodeApi = window.acquireVsCodeApi!();
}

export interface BridgeMessage {
    command: string;
    [key: string]: any;
}

export const bridge = {
    // Send message to Backend
    sendMessage: async (message: BridgeMessage) => {
        if (isTauri()) {
            console.log("Tauri Outgoing:", message);
            try {
                // Intercept Dialog Commands
                if (message.command === 'selectLocalWsdl') {
                    try {
                        const path = await open({
                            filters: [{ name: 'WSDL', extensions: ['wsdl', 'xml'] }]
                        });
                        if (path) {
                            // Dispatch event back to window for App.tsx to pick up
                            // App.tsx uses onMessage/handleMessage to listen for 'wsdlSelected'
                            // We can simulate this event.
                            window.postMessage({ command: 'wsdlSelected', path }, '*');
                        }
                    } catch (err) {
                        console.error("Dialog Error:", err);
                    }
                    return;
                }

                if (message.command === 'saveWorkspace') {
                    try {
                        const path = await save({
                            filters: [{ name: 'JSON', extensions: ['json'] }]
                        });
                        if (path) {
                            await invoke('handle_request', { payload: { ...message, path } });
                        }
                    } catch (err) { console.error("Save Error", err); }
                    return;
                }

                if (message.command === 'openWorkspace') {
                    try {
                        const path = await open({
                            filters: [{ name: 'JSON', extensions: ['json'] }]
                        });
                        if (path) {
                            await invoke('handle_request', { payload: { ...message, path } });
                        }
                    } catch (err) { console.error("Open Error", err); }
                    return;
                }

                if (message.command === 'saveProject') {
                    try {
                        const path = await save({
                            filters: [{ name: 'JSON', extensions: ['json'] }]
                        });
                        if (path) {
                            await invoke('handle_request', { payload: { ...message, path } });
                        }
                    } catch (err) { console.error("Save Project Error", err); }
                    return;
                }

                if (message.command === 'loadProject') {
                    try {
                        const path = await open({
                            filters: [{ name: 'JSON', extensions: ['json'] }]
                        });
                        if (path) {
                            await invoke('handle_request', { payload: { ...message, path } });
                        }
                    } catch (err) { console.error("Load Project Error", err); }
                    return;
                }

                // Default: Send to Sidecar
                // @ts-ignore
                await invoke('handle_request', { payload: message });
            } catch (e) {
                console.error("Tauri Invoke Error:", e);
            }
        } else if (vscodeApi) {
            vscodeApi.postMessage(message);
        } else {
            console.warn("No backend bridge found (Not VSCode, Not Tauri)");
        }
    },

    // Listen for messages from Backend
    onMessage: (callback: (message: any) => void) => {
        const handler = (event: MessageEvent) => {
            const message = event.data;
            if (message && message.command) {
                callback(message);
            }
        };
        window.addEventListener('message', handler);

        let unlistenPromise: Promise<UnlistenFn> | undefined;
        if (isTauri()) {
            unlistenPromise = listen('backend-message', (event) => {
                console.log("Tauri Incoming:", event.payload);
                callback(event.payload);
            });
        }

        return () => {
            window.removeEventListener('message', handler);
            if (unlistenPromise) {
                unlistenPromise.then(f => f());
            }
        };
    },

    // State Persistence
    setState: (state: any) => {
        if (vscodeApi) {
            vscodeApi.setState(state);
        }
        if (isTauri()) {
            localStorage.setItem('vscode-state', JSON.stringify(state));
        }
    },

    getState: (): any => {
        if (vscodeApi) {
            return vscodeApi.getState();
        }
        if (isTauri()) {
            const s = localStorage.getItem('vscode-state');
            return s ? JSON.parse(s) : undefined;
        }
        return undefined;
    }
};

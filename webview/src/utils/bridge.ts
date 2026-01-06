/**
 * VS Code Webview Bridge
 * Provides communication between the webview and the VS Code extension host.
 */

declare global {
    interface Window {
        acquireVsCodeApi?: () => any;
    }
}

// VS Code API singleton
let vscodeApi: any = null;

// Environment Detection
export const isVsCode = () => !!window.acquireVsCodeApi;

// Initialize API
if (isVsCode() && !vscodeApi) {
    vscodeApi = window.acquireVsCodeApi!();
}

import { FrontendCommand } from '@shared/messages';

export interface BridgeMessage {
    command: FrontendCommand | string;
    [key: string]: any;
}

export const bridge = {
    // Send message to Backend
    sendMessage: (message: BridgeMessage) => {
        if (vscodeApi) {
            vscodeApi.postMessage(message);
        } else {
            console.warn("No backend bridge found (Not VSCode)");
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

        return () => {
            window.removeEventListener('message', handler);
        };
    },

    // State Persistence
    setState: (state: any) => {
        if (vscodeApi) {
            vscodeApi.setState(state);
        }
    },

    getState: (): any => {
        if (vscodeApi) {
            return vscodeApi.getState();
        }
        return undefined;
    }
};

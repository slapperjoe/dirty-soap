/**
 * logger.ts
 *
 * Lightweight logging utility for the request-editor package.
 * Logs are captured in-memory for debugging purposes.
 */

export interface EditorLogEntry {
    timestamp: number;
    level: 'debug' | 'warn' | 'error' | 'info';
    message: string;
}

export const editorLogs: EditorLogEntry[] = [];
const MAX_LOGS = 2000;

function argToString(arg: unknown): string {
    if (typeof arg === 'object' && arg !== null) {
        try {
            return JSON.stringify(arg);
        } catch {
            if (arg instanceof Error) return `Error: ${arg.message}`;
            if (typeof (arg as any).toString === 'function' && (arg as any).toString !== Object.prototype.toString) {
                return (arg as any).toString();
            }
            return '[Circular or Complex Object]';
        }
    }
    return String(arg);
}

export const captureLog = (level: 'debug' | 'warn' | 'error' | 'info', ...args: unknown[]): void => {
    const message = args.map(argToString).join(' ');
    editorLogs.push({ timestamp: Date.now(), level, message });
    if (editorLogs.length > MAX_LOGS) {
        editorLogs.shift();
    }
};

// R6 (MONACO_LAG_ROOT_CAUSE.md): per-keystroke debugLog calls (e.g. the
// request editor's onChange) must not pay for log capture in production.
// Debug logging is off by default; flip it on while debugging.
let debugLoggingEnabled = false;

export const setDebugLogging = (enabled: boolean): void => {
    debugLoggingEnabled = enabled;
};

export const isDebugLogging = (): boolean => debugLoggingEnabled;

/**
 * Debug log: writes to the in-memory log store only, and only while debug
 * logging is enabled (see setDebugLogging).
 * Does NOT write to the browser DevTools console.
 *
 * Usage:
 *   debugLog('[ExtractorsPanel] Rendering');
 *   debugLog('[ThemeContext] Applied dark theme');
 */
export const debugLog = (context: string, data?: unknown): void => {
    if (!debugLoggingEnabled) {
        return;
    }
    if (data !== undefined) {
        captureLog('debug', context, data);
    } else {
        captureLog('debug', context);
    }
};

/**
 * Warn log: writes to the in-memory log store.
 *
 * Usage:
 *   debugWarn('[ThemeContext] Theme switching disabled');
 */
export const debugWarn = (context: string, data?: unknown): void => {
    if (data !== undefined) {
        captureLog('warn', context, data);
    } else {
        captureLog('warn', context);
    }
};

/**
 * Error log: writes to the in-memory log store.
 *
 * Usage:
 *   debugError('[ExtractorsPanel] Evaluation Error', err);
 */
export const debugError = (context: string, data?: unknown): void => {
    if (data !== undefined) {
        captureLog('error', context, data);
    } else {
        captureLog('error', context);
    }
};

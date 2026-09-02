import { RequestHistoryEntry } from "@shared/models";
import { BackendCommand } from "@shared/messages";
import { bridge, invokeTauriCommand } from "./bridge";
import { debugLog } from "./logger";

/**
 * Unified-explorer history write (F-13 / R-08 — phase 2, SOAP path;
 * REST/GraphQL extension lands in phase 4).
 *
 * The unified execute path previously never wrote request history, so a
 * request run from the unified explorer vanished from the global History
 * view — a user-visible regression versus the legacy explorer. This module
 * closes the gap for the unified path by writing to the SAME single global
 * history store the legacy path uses (`add_history_entry`, decision doc
 * §10.4 / Q6: never a second store).
 *
 * The entry shape mirrors `saveRequestHistory` in `utils/bridge.ts`
 * (legacy reference) field-for-field so unified entries render identically
 * in the History view, and the `HistoryUpdate` event is emitted the same
 * way (`bridge.emit` → `useMessageHandler` prepends the entry to
 * `requestHistory`) so the view updates live without a reload.
 */
export interface UnifiedHistoryParams {
    requestName: string;
    endpoint: string;
    method: string;
    projectName: string;
    interfaceName: string;
    operationName: string;
    requestBody: string;
    headers: Record<string, string>;
    statusCode: number;
    duration: number;
    responseBody: string;
    responseHeaders: Record<string, string>;
    success: boolean;
    error?: string;
}

/**
 * Build a history entry, persist it via `add_history_entry`, and emit a
 * `HistoryUpdate` event for the live History view.
 *
 * Best-effort by design (same contract as the legacy path): a persistence
 * failure is logged and swallowed — a failed history write must never break
 * a successful request execution.
 */
export function saveUnifiedHistoryEntry(params: UnifiedHistoryParams): void {
    const historyEntry: RequestHistoryEntry & { method: string; status?: number } = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        requestName: params.requestName,
        endpoint: params.endpoint,
        method: params.method,
        projectName: params.projectName,
        interfaceName: params.interfaceName,
        operationName: params.operationName,
        requestBody: params.requestBody,
        headers: params.headers,
        // Legacy field parity: the Rust `RequestHistoryEntry` deserializes
        // `status` (alias `statusCode`) and the History view reads
        // `entry.statusCode` — carry both so unified entries render exactly
        // like legacy entries.
        status: params.statusCode,
        statusCode: params.statusCode,
        duration: params.duration,
        responseBody: params.responseBody,
        responseHeaders: params.responseHeaders,
        responseSize: params.responseBody.length,
        success: params.success,
        starred: false,
        error: params.error,
    };

    invokeTauriCommand('add_history_entry', { entry: historyEntry }).catch((e: any) => {
        // Same fallback semantics as the legacy path (bridge.ts
        // saveRequestHistory): warn, never throw.
        console.warn("[UnifiedHistory] Failed to save history entry:", e);
        debugLog("[UnifiedHistory] add_history_entry failed", String(e));
    });

    bridge.emit({
        command: BackendCommand.HistoryUpdate,
        entry: historyEntry,
    } as any);
}

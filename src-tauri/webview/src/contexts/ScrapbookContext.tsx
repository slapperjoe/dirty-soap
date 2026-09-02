/**
 * ScrapbookContext.tsx
 * 
 * Context for managing scrapbook requests (API Explorer quick requests).
 * Handles state, backend communication, and CRUD operations for scrapbook requests.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { ScrapbookRequest, ScrapbookState, ApiRequest } from '@shared/models';
import { FrontendCommand, BackendCommand } from '@shared/messages';
import { debugLog } from '../utils/logger';
import { bridge } from '../utils/bridge';
import { resolveScrapbookCapture } from '../utils/unifiedScrapbookCapture';

interface ScrapbookContextType {
    // State
    scrapbookRequests: ScrapbookRequest[];
    selectedScrapbookRequest: ScrapbookRequest | null;
    loading: boolean;

    // Actions
    createRequest: () => Promise<ScrapbookRequest | null>;
    updateRequest: (id: string, updates: Partial<ScrapbookRequest>) => Promise<void>;
    deleteRequest: (id: string) => Promise<void>;
    selectRequest: (request: ScrapbookRequest | null) => void;
    refreshScrapbook: () => Promise<void>;
    /**
     * F-02 / R-05 (Q4(c)) — unified quick-request auto-capture.
     *
     * Called from the UNIFIED execute/save path after a successful execution.
     * Capture rule (decision doc §11 Q4(c)): every execution UPDATES the
     * existing scrapbook entry keyed by endpoint+operation (matched via
     * `scrapbookCaptureKey`), else APPENDS a new entry. This is the unified
     * selection model's replacement for the legacy `useScrapbookAutoSave`
     * hook, which remains untouched (R4).
     */
    captureExecution: (request: ApiRequest, operationName?: string | null) => Promise<ScrapbookRequest | null>;
}

const ScrapbookContext = createContext<ScrapbookContextType | undefined>(undefined);

export const useScrapbook = () => {
    const context = useContext(ScrapbookContext);
    if (!context) {
        throw new Error('useScrapbook must be used within a ScrapbookProvider');
    }
    return context;
};

/**
 * Non-throwing variant of `useScrapbook` for surfaces that can degrade
 * gracefully when rendered outside the provider (the unified explorer main
 * surface in isolated component tests). In the app the `ScrapbookProvider`
 * wraps everything (App.tsx), so this resolves to the same context as
 * `useScrapbook`; the throwing `useScrapbook` contract is unchanged for
 * surfaces that REQUIRE the provider (documented error path:
 * use-outside-provider throws).
 */
export const useScrapbookOptional = () => useContext(ScrapbookContext);

export const ScrapbookProvider = ({ children }: { children: ReactNode }) => {
    const [scrapbookRequests, setScrapbookRequests] = useState<ScrapbookRequest[]>([]);
    const [selectedScrapbookRequest, setSelectedScrapbookRequest] = useState<ScrapbookRequest | null>(null);
    const [loading, setLoading] = useState<boolean>(false);

    /**
     * Load scrapbook from backend on mount
     */
    useEffect(() => {
        loadScrapbook();
    }, []);

    /**
     * Listen for backend events
     */
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            
            switch (message.command) {
                case BackendCommand.ScrapbookLoaded:
                    if (message.state) {
                        setScrapbookRequests(message.state.requests || []);
                    }
                    break;
                
                case BackendCommand.ScrapbookUpdated:
                    if (message.state) {
                        setScrapbookRequests(message.state.requests || []);
                        
                        // Update selected request if it exists in new state
                        if (selectedScrapbookRequest) {
                            const updated = message.state.requests.find(
                                (r: ScrapbookRequest) => r.id === selectedScrapbookRequest.id
                            );
                            if (updated) {
                                setSelectedScrapbookRequest(updated);
                            } else {
                                // Request was deleted
                                setSelectedScrapbookRequest(null);
                            }
                        }
                    }
                    break;
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [selectedScrapbookRequest]);

    /**
     * Load scrapbook from backend
     */
    const loadScrapbook = async () => {
        try {
            setLoading(true);
            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.GetScrapbook
            });
            
            if (response?.state) {
                setScrapbookRequests(response.state.requests || []);
                debugLog('[Scrapbook] Loaded requests', response.state.requests?.length ?? 0);
                // Emit loaded event for consistency
                bridge.emit({
                    command: BackendCommand.ScrapbookLoaded,
                    state: response.state
                });
            }
        } catch (error) {
            console.error('[Scrapbook] Failed to load scrapbook:', error);
        } finally {
            setLoading(false);
        }
    };

    /**
     * Refresh scrapbook from backend
     */
    const refreshScrapbook = useCallback(async () => {
        await loadScrapbook();
    }, []);

    /**
     * Create a new scrapbook request with defaults.
     * Returns the created request (or null when the backend response does not
     * confirm it) so the unified sidebar can select it immediately.
     */
    const createRequest = useCallback(async (): Promise<ScrapbookRequest | null> => {
        try {
            const now = new Date().toISOString();
            const newRequest: ScrapbookRequest = {
                id: crypto.randomUUID(),
                name: `Request ${new Date().toLocaleTimeString()}`,
                request: '', // Empty body
                requestType: 'soap',
                method: 'POST',
                bodyType: 'xml',
                contentType: 'application/soap+xml',
                headers: {
                    'Content-Type': 'application/soap+xml'
                },
                endpoint: '',
                createdAt: now,
                lastModified: now
            };

            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.AddScrapbookRequest,
                request: newRequest
            });

            if (response?.state) {
                setScrapbookRequests(response.state.requests || []);
                // Auto-select the new request
                const created = response.state.requests.find((r: ScrapbookRequest) => r.id === newRequest.id);
                if (created) {
                    setSelectedScrapbookRequest(created);
                }
                // Emit updated event
                bridge.emit({
                    command: BackendCommand.ScrapbookUpdated,
                    state: response.state
                });
                return created || null;
            }
            return null;
        } catch (error) {
            console.error('[Scrapbook] Failed to create request:', error);
            throw error;
        }
    }, []);

    /**
     * Update an existing scrapbook request
     */
    const updateRequest = useCallback(async (id: string, updates: Partial<ScrapbookRequest>) => {
        try {
            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.UpdateScrapbookRequest,
                id,
                updates
            });

            if (response?.state) {
                setScrapbookRequests(response.state.requests || []);
                // Update selected if it's the one being updated
                if (selectedScrapbookRequest?.id === id) {
                    const updated = response.state.requests.find((r: ScrapbookRequest) => r.id === id);
                    if (updated) {
                        setSelectedScrapbookRequest(updated);
                    }
                }
                // Emit updated event
                bridge.emit({
                    command: BackendCommand.ScrapbookUpdated,
                    state: response.state
                });
            }
        } catch (error) {
            console.error('[Scrapbook] Failed to update request:', error);
            throw error;
        }
    }, [selectedScrapbookRequest]);

    /**
     * Delete a scrapbook request
     */
    const deleteRequest = useCallback(async (id: string) => {
        try {
            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.DeleteScrapbookRequest,
                id
            });

            if (response?.state) {
                setScrapbookRequests(response.state.requests || []);
                // Clear selection if deleted request was selected
                if (selectedScrapbookRequest?.id === id) {
                    setSelectedScrapbookRequest(null);
                }
                // Emit updated event
                bridge.emit({
                    command: BackendCommand.ScrapbookUpdated,
                    state: response.state
                });
            }
        } catch (error) {
            console.error('[Scrapbook] Failed to delete request:', error);
            throw error;
        }
    }, [selectedScrapbookRequest]);

    /**
     * Select a scrapbook request
     */
    const selectRequest = useCallback((request: ScrapbookRequest | null) => {
        setSelectedScrapbookRequest(request);
    }, []);

    /**
     * F-02 (Q4(c)) capture rule, applied on the unified execute/save path:
     *
     *   - every execution UPDATES the existing scrapbook entry keyed by
     *     endpoint+operation (matched case-insensitively on the normalized
     *     endpoint, case-sensitively on the operation name via
     *     `scrapbookCaptureKey`),
     *   - else APPENDS a new entry (no unbounded growth — re-running the same
     *     endpoint+operation overwrites the entry in place).
     *
     * The `scrapbook.json` schema is frozen: a `ScrapbookRequest` carries no
     * dedicated `operation` field, so for quick requests created from an
     * operation the entry's `name` is the operation identifier. Capture is
     * best-effort: a persistence failure is logged, never thrown, so an
     * execution can never be broken by scrapbook I/O.
     */
    const captureExecution = useCallback(async (request: ApiRequest, operationName?: string | null): Promise<ScrapbookRequest | null> => {
        const captured: ApiRequest = {
            ...request,
            name: operationName || request.name,
        };
        const decision = resolveScrapbookCapture(scrapbookRequests, captured, operationName);

        try {
            if (decision.mode === 'update') {
                const existing = scrapbookRequests[decision.index!];
                await updateRequest(existing.id, {
                    name: captured.name,
                    request: request.request,
                    endpoint: request.endpoint,
                    headers: request.headers,
                    method: request.method,
                    contentType: request.contentType,
                    requestType: request.requestType,
                    bodyType: request.bodyType,
                });
                const updated = (await refreshScrapbookSilently())?.find(r => r.id === existing.id);
                return updated || existing;
            }

            const now = new Date().toISOString();
            const newRequest: ScrapbookRequest = {
                id: crypto.randomUUID(),
                name: captured.name,
                request: request.request || '',
                requestType: request.requestType || 'soap',
                method: request.method || 'POST',
                bodyType: request.bodyType || 'xml',
                contentType: request.contentType,
                headers: request.headers,
                endpoint: request.endpoint || '',
                createdAt: now,
                lastModified: now,
            };
            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.AddScrapbookRequest,
                request: newRequest,
            });
            const created = response?.state?.requests?.find((r: ScrapbookRequest) => r.id === newRequest.id);
            if (created) {
                // Keep local state in sync without re-fetching; also emit the
                // updated event so other consumers re-sync (same contract as
                // createRequest).
                setScrapbookRequests(response.state.requests);
                bridge.emit({
                    command: BackendCommand.ScrapbookUpdated,
                    state: response.state,
                });
            }
            return created || null;
        } catch (error) {
            console.error('[Scrapbook] Auto-capture failed:', error);
            return null;
        }
    }, [scrapbookRequests, updateRequest]);

    /**
     * Re-fetch the current scrapbook from the backend (used by
     * `captureExecution` to read back the just-updated entry).
     */
    const refreshScrapbookSilently = useCallback(async (): Promise<ScrapbookRequest[] | null> => {
        try {
            const response = await bridge.sendMessageAsync({
                command: FrontendCommand.GetScrapbook,
            });
            return response?.state?.requests || [];
        } catch {
            return null;
        }
    }, []);

    return (
        <ScrapbookContext.Provider
            value={{
                scrapbookRequests,
                selectedScrapbookRequest,
                loading,
                createRequest,
                updateRequest,
                deleteRequest,
                selectRequest,
                refreshScrapbook,
                captureExecution
            }}
        >
            {children}
        </ScrapbookContext.Provider>
    );
};

/**
 * Hook to auto-save scrapbook request updates when edited in the workspace.
 * Call this in a component that handles request updates (e.g., MainContent).
 * 
 * @param selectedRequest - The currently selected workspace request
 * @param selectedProjectName - The currently selected project (null if scrapbook)
 * @param selectedInterface - The currently selected interface (null if scrapbook)
 * @param selectedOperation - The currently selected operation (null if scrapbook)
 * @param selectedTestCase - The currently selected test case (null if scrapbook)
 */
export const useScrapbookAutoSave = (
    _selectedRequest: any | null,
    selectedProjectName: string | null,
    selectedInterface: any | null,
    selectedOperation: any | null,
    selectedTestCase: any | null
) => {
    const { updateRequest, selectedScrapbookRequest } = useScrapbook();

    return useCallback(async (updated: any) => {
        // Only save if this is a scrapbook request context (no project/interface/operation/test)
        const isScrapbookContext = !selectedProjectName && !selectedInterface && !selectedOperation && !selectedTestCase;
        
        if (!isScrapbookContext) {
            return false; // Not a scrapbook update
        }
        
        if (!updated.id) {
            return false;
        }
        
        if (!selectedScrapbookRequest) {
            return false;
        }

        debugLog('[Scrapbook] Auto-saving request', updated.id);
        try {
            await updateRequest(updated.id, {
                name: updated.name,
                request: updated.request,
                endpoint: updated.endpoint,
                headers: updated.headers,
                method: updated.method,
                contentType: updated.contentType,
                requestType: updated.requestType,
                bodyType: updated.bodyType
            });
            return true;
        } catch (error) {
            console.error('[Scrapbook] Auto-save failed:', error);
            return false;
        }
    }, [updateRequest, selectedProjectName, selectedInterface, selectedOperation, selectedTestCase, selectedScrapbookRequest]);
};

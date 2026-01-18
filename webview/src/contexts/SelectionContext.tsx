/**
 * SelectionContext.tsx
 * 
 * Centralizes UI selection state for the APInox application.
 * This context tracks what the user has currently selected in the UI:
 * - Selected interface, operation, request
 * - Selected test case and step
 * - Current response and loading state
 * 
 * Usage:
 *   1. Wrap your app with <SelectionProvider>
 *   2. Access state and actions via useSelection() hook
 * 
 * Example:
 *   const { selectedRequest, setSelectedRequest, clearSelection } = useSelection();
 */

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { ApiInterface, ApiOperation, ApiRequest, TestCase, TestStep, TestSuite } from '@shared/models';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Shape of the SelectionContext value.
 * Contains selection state, setters, and utility actions.
 */
interface SelectionContextValue {
    // -------------------------------------------------------------------------
    // SELECTION STATE
    // -------------------------------------------------------------------------

    /** Currently selected WSDL interface */
    selectedInterface: ApiInterface | null;

    /** Currently selected operation within an interface */
    selectedOperation: ApiOperation | null;

    /** Currently selected request within an operation */
    selectedRequest: ApiRequest | null;

    /** Currently selected test step (for test runner) */
    selectedStep: TestStep | null;

    /** Currently selected Test Suite */
    selectedTestSuite: TestSuite | null;

    /** Currently selected test case (for test runner) */
    selectedTestCase: TestCase | null;

    /** Currently selected performance suite ID */
    selectedPerformanceSuiteId: string | null;

    // -------------------------------------------------------------------------
    // REQUEST/RESPONSE STATE
    // -------------------------------------------------------------------------

    /** Response from the last executed request */
    response: any;

    /** Loading indicator for request execution */
    loading: boolean;

    // -------------------------------------------------------------------------
    // STATE SETTERS
    // -------------------------------------------------------------------------

    setSelectedInterface: React.Dispatch<React.SetStateAction<ApiInterface | null>>;
    setSelectedOperation: React.Dispatch<React.SetStateAction<ApiOperation | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<ApiRequest | null>>;
    setSelectedStep: React.Dispatch<React.SetStateAction<TestStep | null>>;
    setSelectedTestSuite: React.Dispatch<React.SetStateAction<TestSuite | null>>;
    setSelectedTestCase: React.Dispatch<React.SetStateAction<TestCase | null>>;
    setSelectedPerformanceSuiteId: React.Dispatch<React.SetStateAction<string | null>>;
    setResponse: React.Dispatch<React.SetStateAction<any>>;
    setLoading: React.Dispatch<React.SetStateAction<boolean>>;

    // -------------------------------------------------------------------------
    // UTILITY ACTIONS
    // -------------------------------------------------------------------------

    /**
     * Clears all selection state.
     * Useful when navigating away or closing a project.
     */
    clearSelection: () => void;

    /**
     * Clears selection except for test case.
     * Used when selecting a new test case to clear sub-selections.
     */
    clearSubSelection: () => void;
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

/**
 * The React Context for selection state.
 * Initially undefined - must be used within SelectionProvider.
 */
const SelectionContext = createContext<SelectionContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface SelectionProviderProps {
    children: ReactNode;
}

/**
 * Provider component that manages selection state.
 * Wrap your application (or relevant portion) with this provider.
 */
export function SelectionProvider({ children }: SelectionProviderProps) {
    // -------------------------------------------------------------------------
    // STATE
    // -------------------------------------------------------------------------

    const [selectedInterface, setSelectedInterface] = useState<ApiInterface | null>(null);
    const [selectedOperation, setSelectedOperation] = useState<ApiOperation | null>(null);
    const [selectedRequestState, setSelectedRequestState] = useState<ApiRequest | null>(null);
    const selectedRequestRef = React.useRef<ApiRequest | null>(null);
    const [selectedStep, setSelectedStep] = useState<TestStep | null>(null);
    const [selectedTestSuite, setSelectedTestSuite] = useState<TestSuite | null>(null);
    const [selectedTestCase, setSelectedTestCase] = useState<TestCase | null>(null);
    const [selectedPerformanceSuiteId, setSelectedPerformanceSuiteId] = useState<string | null>(null);
    const [response, setResponseState] = useState<any>(null);
    const [responseCache, setResponseCache] = useState<Record<string, any>>({});
    const [loading, setLoading] = useState(false);

    const getCacheKey = useCallback((req: ApiRequest | null) => req?.id || req?.name || null, []);
    const getStorageKey = useCallback((key: string) => `apinox:lastResponse:${key}`, []);

    const restoreResponseForRequest = useCallback((req: ApiRequest | null, existingCache?: Record<string, any>) => {
        const key = getCacheKey(req);
        if (!req || !key) {
            console.log('[SelectionContext] restoreResponseForRequest: no request/key, clearing response');
            setResponseState(null);
            return;
        }

        const cache = existingCache || responseCache;
        if (cache.hasOwnProperty(key)) {
            console.log('[SelectionContext] restoreResponseForRequest: restored from in-memory cache', { key });
            setResponseState(cache[key]);
            return;
        }

        try {
            const stored = window.localStorage.getItem(getStorageKey(key));
            if (stored) {
                const parsed = JSON.parse(stored);
                console.log('[SelectionContext] restoreResponseForRequest: restored from localStorage', { key });
                setResponseCache((c) => ({ ...c, [key]: parsed }));
                setResponseState(parsed);
                return;
            }
        } catch (e) {
            console.warn('[SelectionContext] Failed to read persisted response', e);
        }

        console.log('[SelectionContext] restoreResponseForRequest: no cached response', { key });

        setResponseState(null);
    }, [getCacheKey, getStorageKey, responseCache]);

    const setSelectedRequest = useCallback<React.Dispatch<React.SetStateAction<ApiRequest | null>>>((next) => {
        const resolved = typeof next === 'function'
            ? (next as (prev: ApiRequest | null) => ApiRequest | null)(selectedRequestRef.current)
            : next;

        console.log('[SelectionContext] setSelectedRequest', { name: resolved?.name, id: (resolved as any)?.id });
        selectedRequestRef.current = resolved;
        setSelectedRequestState(resolved);
        restoreResponseForRequest(resolved);
    }, [restoreResponseForRequest]);

    const setResponse = useCallback<React.Dispatch<React.SetStateAction<any>>>((next) => {
        setResponseState((prev) => {
            const resolved = typeof next === 'function' ? (next as any)(prev) : next;
            const key = getCacheKey(selectedRequestRef.current);
            if (key && resolved != null) {
                setResponseCache((cache) => ({ ...cache, [key]: resolved }));
                try {
                    const storageKey = getStorageKey(key);
                    window.localStorage.setItem(storageKey, JSON.stringify(resolved));
                } catch (e) {
                    console.warn('[SelectionContext] Failed to persist response', e);
                }
            } else {
                console.log('[SelectionContext] setResponse skipped persisting (no key or null response)', { key, hasResponse: resolved != null });
            }
            return resolved;
        });
    }, [getCacheKey, getStorageKey]);

    // Restore cached response when switching requests
    useEffect(() => {
        console.log('[SelectionContext] selectedRequest changed, attempting restore');
        restoreResponseForRequest(selectedRequestState, responseCache);
    }, [selectedRequestState, responseCache, restoreResponseForRequest]);

    // -------------------------------------------------------------------------
    // UTILITY ACTIONS
    // -------------------------------------------------------------------------

    /**
     * Clears all selection state.
     * Call when closing a project or navigating to a different view.
     */
    const clearSelection = useCallback(() => {
        setSelectedInterface(null);
        setSelectedOperation(null);
        setSelectedRequest(null);
        setSelectedStep(null);
        setSelectedTestSuite(null);
        setSelectedTestCase(null);
        setSelectedPerformanceSuiteId(null);
        setResponseState(null);
        setResponseCache({});
    }, []);

    /**
     * Clears sub-selections but keeps test case.
     * Used when selecting a test case to reset step/request selection.
     */
    const clearSubSelection = useCallback(() => {
        setSelectedStep(null);
        setSelectedRequest(null);
        setSelectedOperation(null);
        setSelectedInterface(null);
        setSelectedPerformanceSuiteId(null);
        setResponseState(null);
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const value: SelectionContextValue = {
        // Selection State
        selectedInterface,
        selectedOperation,
        selectedRequest: selectedRequestState,
        selectedStep,
        selectedTestSuite,
        selectedTestCase,
        selectedPerformanceSuiteId,

        // Request/Response State
        response,
        loading,

        // Setters
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedStep,
        setSelectedTestSuite,
        setSelectedTestCase,
        setSelectedPerformanceSuiteId,
        setResponse,
        setLoading,

        // Utilities
        clearSelection,
        clearSubSelection
    };

    return (
        <SelectionContext.Provider value={value}>
            {children}
        </SelectionContext.Provider>
    );
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access selection context.
 * Must be used within a SelectionProvider.
 * 
 * @throws Error if used outside of SelectionProvider
 * 
 * @example
 * function RequestPanel() {
 *     const { selectedRequest, response, loading } = useSelection();
 *     if (!selectedRequest) return <div>Select a request</div>;
 *     return <Editor value={selectedRequest.request} />;
 * }
 */
export function useSelection(): SelectionContextValue {
    const context = useContext(SelectionContext);

    if (context === undefined) {
        throw new Error('useSelection must be used within a SelectionProvider');
    }

    return context;
}

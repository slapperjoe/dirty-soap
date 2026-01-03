/**
 * SelectionContext.tsx
 * 
 * Centralizes UI selection state for the Dirty SOAP application.
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

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { SoapUIInterface, SoapUIOperation, SoapUIRequest, SoapTestCase, SoapTestStep, PerformanceSuite } from '../models';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Shape of the SelectionContext value.
 * Contains selection state, setters, and utility actions.
 */
export interface SelectionContextValue {
    // -------------------------------------------------------------------------
    // SELECTION STATE
    // -------------------------------------------------------------------------

    /** Currently selected WSDL interface */
    selectedInterface: SoapUIInterface | null;

    /** Currently selected operation within an interface */
    selectedOperation: SoapUIOperation | null;

    /** Currently selected request within an operation */
    selectedRequest: SoapUIRequest | null;

    /** Currently selected test step (for test runner) */
    selectedStep: SoapTestStep | null;

    /** Currently selected test case (for test runner) */
    selectedTestCase: SoapTestCase | null;

    /** Currently selected performance suite */
    selectedPerformanceSuite: PerformanceSuite | null;

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

    setSelectedInterface: React.Dispatch<React.SetStateAction<SoapUIInterface | null>>;
    setSelectedOperation: React.Dispatch<React.SetStateAction<SoapUIOperation | null>>;
    setSelectedRequest: React.Dispatch<React.SetStateAction<SoapUIRequest | null>>;
    setSelectedStep: React.Dispatch<React.SetStateAction<SoapTestStep | null>>;
    setSelectedTestCase: React.Dispatch<React.SetStateAction<SoapTestCase | null>>;
    setSelectedPerformanceSuite: React.Dispatch<React.SetStateAction<PerformanceSuite | null>>;
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

    const [selectedInterface, setSelectedInterface] = useState<SoapUIInterface | null>(null);
    const [selectedOperation, setSelectedOperation] = useState<SoapUIOperation | null>(null);
    const [selectedRequest, setSelectedRequest] = useState<SoapUIRequest | null>(null);
    const [selectedStep, setSelectedStep] = useState<SoapTestStep | null>(null);
    const [selectedTestCase, setSelectedTestCase] = useState<SoapTestCase | null>(null);
    const [selectedPerformanceSuite, setSelectedPerformanceSuite] = useState<PerformanceSuite | null>(null);
    const [response, setResponse] = useState<any>(null);
    const [loading, setLoading] = useState(false);

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
        setSelectedTestCase(null);
        setSelectedPerformanceSuite(null);
        setResponse(null);
    }, []);

    /**
     * Clears sub-selections but keeps test case.
     * Useful when selecting a test case to reset step/request selection.
     */
    const clearSubSelection = useCallback(() => {
        setSelectedStep(null);
        setSelectedRequest(null);
        setSelectedOperation(null);
        setSelectedInterface(null);
        setSelectedPerformanceSuite(null);
        setResponse(null);
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const value: SelectionContextValue = {
        // Selection State
        selectedInterface,
        selectedOperation,
        selectedRequest,
        selectedStep,
        selectedTestCase,
        selectedPerformanceSuite,

        // Request/Response State
        response,
        loading,

        // Setters
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedStep,
        setSelectedTestCase,
        setSelectedPerformanceSuite,
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

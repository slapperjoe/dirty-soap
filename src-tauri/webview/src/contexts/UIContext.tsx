/**
 * UIContext.tsx
 * 
 * Centralizes UI configuration and layout state for the APInox application.
 * This context manages:
 * - Active sidebar view (projects, explorer, watcher, proxy)
 * - Layout preferences (vertical/horizontal, line numbers, etc.)
 * - Modal visibility states
 * - Settings and configuration
 * 
 * Usage:
 *   1. Wrap your app with <UIProvider>
 *   2. Access state and actions via useUI() hook
 * 
 * Example:
 *   const { activeView, setActiveView, layoutMode, toggleLayout } = useUI();
 */

import React, { createContext, useContext, useState, ReactNode, useCallback } from 'react';
import { ApinoxConfig } from '@shared/models';
import { bridge } from '../utils/bridge';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Shape of the UIContext value.
 * Contains UI configuration, layout state, and view management.
 */
interface UIContextValue {
    // -------------------------------------------------------------------------
    // VIEW STATE - Moved to NavigationContext
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // LAYOUT STATE
    // -------------------------------------------------------------------------

    /** Request/response layout direction */
    layoutMode: 'vertical' | 'horizontal';
    setLayoutMode: React.Dispatch<React.SetStateAction<'vertical' | 'horizontal'>>;

    /** Toggle between vertical and horizontal layout */
    toggleLayout: () => void;

    /** Show line numbers in editors */
    showLineNumbers: boolean;
    setShowLineNumbers: React.Dispatch<React.SetStateAction<boolean>>;
    toggleLineNumbers: () => void;

    /** Inline element values in XML formatting */
    inlineElementValues: boolean;
    setInlineElementValues: React.Dispatch<React.SetStateAction<boolean>>;

    /** Hide causality debugging data */
    hideCausalityData: boolean;
    setHideCausalityData: React.Dispatch<React.SetStateAction<boolean>>;

    /** Split ratio between request and response panels */
    splitRatio: number;
    setSplitRatio: React.Dispatch<React.SetStateAction<number>>;

    /** Whether the user is currently resizing panels */
    isResizing: boolean;
    setIsResizing: React.Dispatch<React.SetStateAction<boolean>>;

    // -------------------------------------------------------------------------
    // MODAL STATE
    // -------------------------------------------------------------------------

    /** Settings modal visibility */
    showSettings: boolean;
    setShowSettings: React.Dispatch<React.SetStateAction<boolean>>;

    /** Initial tab when opening settings modal */
    initialSettingsTab: string | null;
    setInitialSettingsTab: React.Dispatch<React.SetStateAction<string | null>>;

    /** Helper to open settings on a specific tab */
    openSettings: (tab?: string) => void;

    /** Help modal visibility */
    showHelp: boolean;
    setShowHelp: React.Dispatch<React.SetStateAction<boolean>>;

    /** Specific help section to show */
    helpSection: string | null;
    setHelpSection: React.Dispatch<React.SetStateAction<string | null>>;

    /** Helper to open help to a specific section */
    openHelp: (sectionId?: string) => void;

    /** Azure DevOps modal visibility */
    showDevOpsModal: boolean;
    setShowDevOpsModal: React.Dispatch<React.SetStateAction<boolean>>;

    /** Debug modal visibility */
    showDebugModal: boolean;
    setShowDebugModal: React.Dispatch<React.SetStateAction<boolean>>;

    /** Helper to open debug modal */
    openDebugModal: () => void;

    // -------------------------------------------------------------------------
    // CONFIGURATION STATE
    // -------------------------------------------------------------------------

    /** Application configuration */
    config: ApinoxConfig | null;
    setConfig: React.Dispatch<React.SetStateAction<ApinoxConfig | null>>;

    /** Raw config JSON string (for settings editor) */
    rawConfig: string;
    setRawConfig: React.Dispatch<React.SetStateAction<string>>;

    /** Path to current config file */
    configPath: string | null;
    setConfigPath: React.Dispatch<React.SetStateAction<string | null>>;

    /** Settings directory (backend) */
    configDir: string | null;
    setConfigDir: React.Dispatch<React.SetStateAction<string | null>>;
}

// =============================================================================
// CONTEXT CREATION
// =============================================================================

const UIContext = createContext<UIContextValue | undefined>(undefined);

// =============================================================================
// PROVIDER COMPONENT
// =============================================================================

interface UIProviderProps {
    children: ReactNode;
}

/**
 * Provider component that manages UI state.
 * Wrap your application (or relevant portion) with this provider.
 */
export function UIProvider({ children }: UIProviderProps) {
    // -------------------------------------------------------------------------
    // VIEW STATE - Moved to NavigationContext
    // -------------------------------------------------------------------------

    // -------------------------------------------------------------------------
    // LAYOUT STATE
    // -------------------------------------------------------------------------

    const [layoutMode, setLayoutMode] = useState<'vertical' | 'horizontal'>('vertical');
    const [showLineNumbers, setShowLineNumbers] = useState(true);
    const [inlineElementValues, setInlineElementValues] = useState(false);
    const [hideCausalityData, setHideCausalityData] = useState(false);
    const [splitRatio, setSplitRatio] = useState(0.5);
    const [isResizing, setIsResizing] = useState(false);

    // -------------------------------------------------------------------------
    // MODAL STATE
    // -------------------------------------------------------------------------

    const [showSettings, setShowSettings] = useState(false);
    const [initialSettingsTab, setInitialSettingsTab] = useState<string | null>(null);
    const [showHelp, setShowHelp] = useState(false);
    const [helpSection, setHelpSection] = useState<string | null>(null);
    const [showDevOpsModal, setShowDevOpsModal] = useState(false);
    const [showDebugModal, setShowDebugModal] = useState(false);

    // -------------------------------------------------------------------------
    // CONFIGURATION STATE
    // -------------------------------------------------------------------------

    const [config, setConfig] = useState<ApinoxConfig | null>(null);
    const [rawConfig, setRawConfig] = useState<string>('');
    const [configPath, setConfigPath] = useState<string | null>(null);
    const [configDir, setConfigDir] = useState<string | null>(null);

    // -------------------------------------------------------------------------
    // ACTIONS
    // -------------------------------------------------------------------------

    /**
     * Toggle between vertical and horizontal layout modes.
     * Saves preference to backend for persistence.
     */
    const toggleLayout = useCallback(() => {
        setLayoutMode(prev => {
            const next = prev === 'vertical' ? 'horizontal' : 'vertical';
            bridge.sendMessage({ command: 'saveUiState', ui: { layoutMode: next } });
            return next;
        });
    }, []);

    /**
     * Toggle line numbers visibility in editors.
     */
    const toggleLineNumbers = useCallback(() => {
        setShowLineNumbers(prev => {
            const next = !prev;
            bridge.sendMessage({ command: 'saveUiState', ui: { showLineNumbers: next } });
            return next;
        });
    }, []);

    /**
     * Open settings modal, optionally on a specific tab.
     */
    const openSettings = useCallback((tab?: string) => {
        setInitialSettingsTab(tab || null);
        setShowSettings(true);
    }, []);

    /**
     * Open help modal, optionally to a specific section.
     */
    const openHelp = useCallback((sectionId?: string) => {
        setHelpSection(sectionId || null);
        setShowHelp(true);
    }, []);

    /**
     * Open debug modal.
     */
    const openDebugModal = useCallback(() => {
        setShowDebugModal(true);
    }, []);

    // -------------------------------------------------------------------------
    // CONTEXT VALUE
    // -------------------------------------------------------------------------

    const value: UIContextValue = {
        // View State - Moved to NavigationContext

        // Layout State
        layoutMode,
        setLayoutMode,
        toggleLayout,
        showLineNumbers,
        setShowLineNumbers,
        toggleLineNumbers,
        inlineElementValues,
        setInlineElementValues,
        hideCausalityData,
        setHideCausalityData,
        splitRatio,
        setSplitRatio,
        isResizing,
        setIsResizing,

        // Modal State
        showSettings,
        setShowSettings,
        initialSettingsTab,
        setInitialSettingsTab,
        openSettings,
        showHelp,
        setShowHelp,
        helpSection,
        setHelpSection,
        openHelp,
        showDevOpsModal,
        setShowDevOpsModal,
        showDebugModal,
        setShowDebugModal,
        openDebugModal,

        // Configuration State
        config,
        setConfig,
        rawConfig,
        setRawConfig,
        configPath,
        setConfigPath,
        configDir,
        setConfigDir
    };

    return (
        <UIContext.Provider value={value}>
            {children}
        </UIContext.Provider>
    );
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * Hook to access UI context.
 * Must be used within a UIProvider.
 * 
 * @throws Error if used outside of UIProvider
 * 
 * @example
 * function Toolbar() {
 *     const { layoutMode, toggleLayout } = useUI();
 *     return <button onClick={toggleLayout}>{layoutMode}</button>;
 * }
 */
export function useUI(): UIContextValue {
    const context = useContext(UIContext);

    if (context === undefined) {
        throw new Error('useUI must be used within a UIProvider');
    }

    return context;
}

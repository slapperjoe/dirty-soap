/**
 * SidebarContext - Composite context for sidebar components
 *
 * Mirrors the SidebarProps interface so that Sidebar (and its sub-components)
 * can access all sidebar state directly from context instead of receiving
 * 120+ props through the component tree.
 *
 * @module SidebarContext
 */

import { createContext, useContext } from 'react';
import type { SidebarView } from '@shared/models';
import type {
    SidebarProjectProps,
    SidebarSelectionProps,
    SidebarTestsProps,
    SidebarWorkflowsProps,
    SidebarPerformanceProps,
    SidebarHistoryProps,
    SidebarUnifiedProps,
} from '../types/props';

export interface SidebarContextValue {
    // ==================== PROP GROUPS (passed to sub-components) ====================
    projectProps: SidebarProjectProps;
    selectionProps: SidebarSelectionProps;
    testsProps: SidebarTestsProps;
    workflowsProps?: SidebarWorkflowsProps;
    performanceProps?: SidebarPerformanceProps;
    historyProps?: SidebarHistoryProps;
    unifiedProps?: SidebarUnifiedProps;

    // ==================== VIEW STATE ====================
    activeView: SidebarView;
    onChangeView: (view: SidebarView) => void;
    sidebarExpanded: boolean;

    // ==================== GLOBAL STATE ====================
    backendConnected: boolean;
    workspaceDirty?: boolean;
    showBackendStatus?: boolean;
    onSaveUiState?: () => void;
    onOpenSettings?: () => void;
    onOpenHelp?: () => void;
    hasUpdate?: boolean;

    // ==================== ENVIRONMENT ====================
    activeEnvironment?: string;
    environments?: Record<string, any>;
    onChangeEnvironment?: (env: string) => void;

    // ==================== MOBILE ====================
    isMobileOpen?: boolean;
    onMobileClose?: () => void;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

/**
 * Custom hook for consuming SidebarContext.
 *
 * @returns SidebarContextValue with all sidebar state and actions
 * @throws Error if used outside a SidebarContext.Provider
 *
 * @example
 * ```typescript
 * function MySidebarComponent() {
 *     const { projectProps, activeView, onChangeView } = useSidebarContext();
 * }
 * ```
 */
export const useSidebarContext = (): SidebarContextValue => {
    const ctx = useContext(SidebarContext);
    if (!ctx) {
        throw new Error('useSidebarContext must be used within a SidebarContext.Provider');
    }
    return ctx;
};

export { SidebarContext };

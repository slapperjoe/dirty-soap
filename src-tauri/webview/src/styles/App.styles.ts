/**
 * App.styles.ts
 * 
 * Styled components extracted from App.tsx for cleaner organization.
 * These are the core layout and menu components used by the main App component.
 */

import styled from 'styled-components';

// =============================================================================
// LAYOUT COMPONENTS
// =============================================================================

/**
 * Main container for the application.
 * Uses VS Code theme variables for consistent appearance.
 */
export const Container = styled.div`
    display: flex;
    height: 100vh;
    width: 100vw;
    overflow: hidden;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
`;

// =============================================================================
// CONTEXT MENU COMPONENTS
// =============================================================================

/**
 * Positioned context menu container.
 * Appears at the specified x/y coordinates.
 */
export const ContextMenu = styled.div<{ top: number, left: number }>`
    position: fixed;
    top: ${props => props.top}px;
    left: ${props => props.left}px;
    background-color: var(--vscode-menu-background);
    color: var(--vscode-menu-foreground);
    border: 1px solid var(--vscode-menu-border);
    box-shadow: 0 2px 8px var(--vscode-widget-shadow);
    z-index: 2000;
    min-width: 150px;
    padding: 4px 0;
`;

/**
 * Individual menu item within a context menu.
 * Highlights on hover using VS Code selection colors.
 */
export const ContextMenuItem = styled.div`
    padding: 6px 12px;
    cursor: pointer;
    &:hover {
        background-color: var(--vscode-menu-selectionBackground);
        color: var(--vscode-menu-selectionForeground);
    }
`;

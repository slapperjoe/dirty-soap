/**
 * SearchDropdown.tsx
 * 
 * Displays search results in a dropdown below the search input.
 * Features:
 * - Grouped results by view (Projects, Explorer, Tests, etc.)
 * - Keyboard navigation (arrow keys, Enter to select, Escape to close)
 * - Click-outside-to-close behavior
 * - Loading and empty states
 */

import React, { useEffect, useRef } from 'react';
import styled from 'styled-components';
import { EmptyState } from './common/EmptyState';
import { SearchResult } from '../utils/workspaceSearch';
import { FileText, Folder, Box, Layers, TestTube, Workflow, Clock } from 'lucide-react';

// =============================================================================
// STYLED COMPONENTS
// =============================================================================

const DropdownContainer = styled.div<{ $isMacOS?: boolean }>`
    position: fixed;
    top: ${props => props.$isMacOS ? '32px' : '32px'}; /* Below titlebar (now 32px) */
    left: 50%;
    transform: translateX(-50%);
    width: 600px;
    max-width: calc(100vw - 120px);
    max-height: 500px;
    background: var(--apinox-dropdown-background, var(--vscode-dropdown-background));
    border: 1px solid var(--apinox-dropdown-border, var(--vscode-dropdown-border));
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    z-index: 1000;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
`;

const ResultsList = styled.div`
    overflow-y: auto;
    flex: 1;
    
    /* Better scrollbar styling */
    &::-webkit-scrollbar {
        width: 4px;
    }
    
    &::-webkit-scrollbar-track {
        background: transparent;
    }
    
    &::-webkit-scrollbar-thumb {
        background: var(--vscode-scrollbarSlider-background);
        border-radius: 5px;
    }
    
    &::-webkit-scrollbar-thumb:hover {
        background: var(--vscode-scrollbarSlider-hoverBackground);
    }
`;

const GroupHeader = styled.div`
    padding: 8px 14px 4px 14px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    user-select: none;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
    opacity: 0.9;
    position: sticky;
    top: 0;
    z-index: 1;
`;

const ResultItem = styled.div<{ $selected: boolean }>`
    padding: 6px 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 12px;
    transition: background-color 0.1s ease, border-left 0.1s ease;
    border-left: 3px solid transparent;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
    
    ${props => props.$selected ? `
        background: var(--vscode-list-activeSelectionBackground, rgba(51, 153, 255, 0.4)) !important;
        color: var(--vscode-list-activeSelectionForeground, #ffffff);
        border-left-color: var(--vscode-focusBorder, #007ACC);
    ` : `
        background: transparent;
        color: var(--vscode-foreground);
    `}

    &:hover {
        background: var(--vscode-list-hoverBackground, rgba(128, 128, 128, 0.2)) !important;
        border-left-color: var(--vscode-focusBorder, #007ACC);
    }
    
    /* Ensure hover works even when selected */
    ${props => props.$selected && `
        &:hover {
            background: var(--vscode-list-activeSelectionBackground, rgba(51, 153, 255, 0.5)) !important;
            filter: brightness(1.1);
        }
    `}
`;

const ResultIcon = styled.div<{ $selected?: boolean }>`
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    opacity: ${props => props.$selected ? 1 : 0.75};
    color: ${props => props.$selected ? 'var(--vscode-list-activeSelectionIconForeground, currentColor)' : 'var(--vscode-symbolIcon-colorForeground, currentColor)'};
    transition: opacity 0.1s ease;

    svg {
        width: 16px;
        height: 16px;
    }
`;

const ResultContent = styled.div`
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
`;

const ResultName = styled.div`
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
    line-height: 1.4;
`;

const ResultBreadcrumb = styled.div`
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    opacity: 0.75;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
    line-height: 1.3;
`;

const LoadingState = styled.div`
    padding: 16px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
    font-size: 13px;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
    opacity: 0.8;
`;

const Footer = styled.div`
    padding: 6px 14px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground);
    background: var(--vscode-sideBar-background);
    border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-family: var(--apinox-ui-font-family, var(--apinox-font-family));
`;

const KeyboardHint = styled.span`
    opacity: 0.65;
    font-size: 10px;
`;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get icon for result type
 */
function getResultIcon(type: string): React.ReactNode {
    switch (type) {
        case 'request':
            return <FileText />;
        case 'operation':
            return <Layers />;
        case 'interface':
            return <Box />;
        case 'folder':
            return <Folder />;
        case 'test-suite':
        case 'test-case':
            return <TestTube />;
        case 'workflow':
            return <Workflow />;
        default:
            return <FileText />;
    }
}

/**
 * Get display name for view
 */
function getViewDisplayName(view: string): string {
    switch (view) {
        case 'projects':
            return 'Projects';
        case 'tests':
            return 'Tests';
        case 'workflows':
            return 'Workflows';
        case 'history':
            return 'History';
        default:
            return view;
    }
}

// =============================================================================
// COMPONENT
// =============================================================================

interface SearchDropdownProps {
    groupedResults: Map<string, SearchResult[]>;
    selectedIndex: number;
    isLoading: boolean;
    onSelectResult: (result: SearchResult) => void;
    onClose: () => void;
    onChangeSelection: (index: number) => void;
    isMacOS?: boolean;
}

export const SearchDropdown: React.FC<SearchDropdownProps> = ({
    groupedResults,
    selectedIndex,
    isLoading,
    onSelectResult,
    onClose,
    onChangeSelection,
    isMacOS = false,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Flatten results for linear navigation
    const flatResults = Array.from(groupedResults.values()).flat();

    // -------------------------------------------------------------------------
    // KEYBOARD NAVIGATION
    // -------------------------------------------------------------------------

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    onChangeSelection(Math.min(selectedIndex + 1, flatResults.length - 1));
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    onChangeSelection(Math.max(selectedIndex - 1, 0));
                    break;
                case 'Enter':
                    e.preventDefault();
                    if (flatResults[selectedIndex]) {
                        onSelectResult(flatResults[selectedIndex]);
                    }
                    break;
                case 'Escape':
                    e.preventDefault();
                    onClose();
                    break;
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [selectedIndex, flatResults, onChangeSelection, onSelectResult, onClose]);

    // -------------------------------------------------------------------------
    // CLICK OUTSIDE TO CLOSE
    // -------------------------------------------------------------------------

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                // Check if click is on search input (don't close if clicking input)
                const target = e.target as HTMLElement;
                if (!target.closest('[data-search-input]')) {
                    onClose();
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    // -------------------------------------------------------------------------
    // RENDER
    // -------------------------------------------------------------------------

    if (isLoading) {
        return (
            <DropdownContainer ref={dropdownRef} $isMacOS={isMacOS}>
                <LoadingState>Searching...</LoadingState>
            </DropdownContainer>
        );
    }

    if (flatResults.length === 0) {
        return (
            <DropdownContainer ref={dropdownRef} $isMacOS={isMacOS}>
                <EmptyState title="No results found" />
            </DropdownContainer>
        );
    }

    let currentIndex = 0;

    return (
        <DropdownContainer ref={dropdownRef} $isMacOS={isMacOS}>
            <ResultsList>
                {Array.from(groupedResults.entries()).map(([view, results]) => (
                    <div key={view}>
                        <GroupHeader>{getViewDisplayName(view)}</GroupHeader>
                        {results.map((result) => {
                            const itemIndex = currentIndex++;
                            return (
                                <ResultItem
                                    key={result.id}
                                    $selected={itemIndex === selectedIndex}
                                    onClick={() => onSelectResult(result)}
                                    onMouseEnter={() => onChangeSelection(itemIndex)}
                                >
                                    <ResultIcon $selected={itemIndex === selectedIndex}>
                                        {getResultIcon(result.type)}
                                    </ResultIcon>
                                    <ResultContent>
                                        <ResultName>{result.name}</ResultName>
                                        <ResultBreadcrumb>{result.breadcrumb}</ResultBreadcrumb>
                                    </ResultContent>
                                </ResultItem>
                            );
                        })}
                    </div>
                ))}
            </ResultsList>
            <Footer>
                <KeyboardHint>↑↓ Navigate • Enter Select • Esc Close</KeyboardHint>
                <span>{flatResults.length} result{flatResults.length !== 1 ? 's' : ''}</span>
            </Footer>
        </DropdownContainer>
    );
};

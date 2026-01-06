/**
 * Settings Tab Types and Shared Components
 * 
 * Shared types, styled components, and interfaces for Settings modal tabs.
 */

import styled from 'styled-components';
import { DirtySoapConfig, ReplaceRule } from '@shared/models';

export type { DirtySoapConfig };
export type ReplaceRuleSettings = ReplaceRule;

// =============================================================================
// TYPES
// =============================================================================



// =============================================================================
// STYLED COMPONENTS
// =============================================================================

export const ScrollableForm = styled.div`
    flex: 1;
    overflow-y: auto;
    padding: 20px;
`;

export const FormGroup = styled.div`
    margin-bottom: 20px;
`;

export const Label = styled.label`
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    font-size: 12px;
`;

export const Input = styled.input`
    width: 100%;
    padding: 6px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    &:focus {
        border-color: var(--vscode-focusBorder);
        outline: none;
    }
`;

export const Select = styled.select`
    width: 100%;
    padding: 6px;
    background: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    &:focus {
        border-color: var(--vscode-focusBorder);
        outline: none;
    }
`;

export const CheckboxLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
`;

export const SectionHeader = styled.h3`
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    text-transform: uppercase;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 4px;
    margin-bottom: 12px;
    margin-top: 20px;
`;

export const EnvList = styled.div`
    display: flex;
    flex-direction: column;
    width: 200px;
    border-right: 1px solid var(--vscode-panel-border);
    overflow-y: auto;
    background: var(--vscode-sideBar-background);
`;

export const EnvItem = styled.div<{ active: boolean, selected: boolean }>`
    padding: 8px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: ${props => props.selected ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.selected ? 'var(--vscode-list-activeSelectionForeground)' : 'var(--vscode-foreground)'};
    &:hover {
        background: ${props => props.selected ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

export const EnvDetail = styled.div`
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 15px;
`;

export const Badge = styled.span`
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 3px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    margin-left: 8px;
`;

export const IconButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

export const PrimaryButton = styled.button`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    &:hover {
        background: var(--vscode-button-hoverBackground);
    }
`;

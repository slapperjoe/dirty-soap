/**
 * WorkspaceLayout.styles.ts
 * 
 * Styled components for the WorkspaceLayout component.
 * Extracted for maintainability and reduced file size.
 */

import styled, { keyframes, css } from 'styled-components';
import { ChevronLeft } from 'lucide-react';



export const Mascot = styled.img`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 100vw;
    height: 100vh;
    object-fit: contain;
    opacity: 0.15;
    pointer-events: none;
    z-index: 0;
    mix-blend-mode: color-burn;
    
    display: none !important; /* DEBUGGING: Forced hidden */
`;

export const EmptyStateImage = styled.img`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 60vw;
    height: 60vh;
    object-fit: contain;
    opacity: 0.12;
    pointer-events: none;
    z-index: 0;
    mix-blend-mode: color-burn;

    display: none !important; /* DEBUGGING: Forced hidden */
`;

export const Content = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
`;

export const DelayTitle = styled.span`
    font-weight: bold;
    margin-left: 10px;
`;

export const DelayContent = styled.div`
    padding: 20px;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

export const DelayField = styled.div`
    margin-top: 20px;
`;

export const DelayLabel = styled.label`
    display: block;
    margin-bottom: 5px;
`;

export const DelayInput = styled.input`
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 5px;
    font-size: 1em;
    width: 100px;
`;

export const WorkspaceBody = styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
`;

export const ToolbarInfo = styled.div`
    display: flex;
    align-items: center;
    flex: 1;
    padding-left: 10px;
    overflow: hidden;
`;

export const UrlInputWrapper = styled.div`
    flex: 1;
    min-width: 150px;
`;

export const VariablesWrapper = styled.div`
    position: relative;
`;

export const VariablesLabel = styled.span`
    margin-left: 5px;
`;

export const VariablesDropdown = styled.div`
    position: absolute;
    top: 100%;
    right: 0;
    margin-top: 5px;
    background: var(--vscode-editor-background);
    border: 1px solid var(--vscode-dropdown-border);
    border-radius: 3px;
    z-index: 100;
    box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    min-width: 250px;
    max-height: 300px;
    overflow: auto;
`;

export const VariablesDropdownHeader = styled.div`
    padding: 8px;
    border-bottom: 1px solid var(--vscode-dropdown-border);
    font-weight: bold;
    font-size: 0.9em;
`;

export const VariablesDropdownEmpty = styled.div`
    padding: 10px;
    opacity: 0.7;
    font-size: 0.9em;
`;

export const VariablesDropdownItem = styled.div`
    padding: 6px 10px;
    cursor: pointer;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
    gap: 2px;

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

export const VariablesDropdownName = styled.div`
    font-weight: bold;
    color: var(--vscode-textLink-foreground);
`;

export const VariablesDropdownSource = styled.div`
    font-size: 0.8em;
    opacity: 0.7;
`;

export const EditorSplitContainer = styled.div<{ $layoutMode: 'vertical' | 'horizontal' }>`
    flex: 1;
    display: flex;
    flex-direction: ${props => props.$layoutMode === 'vertical' ? 'row' : 'column'};
    overflow: hidden;
`;

export const RequestPane = styled.div<{ $hasResponse: boolean; $splitRatio: number }>`
    flex: ${props => props.$hasResponse ? `0 0 ${props.$splitRatio * 100}%` : '1 1 auto'};
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: auto;
    width: auto;
`;

export const BreadcrumbBar = styled.div`
    padding: 10px 15px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
`;

export const BreadcrumbActive = styled.span`
    font-weight: bold;
    color: var(--vscode-foreground);
`;

export const TabsHeader = styled.div`
    padding: 0 10px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 20px;
    flex-shrink: 0;
    height: 35px;
`;

export const TabButton = styled.div<{ $active: boolean }>`
    cursor: pointer;
    border-bottom: ${props => props.$active ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent'};
    padding: 5px 0;
    color: ${props => props.$active ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'};
`;

export const TabMeta = styled.span`
    margin-left: 5px;
    font-size: 0.8em;
`;

export const TabsRight = styled.div`
    margin-left: auto;
    display: flex;
    gap: 5px;
    align-items: center;
    font-size: 0.9em;
`;

export const Divider = styled.div`
    width: 1px;
    height: 16px;
    background: var(--vscode-panel-border);
    margin: 0 5px;
`;

export const StatText = styled.span`
    opacity: 0.8;
`;

export const RequestEditorWrapper = styled.div`
    position: relative;
    flex: 1;
    width: 100%;
    height: 100%;
    overflow: hidden;
`;

export const PanelColumn = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
`;

export const PanelBody = styled.div<{ $padded?: boolean }>`
    flex: 1;
    overflow: hidden;
    padding: ${props => props.$padded ? '10px' : '0'};
`;

export const HeadersViewer = styled.div`
    overflow: auto;
    height: 100%;
    background-color: var(--vscode-editor-background);
`;

export const HeadersTitle = styled.h3`
    margin-top: 0;
    margin-bottom: 10px;
    font-size: 1em;
`;

export const HeadersRow = styled.div`
    display: flex;
    gap: 10px;
    margin-bottom: 5px;
    font-size: 0.9em;
`;

export const HeadersKey = styled.div`
    font-weight: bold;
    min-width: 150px;
    color: var(--vscode-textLink-foreground);
`;

export const HeadersValue = styled.div`
    word-break: break-all;
    font-family: monospace;
`;

export const HeadersEmpty = styled.div`
    font-style: italic;
    opacity: 0.7;
`;

export const ResponseHeadersContainer = styled.div`
    flex: 1;
    border-top: 1px solid var(--vscode-panel-border);
    padding: 10px;
    overflow: auto;
    background-color: var(--vscode-editor-background);
`;

export const SplitResizer = styled.div<{ $layoutMode: 'vertical' | 'horizontal'; $isResizing: boolean }>`
    width: ${props => props.$layoutMode === 'vertical' ? '5px' : '100%'};
    height: ${props => props.$layoutMode === 'horizontal' ? '5px' : '100%'};
    cursor: ${props => props.$layoutMode === 'vertical' ? 'col-resize' : 'row-resize'};
    background-color: ${props => props.$isResizing ? 'var(--vscode-focusBorder)' : 'var(--vscode-widget-shadow)'};
    z-index: 10;
    flex: 0 0 auto;
    transition: background-color 0.2s;
`;

export const ResponseSection = styled.div<{ $layoutMode: 'vertical' | 'horizontal' }>`
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    border-left: ${props => props.$layoutMode === 'vertical' ? '1px solid var(--vscode-panel-border)' : 'none'};
    border-top: ${props => props.$layoutMode === 'horizontal' ? '1px solid var(--vscode-panel-border)' : 'none'};
`;

export const ResponseHeader = styled.div`
    padding: 5px 10px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
`;

export const ResponseHeaderLeft = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

export const ResponseHeaderActions = styled.div`
    display: flex;
    gap: 5px;
`;

export const ResponseStats = styled.div`
    margin-left: auto;
    display: flex;
    gap: 15px;
    align-items: center;
`;

export const ResponseContentType = styled.span`
    opacity: 0.8;
    border-left: 1px solid var(--vscode-panel-border);
    padding-left: 10px;
`;

export const ResponseStatus = styled.span<{ $success: boolean }>`
    color: ${props => props.$success ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'};
    margin-left: 10px;
`;

export const MiniButtonIcon = styled.span`
    display: inline-flex;
    margin-right: 4px;
`;

export const MarkdownContainer = styled.div`
    margin-top: 20px;
    padding-top: 10px;
    border-top: 1px solid var(--vscode-panel-border);

    h1, h2, h3 { border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 5px; margin-top: 1.5em; }
    p { margin-bottom: 1em; }
    ul { padding-left: 20px; }
    code { background: var(--vscode-textCodeBlock-background); padding: 2px 4px; border-radius: 3px; font-family: monospace; }
    pre { background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 5px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
`;

export const Toolbar = styled.div`
    display: flex;
    padding: 5px 10px;
    background-color: var(--vscode-editor-background);
    border-bottom: 1px solid var(--vscode-panel-border);
    align-items: center;
    gap: 10px;
    height: 40px;
`;

/** Read-only info bar for displaying endpoint URL in proxy/watcher view */
export const InfoBar = styled.div`
    display: flex;
    padding: 8px 12px;
    background-color: var(--vscode-editor-inactiveSelectionBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
    align-items: center;
    gap: 12px;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

export const InfoBarMethod = styled.span`
    font-weight: 600;
    color: var(--vscode-badge-foreground);
    background: var(--vscode-badge-background);
    padding: 2px 6px;
    border-radius: 3px;
`;

export const InfoBarUrl = styled.span`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

export const InfoBarUrlPrimary = styled(InfoBarUrl)`
    margin-left: 10px;
    font-size: 1em;
`;

export const ToolbarButton = styled.button`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    border-radius: 2px;
    white-space: nowrap;
    height: 26px;
    box-sizing: border-box;

    &:hover {
        background: var(--vscode-button-hoverBackground);
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    /* Enforce uppercase labels */
    text-transform: uppercase;
    font-size: 11px;
    font-weight: 600;
`;

export const CancelButton = styled(ToolbarButton)`
    background-color: var(--vscode-errorForeground);
`;

export const RunButton = styled(ToolbarButton)`
    background-color: var(--vscode-testing-iconPassed);
    color: var(--vscode-button-foreground);

    &:hover {
        background-color: var(--vscode-testing-iconPassed);
        filter: brightness(0.95);
    }

    &:disabled {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        opacity: 1;
    }
`;

export const MiniToolbarButton = styled(ToolbarButton)`
    font-size: 0.8em;
    padding: 0 8px;
    height: 20px;
`;

export const ToolbarSelect = styled.select`
    background-color: var(--vscode-dropdown-background);
    color: var(--vscode-dropdown-foreground);
    border: 1px solid var(--vscode-dropdown-border);
    padding: 4px;
    outline: none;
    height: 26px;
    box-sizing: border-box;
    font-size: 11px;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

export const ToolbarSeparator = styled.div`
    width: 1px;
    height: 16px;
    background-color: var(--vscode-panel-border);
    margin: 0 4px;
    flex-shrink: 0;
`;

export const MainFooter = styled.div`
    padding: 5px 10px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    gap: 10px;
    justify-content: flex-end;
    background-color: var(--vscode-editor-background);
`;

export const shake = keyframes`
    0% { transform: translateX(0); }
    25% { transform: translateX(2px) rotate(5deg); }
    50% { transform: translateX(-2px) rotate(-5deg); }
    75% { transform: translateX(2px) rotate(5deg); }
    100% { transform: translateX(0); }
`;

export const IconButton = styled.button<{ active?: boolean; shake?: boolean }>`
    background: ${props => props.active ? 'var(--vscode-button-background)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-button-foreground)' : (props.shake ? 'var(--vscode-errorForeground)' : 'var(--vscode-icon-foreground)')};
    border: 1px solid transparent;
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    height: 26px;
    width: 26px;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    ${props => props.shake && css`animation: ${shake} 0.5s ease-in-out infinite;`}

    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-button-hoverBackground)' : 'var(--vscode-toolbar-hoverBackground)'};
    }
    &:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }
`;

export const CompactIconButton = styled(IconButton)`
    width: 24px;
    height: 24px;
    padding: 2px;
`;

export const CompactIconButtonWarning = styled(CompactIconButton)`
    color: var(--vscode-charts-orange);
`;

export const EmptyStateContainer = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: var(--vscode-descriptionForeground);
    padding: 20px;
    text-align: center;
`;

export const EmptyStateTitle = styled.h2`
    margin-bottom: 10px;
    color: var(--vscode-foreground);
`;

export const ProjectContainer = styled.div`
    padding: 40px;
    color: var(--vscode-foreground);
    overflow-y: auto;
    flex: 1;
`;

export const ProjectHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 30px;
`;

export const ProjectName = styled.h1`
    margin: 0;
`;

export const ProjectDescription = styled.p`
    font-size: 1.1em;
    opacity: 0.8;
    margin: 8px 0 0 0;
`;

export const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 20px;
    margin-top: 20px;
`;

export const StatCard = styled.div`
    padding: 20px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
`;

export const StatLabel = styled.div`
    font-size: 0.85em;
    opacity: 0.7;
    margin-bottom: 8px;
`;

export const StatValue = styled.span`
    font-size: 2em;
    font-weight: bold;
`;

export const InterfacesHeading = styled.h2`
    margin-top: 40px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 10px;
`;

export const SectionHeading = styled(InterfacesHeading)`
    margin-top: 40px;
`;

export const InterfacesList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 15px;
`;

export const InterfaceItem = styled.div`
    padding: 15px;
    background: var(--vscode-list-hoverBackground);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

export const InterfaceInfo = styled.div`
    flex: 1;
`;

export const InterfaceName = styled.span`
    font-weight: bold;
    font-size: 1.1em;
`;

export const InterfaceOps = styled.div`
    font-size: 0.8em;
    opacity: 0.7;
    margin-top: 4px;
`;

export const InterfaceDef = styled.div`
    font-size: 0.75em;
    opacity: 0.5;
    margin-top: 4px;
    font-family: monospace;
`;

export const InterfaceContainer = styled(ProjectContainer)``;

export const InfoCard = styled.div`
    margin-top: 20px;
    padding: 20px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
`;

export const InfoGrid = styled.div`
    display: grid;
    gap: 12px;
`;

export const EndpointText = styled.span`
    font-family: monospace;
    font-size: 0.9em;
    word-break: break-all;
`;

export const OperationsHeading = styled.h2`
    margin-top: 30px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 10px;
`;

export const OperationsList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 15px;
`;

export const OperationItem = styled.div`
    padding: 15px;
    background: var(--vscode-list-hoverBackground);
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--vscode-panel-border);
`;

export const OperationRow = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
`;

export const OperationMeta = styled.span`
    margin-left: 8px;
    font-size: 0.85em;
    opacity: 0.6;
`;

export const StatsGridSpaced = styled(StatsGrid)`
    margin-top: 30px;
`;

export const OperationContainer = styled(ProjectContainer)``;

export const RequestsHeading = styled.h2`
    margin-top: 30px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 10px;
`;

export const RequestGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 15px;
    margin-top: 15px;
`;

export const RequestCard = styled(OperationItem)`
    display: flex;
    align-items: center;
    justify-content: space-between;
    `;

export const LinkText = styled.a`
    color: var(--vscode-textLink-foreground);
`;

export const ChevronIcon = styled(ChevronLeft)`
    transform: rotate(180deg);
    opacity: 0.5;
`;

export const ChevronIconFaint = styled(ChevronLeft)`
    transform: rotate(180deg);
    opacity: 0.3;
`;

export const RequestName = styled.span`
    font-weight: 500;
`;

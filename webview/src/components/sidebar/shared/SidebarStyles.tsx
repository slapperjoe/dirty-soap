import styled, { keyframes, css } from 'styled-components';

export const DirtyMarker = styled.span`
    color: var(--vscode-charts-yellow);
    margin-left: 5px;
    font-size: 1.2em;
    line-height: 0.5;
`;

export const SectionHeader = styled.div`
    padding: 5px 10px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    user-select: none;
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

export const SectionTitle = styled.div`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

export const ServiceItem = styled.div`
    padding: 5px 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    &:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
`;

export const OperationItem = styled.div<{ active?: boolean }>`
    padding: 5px 10px;
    padding-left: 20px;
    cursor: pointer;
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
    display: flex;
    align-items: center;
    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

export const RequestItem = styled.div<{ active?: boolean }>`
    padding: 5px 10px;
    padding-left: 45px;
    cursor: pointer;
    font-size: 0.9em;
    background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.active ? 'var(--vscode-list-activeSelectionForeground)' : 'inherit'};
    display: flex;
    align-items: center;
    &:hover {
        background-color: ${props => props.active ? 'var(--vscode-list-activeSelectionBackground)' : 'var(--vscode-list-hoverBackground)'};
    }
`;

export const shake = keyframes`
    0% { transform: translateX(0); }
    25% { transform: translateX(2px) rotate(5deg); }
    50% { transform: translateX(-2px) rotate(-5deg); }
    75% { transform: translateX(2px) rotate(5deg); }
    100% { transform: translateX(0); }
`;

export const HeaderButton = styled.button<{ shake?: boolean }>`
    background: transparent;
    border: none;
    color: var(--vscode-icon-foreground);
    cursor: pointer;
    padding: 2px;
    margin-left: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    ${props => props.shake && css`animation: ${shake} 0.5s ease-in-out;`}
    &:hover {
        background-color: var(--vscode-toolbar-hoverBackground);
        border-radius: 3px;
    }
`;

export const Input = styled.input`
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 4px;
    flex: 1;
    outline: none;
    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

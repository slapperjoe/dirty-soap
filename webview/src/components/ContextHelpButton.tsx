import React from 'react';
import styled from 'styled-components';
import { HelpCircle } from 'lucide-react';
import { useUI } from '../contexts/UIContext';

// Styled similar to existing ToolbarButton but more minimal/ghost
const StyledHelpButton = styled.button`
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 4px;
    transition: color 0.1s;

    &:hover {
        color: var(--vscode-foreground);
        background-color: var(--vscode-toolbar-hoverBackground);
    }
`;

interface ContextHelpButtonProps {
    sectionId: string;
    title?: string;
    style?: React.CSSProperties;
    size?: number;
}

export const ContextHelpButton: React.FC<ContextHelpButtonProps> = ({
    sectionId,
    title = "Help",
    style,
    size = 16
}) => {
    const { openHelp } = useUI();

    return (
        <StyledHelpButton
            onClick={() => openHelp(sectionId)}
            title={title}
            style={style}
        >
            <HelpCircle size={size} />
        </StyledHelpButton>
    );
};

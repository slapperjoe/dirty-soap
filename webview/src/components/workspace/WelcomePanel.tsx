import React from 'react';
import styled from 'styled-components';
import ReactMarkdown from 'react-markdown';
import { Mascot, MarkdownContainer } from '../../styles/WorkspaceLayout.styles';
import titleDark from '../../assets/app-title-dark.jpg';
import titleLight from '../../assets/app-title-light.jpg';

interface WelcomePanelProps {
    changelog?: string;
}

const WelcomeContainer = styled.div`
    padding: 20px;
    flex: 1;
    overflow: auto;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
    position: relative;
`;

export const WelcomePanel: React.FC<WelcomePanelProps> = ({ changelog }) => {
    return (
        <WelcomeContainer>
            <Mascot src={titleDark} className="dark-only" alt="APInox" />
            <Mascot src={titleLight} className="light-only" alt="APInox" />
            <h1>Welcome to APInox</h1>
            <p>Load a WSDL to see available operations.</p>
            {changelog && (
                <MarkdownContainer>
                    <ReactMarkdown>{changelog}</ReactMarkdown>
                </MarkdownContainer>
            )}
        </WelcomeContainer>
    );
};

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Mascot, MarkdownContainer } from '../../styles/WorkspaceLayout.styles';
import mascotImg from '../../assets/mascot.png';

interface WelcomePanelProps {
    changelog?: string;
}

export const WelcomePanel: React.FC<WelcomePanelProps> = ({ changelog }) => {
    return (
        <div style={{ padding: 20, flex: 1, overflow: 'auto', color: 'var(--vscode-editor-foreground)', fontFamily: 'var(--vscode-font-family)', position: 'relative' }}>
            <Mascot src={mascotImg} alt="APInox Mascot" />
            <h1>Welcome to APInox</h1>
            <p>Load a WSDL to see available operations.</p>
            {changelog && (
                <MarkdownContainer>
                    <ReactMarkdown>{changelog}</ReactMarkdown>
                </MarkdownContainer>
            )}
        </div>
    );
};

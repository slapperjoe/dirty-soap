import React from 'react';
import Editor, { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styled from 'styled-components';

loader.config({ monaco });

const ViewerContainer = styled.div`
  height: 100%;
  width: 100%;
  overflow: hidden;
`;

interface MonacoResponseViewerProps {
    value: string;
    language?: string;
    showLineNumbers?: boolean;
}

export const MonacoResponseViewer: React.FC<MonacoResponseViewerProps> = ({
    value,
    language = 'xml',
    showLineNumbers = true
}) => {
    return (
        <ViewerContainer>
            <Editor
                height="100%"
                defaultLanguage={language}
                value={value}
                theme="vs-dark"
                options={{
                    minimap: { enabled: false },
                    fontSize: 14,
                    fontFamily: 'var(--vscode-editor-font-family)',
                    scrollBeyondLastLine: false,
                    readOnly: true,
                    folding: true,
                    automaticLayout: true,
                    lineNumbers: showLineNumbers ? 'on' : 'off',
                    renderLineHighlight: 'none',
                    contextmenu: true,
                }}
            />
        </ViewerContainer>
    );
};

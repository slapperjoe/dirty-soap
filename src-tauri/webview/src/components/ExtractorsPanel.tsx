import React from 'react';
import styled from 'styled-components';
import { Trash2, Pencil } from 'lucide-react';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { RequestExtractor } from '@shared/models';

const Container = styled.div`
    height: 100%;
    overflow: auto;
    padding: 0;
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
`;

const Toolbar = styled.div`
    padding: 10px;
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    justify-content: flex-end;
    gap: 10px;
`;

const ExtractorList = styled.div`
    padding: 10px;
`;

const ExtractorItem = styled.div`
    display: flex;
    padding: 8px;
    border: 1px solid var(--vscode-panel-border);
    background-color: var(--vscode-list-hoverBackground);
    margin-bottom: 8px;
    border-radius: 4px;
    align-items: flex-start;
    gap: 15px;
`;

const ExtractorInfo = styled.div`
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

const InfoRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: baseline;
`;

const Label = styled.span`
    font-weight: bold;
    color: var(--vscode-textLink-foreground);
    min-width: 80px;
    font-size: 0.9em;
`;

const Value = styled.code`
    background: var(--vscode-textCodeBlock-background);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: monospace;
    word-break: break-all;
    font-size: 0.9em;
`;

const IconButton = styled.button`
    background: transparent;
    color: var(--vscode-icon-foreground);
    border: none;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;

    &:hover {
        opacity: 1;
        background-color: var(--vscode-toolbar-hoverBackground);
        border-radius: 3px;
    }
`;

const ButtonGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 4px;
`;

interface ExtractorsPanelProps {
    extractors: RequestExtractor[];
    onChange: (extractors: RequestExtractor[]) => void;
    onEdit?: (extractor: RequestExtractor, index: number) => void;
    rawResponse?: string;
}

export const ExtractorsPanel: React.FC<ExtractorsPanelProps> = ({ extractors, onChange, onEdit, rawResponse }) => {

    const handleDelete = (index: number) => {
        const newExtractors = [...extractors];
        newExtractors.splice(index, 1);
        onChange(newExtractors);
    };

    console.log('[ExtractorsPanel] Rendering. Extractors:', extractors.length, 'RawResponse length:', rawResponse?.length);

    return (
        <Container>
            <Toolbar>
                <span style={{ marginRight: 'auto', fontWeight: 'bold', fontSize: '1.1em' }}>Context Variables extracted from this Step</span>
            </Toolbar>
            <ExtractorList>
                {extractors.length === 0 ? (
                    <div style={{ padding: 20, opacity: 0.7, fontStyle: 'italic', textAlign: 'center' }}>
                        No extractors defined. Select text in the Response panel to create one.
                    </div>
                ) : (
                    extractors.map((ex, index) => {
                        let currentValue: string | null = null;
                        if (rawResponse && ex.source === 'body') {
                            try {
                                currentValue = CustomXPathEvaluator.evaluate(rawResponse, ex.path);
                                console.log(`[ExtractorsPanel] Expr: ${ex.path}, Val: ${currentValue}`);
                            } catch (e) {
                                console.error('[ExtractorsPanel] Evaluation Error:', e);
                                currentValue = "Error evaluating XPath";
                            }
                        }

                        return (
                            <ExtractorItem key={ex.id || index}>
                                <ExtractorInfo>
                                    <InfoRow>
                                        <Label>Variable:</Label>
                                        <Value style={{ color: 'var(--vscode-debugTokenExpression-name)' }}>{ex.variable}</Value>
                                    </InfoRow>
                                    <InfoRow>
                                        <Label>Source:</Label>
                                        <span>{ex.source}</span>
                                    </InfoRow>
                                    <InfoRow>
                                        <Label>Path:</Label>
                                        <Value>{ex.path}</Value>
                                    </InfoRow>
                                    {ex.defaultValue && (
                                        <InfoRow>
                                            <Label style={{ color: 'var(--vscode-editorInfo-foreground)' }}>Default:</Label>
                                            <Value style={{ color: 'var(--vscode-editorInfo-foreground)' }}>{ex.defaultValue}</Value>
                                        </InfoRow>
                                    )}
                                    {currentValue !== null && (
                                        <InfoRow>
                                            <Label style={{ color: 'var(--vscode-testing-iconPassed)' }}>Preview:</Label>
                                            <Value style={{ borderColor: 'var(--vscode-testing-iconPassed)', border: '1px solid transparent', backgroundColor: 'var(--vscode-editor-inactiveSelectionBackground)' }}>
                                                {currentValue || "(No Match)"}
                                            </Value>
                                        </InfoRow>
                                    )}
                                </ExtractorInfo>
                                <ButtonGroup>
                                    {onEdit && (
                                        <IconButton onClick={() => onEdit(ex, index)} title="Edit Extractor">
                                            <Pencil size={16} />
                                        </IconButton>
                                    )}
                                    <IconButton onClick={() => handleDelete(index)} title="Delete Extractor" style={{ color: 'var(--vscode-errorForeground)' }}>
                                        <Trash2 size={16} />
                                    </IconButton>
                                </ButtonGroup>
                            </ExtractorItem>
                        );
                    })
                )}
            </ExtractorList>
        </Container>
    );
};

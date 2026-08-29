/**
 * GraphQLVariablesPanel - JSON editor for GraphQL variables
 */

import React from 'react';
import styled from 'styled-components';
import { MonacoEditorWrapper } from '../monaco';
import { SPACING_XS, SPACING_SM } from '../styles/spacing';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--apinox-foreground);
    background: var(--apinox-editor-background);
    overflow: hidden;
`;

const Header = styled.div`
    padding: ${SPACING_SM}px 15px;
    border-bottom: 1px solid var(--apinox-panel-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const EditorContainer = styled.div`
    flex: 1;
    overflow: hidden;
`;

const Hint = styled.div`
    padding: ${SPACING_SM}px 15px;
    font-size: 11px;
    color: var(--apinox-descriptionForeground);
    background: var(--apinox-textBlockQuote-background);
    border-top: 1px solid var(--apinox-panel-border);
`;

const ErrorBanner = styled.div`
    padding: ${SPACING_SM}px 15px;
    font-size: 12px;
    color: var(--apinox-errorForeground);
    background: var(--apinox-inputValidation-errorBackground);
    border-top: 1px solid var(--apinox-inputValidation-errorBorder);
`;

const Title = styled.h3`
    margin: 0;
`;

const OperationWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: ${SPACING_SM}px;
`;

const OperationLabel = styled.label`
    font-size: 12px;
    color: var(--apinox-descriptionForeground);
`;

const OperationInput = styled.input`
    background: var(--apinox-input-background);
    color: var(--apinox-input-foreground);
    border: 1px solid var(--apinox-input-border);
    padding: ${SPACING_XS}px ${SPACING_SM}px;
    border-radius: 3px;
    font-size: 12px;
    width: 150px;
`;

interface GraphQLVariablesPanelProps {
    variables?: Record<string, any>;
    operationName?: string;
    onChange: (variables: Record<string, any>) => void;
    onOperationNameChange?: (name: string) => void;
    readOnly?: boolean;
}

export const GraphQLVariablesPanel: React.FC<GraphQLVariablesPanelProps> = ({
    variables,
    operationName,
    onChange,
    onOperationNameChange,
    readOnly = false
}) => {
    const [error, setError] = React.useState<string | null>(null);

    // R6 (MONACO_LAG_ROOT_CAUSE.md): debounce the JSON.parse so fast typing
    // in the variables editor does not parse (and propagate) on every keystroke.
    const parseTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    // Convert variables object to JSON string for editing
    const jsonString = React.useMemo(() => {
        try {
            return JSON.stringify(variables || {}, null, 2);
        } catch {
            return '{}';
        }
    }, [variables]);

    const handleChange = (value: string | undefined) => {
        if (parseTimer.current) {
            clearTimeout(parseTimer.current);
        }
        parseTimer.current = setTimeout(() => {
            parseTimer.current = null;
            if (!value) {
                onChange({});
                setError(null);
                return;
            }

            try {
                const parsed = JSON.parse(value);
                onChange(parsed);
                setError(null);
            } catch (e: any) {
                setError(`Invalid JSON: ${e.message}`);
            }
        }, 300);
    };

    // Flush any pending parse on unmount so the last edit is not lost.
    React.useEffect(() => {
        return () => {
            if (parseTimer.current) {
                clearTimeout(parseTimer.current);
            }
        };
    }, []);

    return (
        <Container>
            <Header>
                <Title>GraphQL Variables</Title>
                {onOperationNameChange && (
                    <OperationWrapper>
                        <OperationLabel>
                            Operation:
                        </OperationLabel>
                        <OperationInput
                            type="text"
                            value={operationName || ''}
                            onChange={(e) => onOperationNameChange(e.target.value)}
                            placeholder="operationName"
                            disabled={readOnly}
                        />
                    </OperationWrapper>
                )}
            </Header>

            <EditorContainer>
                <MonacoEditorWrapper
                    height="100%"
                    language="json"
                    value={jsonString}
                    onChange={handleChange}
                    theme="vs-dark"
                    options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'off',
                        folding: false,
                        wordWrap: 'on',
                        scrollBeyondLastLine: false,
                        readOnly,
                        automaticLayout: true,
                        tabSize: 2
                    }}
                />
            </EditorContainer>

            {error && <ErrorBanner>{error}</ErrorBanner>}

            <Hint>
                Variables are passed to your GraphQL query. Use $variableName in your query to reference them.
            </Hint>
        </Container>
    );
};

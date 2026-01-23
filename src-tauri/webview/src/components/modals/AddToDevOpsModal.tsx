/**
 * AddToDevOpsModal.tsx
 * 
 * Modal for adding request/response data as a comment to an Azure DevOps work item.
 */

import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { X, Send, Loader2, Check, AlertCircle, Cloud } from 'lucide-react';
import { bridge } from '../../utils/bridge';

const ModalOverlay = styled.div`
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
`;

const ModalContent = styled.div`
    background: var(--vscode-editor-background);
    color: var(--vscode-editor-foreground);
    width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 6px;
`;

const ModalHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 15px;
    background: var(--vscode-sideBar-background);
    border-bottom: 1px solid var(--vscode-widget-border);
`;

const Title = styled.h2`
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const CloseButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--vscode-icon-foreground);
    display: flex;
    padding: 4px;
    &:hover {
        background: var(--vscode-toolbar-hoverBackground);
        border-radius: 3px;
    }
`;

const ModalBody = styled.div`
    padding: 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
`;

const FormGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const Label = styled.label`
    font-size: 12px;
    font-weight: 500;
`;

const Input = styled.input`
    padding: 8px 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-size: 13px;
    &:focus {
        border-color: var(--vscode-focusBorder);
        outline: none;
    }
`;

const PreviewBox = styled.div`
    background: var(--vscode-textBlockQuote-background);
    border: 1px solid var(--vscode-widget-border);
    border-radius: 4px;
    padding: 12px;
    font-family: monospace;
    font-size: 11px;
    max-height: 200px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-all;
`;

const ModalFooter = styled.div`
    display: flex;
    justify-content: flex-end;
    padding: 12px 15px;
    background: var(--vscode-sideBar-background);
    border-top: 1px solid var(--vscode-widget-border);
    gap: 10px;
`;

const Button = styled.button<{ primary?: boolean }>`
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: ${props => props.primary
        ? 'var(--vscode-button-background)'
        : 'var(--vscode-button-secondaryBackground)'};
    color: ${props => props.primary
        ? 'var(--vscode-button-foreground)'
        : 'var(--vscode-button-secondaryForeground)'};
    &:hover {
        background: ${props => props.primary
        ? 'var(--vscode-button-hoverBackground)'
        : 'var(--vscode-button-secondaryHoverBackground)'};
    }
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const StatusMessage = styled.div<{ success?: boolean }>`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: ${props => props.success
        ? 'var(--vscode-inputValidation-infoBackground)'
        : 'var(--vscode-inputValidation-errorBackground)'};
    color: ${props => props.success
        ? 'var(--vscode-inputValidation-infoForeground)'
        : 'var(--vscode-inputValidation-errorForeground)'};
    border-radius: 4px;
    font-size: 12px;
`;

const Spinner = styled(Loader2)`
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

interface AddToDevOpsModalProps {
    orgUrl: string;
    project: string;
    requestContent: string;
    responseContent?: string;
    requestName?: string;
    onClose: () => void;
}

export const AddToDevOpsModal: React.FC<AddToDevOpsModalProps> = ({
    orgUrl,
    project,
    requestContent,
    responseContent,
    requestName,
    onClose,
}) => {
    const [workItemId, setWorkItemId] = useState('');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

    // Build comment text
    const commentText = `## ${requestName || 'SOAP Request'}\n\n**Request:**\n\`\`\`xml\n${requestContent}\n\`\`\`${responseContent ? `\n\n**Response:**\n\`\`\`xml\n${responseContent}\n\`\`\`` : ''}`;

    // Listen for result
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            const msg = event.data;
            if (msg.command === 'adoAddCommentResult') {
                setLoading(false);
                setResult(msg);
            }
        };
        window.addEventListener('message', handler);
        return () => window.removeEventListener('message', handler);
    }, []);

    const handleSubmit = useCallback(() => {
        const id = parseInt(workItemId, 10);
        if (isNaN(id) || id <= 0) {
            setResult({ success: false, message: 'Please enter a valid Work Item ID' });
            return;
        }

        setLoading(true);
        setResult(null);
        bridge.sendMessage({
            command: 'adoAddComment',
            orgUrl,
            project,
            workItemId: id,
            text: commentText,
        });
    }, [workItemId, orgUrl, project, commentText]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && workItemId && !loading) {
            handleSubmit();
        }
    };

    return (
        <ModalOverlay onClick={onClose}>
            <ModalContent onClick={e => e.stopPropagation()}>
                <ModalHeader>
                    <Title>
                        <Cloud size={16} />
                        Add to Azure DevOps
                    </Title>
                    <CloseButton onClick={onClose}>
                        <X size={16} />
                    </CloseButton>
                </ModalHeader>

                <ModalBody>
                    <FormGroup>
                        <Label>Work Item ID</Label>
                        <Input
                            type="number"
                            value={workItemId}
                            onChange={e => setWorkItemId(e.target.value)}
                            onKeyPress={handleKeyPress}
                            placeholder="Enter work item ID (e.g., 12345)"
                            autoFocus
                        />
                    </FormGroup>

                    <FormGroup>
                        <Label>Comment Preview</Label>
                        <PreviewBox>
                            {commentText.substring(0, 500)}
                            {commentText.length > 500 && '...'}
                        </PreviewBox>
                    </FormGroup>

                    {result && (
                        <StatusMessage success={result.success}>
                            {result.success ? <Check size={14} /> : <AlertCircle size={14} />}
                            {result.message}
                        </StatusMessage>
                    )}
                </ModalBody>

                <ModalFooter>
                    <Button onClick={onClose}>Cancel</Button>
                    <Button
                        primary
                        onClick={handleSubmit}
                        disabled={!workItemId || loading}
                    >
                        {loading ? <Spinner size={14} /> : <Send size={14} />}
                        {loading ? 'Sending...' : 'Add Comment'}
                    </Button>
                </ModalFooter>
            </ModalContent>
        </ModalOverlay>
    );
};

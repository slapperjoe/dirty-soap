/**
 * CreateReplaceRuleModal.tsx
 * 
 * Modal for creating replace rules from selected text in proxy view.
 * Shows XPath (auto-detected), match text (from selection), and allows
 * user to enter replacement text.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Button } from './Modal';
import styled from 'styled-components';

const FormGroup = styled.div`
    margin-bottom: 15px;
`;

const Label = styled.label`
    display: block;
    margin-bottom: 5px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
`;

const Input = styled.input`
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    outline: none;
    box-sizing: border-box;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

const TextArea = styled.textarea`
    width: 100%;
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    outline: none;
    box-sizing: border-box;
    font-family: var(--vscode-editor-font-family);
    font-size: 12px;
    resize: vertical;
    min-height: 60px;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

const XPathDisplay = styled.code`
    display: block;
    padding: 8px;
    background: var(--vscode-textCodeBlock-background);
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 11px;
    word-break: break-all;
    color: var(--vscode-textLink-foreground);
`;

const TargetSelect = styled.select`
    padding: 6px 8px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 2px;
    outline: none;

    &:focus {
        border-color: var(--vscode-focusBorder);
    }
`;

interface CreateReplaceRuleModalProps {
    isOpen: boolean;
    xpath: string;
    matchText: string;
    initialTarget: 'request' | 'response';
    onSave: (rule: {
        name: string;
        xpath: string;
        matchText: string;
        replaceWith: string;
        target: 'request' | 'response' | 'both';
    }) => void;
    onCancel: () => void;
}

export const CreateReplaceRuleModal: React.FC<CreateReplaceRuleModalProps> = ({
    isOpen,
    xpath,
    matchText,
    initialTarget,
    onSave,
    onCancel
}) => {
    const [name, setName] = useState('');
    const [replaceWith, setReplaceWith] = useState('');
    const [target, setTarget] = useState<'request' | 'response' | 'both'>(initialTarget);

    useEffect(() => {
        if (isOpen) {
            setName('');
            setReplaceWith('');
            setTarget(initialTarget);
        }
    }, [isOpen, initialTarget]);

    const handleSave = () => {
        onSave({
            name: name || `Replace in ${target}`,
            xpath,
            matchText,
            replaceWith,
            target
        });
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onCancel}
            title="Create Replace Rule"
            footer={
                <>
                    <Button onClick={onCancel} style={{ marginRight: 8, background: 'transparent', border: '1px solid var(--vscode-button-border)' }}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave}>
                        Create Rule
                    </Button>
                </>
            }
        >
            <FormGroup>
                <Label>Rule Name (optional)</Label>
                <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Mask SSN"
                    autoFocus
                />
            </FormGroup>

            <FormGroup>
                <Label>XPath</Label>
                <XPathDisplay>{xpath}</XPathDisplay>
            </FormGroup>

            <FormGroup>
                <Label>Match Text</Label>
                <TextArea
                    value={matchText}
                    readOnly
                    style={{ background: 'var(--vscode-textCodeBlock-background)' }}
                />
            </FormGroup>

            <FormGroup>
                <Label>Replace With</Label>
                <TextArea
                    value={replaceWith}
                    onChange={(e) => setReplaceWith(e.target.value)}
                    placeholder="Enter replacement text..."
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) handleSave();
                        if (e.key === 'Escape') onCancel();
                    }}
                />
            </FormGroup>

            <FormGroup>
                <Label>Apply To</Label>
                <TargetSelect value={target} onChange={(e) => setTarget(e.target.value as any)}>
                    <option value="request">Request Only</option>
                    <option value="response">Response Only</option>
                    <option value="both">Both Request & Response</option>
                </TargetSelect>
            </FormGroup>
        </Modal>
    );
};

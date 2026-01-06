import React from 'react';
import styled from 'styled-components';
import { Shield, Key, Clock, Hash } from 'lucide-react';
import { WSSecurityConfig, WSSecurityType, PasswordType } from '@shared/models';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 15px;
    gap: 15px;
    overflow-y: auto;
`;

const Section = styled.div`
    display: flex;
    flex-direction: column;
    gap: 10px;
`;

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 0.95em;
    color: var(--vscode-foreground);
    margin-bottom: 5px;
`;

const FormRow = styled.div`
    display: flex;
    gap: 10px;
    align-items: center;
`;

const Label = styled.label`
    min-width: 120px;
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
`;

const Select = styled.select`
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 0.9em;
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
`;

const Input = styled.input`
    flex: 1;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    padding: 6px 10px;
    border-radius: 3px;
    font-size: 0.9em;
    &:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
    width: 16px;
    height: 16px;
    cursor: pointer;
`;

const CheckboxLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 0.9em;
    &:hover {
        color: var(--vscode-textLink-foreground);
    }
`;

const InfoText = styled.div`
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    font-style: italic;
    padding: 10px;
    background: var(--vscode-textBlockQuote-background);
    border-radius: 3px;
`;

interface SecurityPanelProps {
    security: WSSecurityConfig | undefined;
    onChange: (security: WSSecurityConfig | undefined) => void;
}

export const SecurityPanel: React.FC<SecurityPanelProps> = ({ security, onChange }) => {
    const currentType = security?.type || WSSecurityType.None;

    const updateField = <K extends keyof WSSecurityConfig>(field: K, value: WSSecurityConfig[K]) => {
        const current = security || { type: WSSecurityType.None };
        onChange({ ...current, [field]: value });
    };

    const handleTypeChange = (type: WSSecurityType) => {
        if (type === WSSecurityType.None) {
            onChange(undefined);
        } else {
            onChange({
                type,
                username: security?.username || '',
                password: security?.password || '',
                passwordType: security?.passwordType || PasswordType.PasswordDigest,
                hasNonce: security?.hasNonce ?? true,
                hasCreated: security?.hasCreated ?? true
            });
        }
    };

    return (
        <Container>
            <Section>
                <SectionHeader>
                    <Shield size={16} />
                    WS-Security Configuration
                </SectionHeader>

                <FormRow>
                    <Label>Security Type</Label>
                    <Select
                        value={currentType}
                        onChange={(e) => handleTypeChange(e.target.value as WSSecurityType)}
                    >
                        <option value={WSSecurityType.None}>None</option>
                        <option value={WSSecurityType.UsernameToken}>UsernameToken</option>
                        <option value={WSSecurityType.Certificate}>Certificate</option>
                    </Select>
                </FormRow>
            </Section>

            {currentType === WSSecurityType.UsernameToken && (
                <>
                    <Section>
                        <SectionHeader>
                            <Key size={16} />
                            Credentials
                        </SectionHeader>

                        <FormRow>
                            <Label>Username</Label>
                            <Input
                                type="text"
                                value={security?.username || ''}
                                onChange={(e) => updateField('username', e.target.value)}
                                placeholder="Enter username or ${#Env#variable}"
                            />
                        </FormRow>

                        <FormRow>
                            <Label>Password</Label>
                            <Input
                                type="password"
                                value={security?.password || ''}
                                onChange={(e) => updateField('password', e.target.value)}
                                placeholder="Enter password or ${#Env#variable}"
                            />
                        </FormRow>

                        <FormRow>
                            <Label>Password Type</Label>
                            <Select
                                value={security?.passwordType || PasswordType.PasswordDigest}
                                onChange={(e) => updateField('passwordType', e.target.value as PasswordType)}
                            >
                                <option value={PasswordType.PasswordDigest}>PasswordDigest (Recommended)</option>
                                <option value={PasswordType.PasswordText}>PasswordText (Plain)</option>
                            </Select>
                        </FormRow>

                        <InfoText>
                            <strong>PasswordDigest</strong> hashes the password with a nonce and timestamp for security.
                            <strong>PasswordText</strong> sends the password in plain text (use only with HTTPS).
                        </InfoText>
                    </Section>

                    <Section>
                        <SectionHeader>
                            <Clock size={16} />
                            Security Options
                        </SectionHeader>

                        <CheckboxLabel>
                            <Checkbox
                                checked={security?.hasNonce ?? true}
                                onChange={(e) => updateField('hasNonce', e.target.checked)}
                            />
                            <Hash size={14} />
                            Include Nonce (random value to prevent replay attacks)
                        </CheckboxLabel>

                        <CheckboxLabel>
                            <Checkbox
                                checked={security?.hasCreated ?? true}
                                onChange={(e) => updateField('hasCreated', e.target.checked)}
                            />
                            <Clock size={14} />
                            Include Timestamp (message creation time)
                        </CheckboxLabel>

                        <InfoText>
                            Most WS-Security endpoints require both Nonce and Timestamp.
                            These are generated fresh for each request to prevent replay attacks.
                        </InfoText>
                    </Section>
                </>
            )}

            {currentType === WSSecurityType.Certificate && (
                <Section>
                    <SectionHeader>
                        <Key size={16} />
                        Certificate Details
                    </SectionHeader>

                    <FormRow>
                        <Label>Private Key Path</Label>
                        <Input
                            type="text"
                            value={security?.privateKeyPath || ''}
                            onChange={(e) => updateField('privateKeyPath', e.target.value)}
                            placeholder="Absolute path to .pem or .key file"
                        />
                    </FormRow>

                    <FormRow>
                        <Label>Public Cert Path</Label>
                        <Input
                            type="text"
                            value={security?.publicCertPath || ''}
                            onChange={(e) => updateField('publicCertPath', e.target.value)}
                            placeholder="Absolute path to .pem or .crt file"
                        />
                    </FormRow>

                    <FormRow>
                        <Label>Private Key Password</Label>
                        <Input
                            type="password"
                            value={security?.password || ''}
                            onChange={(e) => updateField('password', e.target.value)}
                            placeholder="Password for private key (if encrypted)"
                        />
                    </FormRow>

                    <InfoText>
                        <strong>Note:</strong> Files must be accessible by the extension.
                        Paths support environment variables (e.g. <code>{'${#Env#cert_path}'}</code>).
                    </InfoText>
                </Section>
            )}

            {currentType === WSSecurityType.None && (
                <InfoText>
                    No WS-Security will be applied to requests.
                    Select "UsernameToken" or "Certificate" to add authentication.
                </InfoText>
            )}
        </Container>
    );
};

/**
 * RequestTypeSelector - Unified component for selecting request type, method, and content type
 * Consolidates all protocol-specific options into one component
 */

import React from 'react';
import styled from 'styled-components';
import type { RequestType, BodyType, HttpMethod } from '../types';

const Select = styled.select`
    background: var(--apinox-input-background);
    color: var(--apinox-input-foreground);
    border: 1px solid var(--apinox-input-border);
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;

    &:focus {
        outline: 1px solid var(--apinox-focusBorder);
    }

    &:disabled {
        background: var(--apinox-button-secondaryBackground);
        color: var(--apinox-button-secondaryForeground);
        border-color: var(--apinox-button-secondaryHoverBackground);
        cursor: not-allowed;
    }
`;

const Label = styled.span`
    font-size: 10px;
    color: var(--apinox-descriptionForeground);
    text-transform: uppercase;
    font-weight: 500;
`;

const MethodSelect = styled.select<{ $method: string }>`
    background: ${props => {
        switch (props.$method) {
            case 'GET': return 'var(--apinox-charts-green)';
            case 'POST': return 'var(--apinox-charts-blue)';
            case 'PUT': return 'var(--apinox-charts-orange)';
            case 'PATCH': return 'var(--apinox-charts-yellow)';
            case 'DELETE': return 'var(--apinox-charts-red)';
            default: return 'var(--apinox-input-background)';
        }
    }};
    color: ${props => {
        // Use white/light text for colored backgrounds for better contrast
        switch (props.$method) {
            case 'GET':
            case 'POST':
            case 'PUT':
            case 'PATCH':
            case 'DELETE':
                return '#ffffff';
            default:
                return 'var(--apinox-foreground)';
        }
    }};
    border: none;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    min-width: 70px;
    text-align: center;

    &:focus {
        outline: 1px solid var(--apinox-focusBorder);
    }

    &:disabled {
        background: var(--apinox-button-secondaryBackground);
        color: var(--apinox-button-secondaryForeground);
        border: 1px solid var(--apinox-button-secondaryHoverBackground);
        cursor: not-allowed;
    }
    
    /* Style dropdown options */
    option {
        background: var(--apinox-dropdown-background);
        color: var(--apinox-dropdown-foreground);
    }
`;

interface RequestTypeSelectorProps {
    requestType?: RequestType;
    bodyType?: BodyType;
    method?: HttpMethod | string;
    /** Effective Content-Type for display (callers must pass the *resolved* value, never a bare request.contentType — see SOAP_INTERFACE_CONTENT_TYPE_SPEC.md §5.3). Pass '' for "SOAP default (no explicit request value)". */
    contentType?: string;
    /** The interface-level (project) Content-Type override; when set, its value is shown as "override: X" in the dropdown. */
    interfaceOverride?: string;
    /** The SOAP-version default (e.g. 'text/xml; charset=utf-8') — label for the "SOAP default" option. */
    soapDefaultLabel?: string;
    onRequestTypeChange: (type: RequestType) => void;
    onBodyTypeChange: (type: BodyType) => void;
    onMethodChange: (method: HttpMethod | string) => void;
    onContentTypeChange?: (contentType: string) => void;
    readOnly?: boolean;
    compact?: boolean; // For toolbar mode
}

export const RequestTypeSelector: React.FC<RequestTypeSelectorProps> = ({
    requestType = 'soap',
    bodyType,
    method = 'POST',
    contentType = '',
    interfaceOverride,
    soapDefaultLabel,
    onRequestTypeChange,
    onBodyTypeChange,
    onMethodChange,
    onContentTypeChange,
    readOnly = false,
    compact = false
}) => {
    const httpMethods: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const soapMethods = ['POST', 'GET'];

    const bodyTypes: { value: BodyType; label: string }[] = [
        { value: 'json', label: 'JSON' },
        { value: 'xml', label: 'XML' },
        { value: 'graphql', label: 'GraphQL' },
        { value: 'text', label: 'Text' },
        { value: 'form-data', label: 'Form' },
        { value: 'none', label: 'None' }
    ];

    const soapContentTypes = [
        { value: 'application/soap+xml', label: 'application/soap+xml' },
        { value: 'text/xml', label: 'text/xml' },
        { value: 'application/xml', label: 'application/xml' }
    ];

    // Default body type based on request type
    const effectiveBodyType = bodyType || (
        requestType === 'graphql' ? 'graphql' :
            requestType === 'rest' ? 'json' :
                'xml'
    );

    const effectiveMethod = method || (requestType === 'soap' ? 'POST' : 'GET');
    const methodList = requestType === 'soap' ? soapMethods : httpMethods;

    return (
        <>
            {/* Request Type */}
            {!compact && <Label>Type</Label>}
            <Select
                value={requestType}
                onChange={(e) => onRequestTypeChange(e.target.value as RequestType)}
                disabled={readOnly}
                title="Request Type"
                style={{ minWidth: compact ? 60 : 70 }}
            >
                <option value="soap">SOAP</option>
                <option value="rest">REST</option>
                <option value="graphql">GraphQL</option>
            </Select>

            {/* Method - shown for all types except GraphQL (always POST) */}
            {requestType !== 'graphql' && (
                <MethodSelect
                    $method={effectiveMethod}
                    value={effectiveMethod}
                    onChange={(e) => onMethodChange(e.target.value as HttpMethod)}
                    disabled={readOnly}
                    title="HTTP Method"
                >
                    {methodList.map(m => (
                        <option key={m} value={m}>{m}</option>
                    ))}
                </MethodSelect>
            )}

            {/* Content Type - for SOAP only */}
            {requestType === 'soap' && onContentTypeChange && (
                <Select
                    value={contentType}
                    onChange={(e) => onContentTypeChange(e.target.value)}
                    disabled={readOnly}
                    title="Content Type"
                >
                    <option value="">SOAP default {soapDefaultLabel ? `(${soapDefaultLabel})` : ''}{interfaceOverride ? ` — override: ${interfaceOverride}` : ''}</option>
                    {soapContentTypes.map(ct => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                    ))}
                </Select>
            )}

            {/* Body Type - for REST only */}
            {requestType === 'rest' && (
                <>
                    {!compact && <Label>Body</Label>}
                    <Select
                        value={effectiveBodyType}
                        onChange={(e) => onBodyTypeChange(e.target.value as BodyType)}
                        disabled={readOnly}
                        title="Body Type"
                        style={{ minWidth: compact ? 50 : 70 }}
                    >
                        {bodyTypes.map(bt => (
                            <option key={bt.value} value={bt.value}>{bt.label}</option>
                        ))}
                    </Select>
                </>
            )}
        </>
    );
};

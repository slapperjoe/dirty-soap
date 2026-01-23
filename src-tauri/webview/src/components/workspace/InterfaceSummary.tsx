import React from 'react';
import { ContextHelpButton } from '../ContextHelpButton';
import {
    InterfaceContainer, InfoCard, InfoGrid, LinkText, EndpointText,
    OperationsHeading, OperationsList, OperationItem, OperationRow,
    OperationMeta, ChevronIconFaint
} from '../../styles/WorkspaceLayout.styles';

export const InterfaceSummary: React.FC<{ interface: import('@shared/models').ApiInterface; onSelectOperation?: (o: import('@shared/models').ApiOperation) => void }> = ({ interface: iface, onSelectOperation }) => {
    // Get endpoint from first operation if available
    const firstEndpoint = iface.operations[0]?.requests[0]?.endpoint;

    return (
        <InterfaceContainer>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Interface: {iface.name}</h1>
                <ContextHelpButton sectionId="interface" />
            </div>
            <InfoCard>
                <InfoGrid>
                    <div><strong>WSDL:</strong> <LinkText href="#">{iface.definition}</LinkText></div>
                    <div><strong>SOAP Version:</strong> {iface.soapVersion}</div>
                    {iface.bindingName && <div><strong>Binding:</strong> {iface.bindingName}</div>}
                    {firstEndpoint && <div><strong>Endpoint:</strong> <EndpointText>{firstEndpoint}</EndpointText></div>}
                    <div><strong>Operations:</strong> {iface.operations.length}</div>
                </InfoGrid>
            </InfoCard>
            <OperationsHeading>Operations</OperationsHeading>
            <OperationsList>
                {iface.operations.map(op => (
                    <OperationItem
                        key={op.name}
                        onClick={() => onSelectOperation && onSelectOperation(op)}
                    >
                        <OperationRow>
                            <div>
                                <strong>{op.name}</strong>
                                <OperationMeta>({op.requests.length} request{op.requests.length !== 1 ? 's' : ''})</OperationMeta>
                            </div>
                            <ChevronIconFaint size={14} />
                        </OperationRow>
                    </OperationItem>
                ))}
            </OperationsList>
        </InterfaceContainer>
    );
};

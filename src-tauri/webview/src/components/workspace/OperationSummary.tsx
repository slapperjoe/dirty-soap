import React from 'react';
import styled from 'styled-components';
import { Play, Activity, List, ChevronRight, Zap } from 'lucide-react';
import { ContextHelpButton } from '../ContextHelpButton';
import { OperationContainer } from '../../styles/WorkspaceLayout.styles';

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-lg);
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: var(--space-md);
`;

const TitleGroup = styled.div`
    display: flex;
    align-items: center;
    gap: var(--space-sm);
`;

const Title = styled.h1`
    margin: 0;
    font-size: 1.5em;
    font-weight: 600;
`;

const ActionButton = styled.button`
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    padding: 6px 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    border-radius: 2px;
    font-size: 0.9em;

    &:hover {
        background: var(--vscode-button-hoverBackground);
    }
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--space-md);
    margin-bottom: var(--space-xl);
`;

const StatCard = styled.div`
    background: var(--vscode-editor-inactiveSelectionBackground);
    padding: var(--space-md);
    border-radius: 4px;
    border: 1px solid var(--vscode-widget-border);
`;

const StatLabel = styled.div`
    font-size: 0.8em;
    opacity: 0.7;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 6px;
`;

const StatValue = styled.div`
    font-size: 1.4em;
    font-weight: bold;
`;

const RequestsSection = styled.div`
    margin-top: var(--space-lg);
`;

const SectionHeader = styled.h3`
    margin: 0 0 var(--space-md) 0;
    font-size: 1.1em;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const RequestCard = styled.div`
    display: flex;
    align-items: center;
    padding: var(--space-sm) var(--space-md);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    margin-bottom: 8px;
    cursor: pointer;
    background: var(--vscode-list-hoverBackground);
    transition: all 0.2s ease;

    &:hover {
        background: var(--vscode-list-activeSelectionBackground);
        border-color: var(--vscode-focusBorder);
        transform: translateX(2px);
    }
`;

const MethodBadge = styled.span`
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.75em;
    font-weight: bold;
    margin-right: var(--space-md);
    min-width: 40px;
    text-align: center;
`;

const RequestInfo = styled.div`
    flex: 1;
`;

const RequestName = styled.div`
    font-weight: 500;
`;

const RequestMeta = styled.div`
    font-size: 0.8em;
    opacity: 0.6;
    margin-top: 2px;
`;

export const OperationSummary: React.FC<{ operation: import('@shared/models').ApiOperation; onSelectRequest?: (r: import('@shared/models').ApiRequest) => void }> = ({ operation, onSelectRequest }) => {

    // Derived stats
    const totalRequests = operation.requests.length;

    return (
        <OperationContainer>
            <Header>
                <TitleGroup>
                    <Title>{operation.name}</Title>
                    <ContextHelpButton sectionId="operation" />
                </TitleGroup>
                <ActionButton onClick={() => console.log('Run all requests (stub)')}>
                    <Play size={14} /> Run All
                </ActionButton>
            </Header>

            <StatsGrid>
                <StatCard>
                    <StatLabel><List size={14} /> Total Requests</StatLabel>
                    <StatValue>{totalRequests}</StatValue>
                </StatCard>
                <StatCard>
                    <StatLabel><Activity size={14} /> Activity Status</StatLabel>
                    <StatValue style={{ color: 'var(--vscode-charts-green)', fontSize: '1.2em' }}>Active</StatValue>
                </StatCard>
                {/* Placeholder for future specific stats */}
                <StatCard>
                    <StatLabel><Zap size={14} /> Performance</StatLabel>
                    <StatValue style={{ fontSize: '1em', opacity: 0.5 }}>Not measured</StatValue>
                </StatCard>
            </StatsGrid>

            <RequestsSection>
                <SectionHeader>
                    <List size={16} /> Requests ({totalRequests})
                </SectionHeader>

                {operation.requests.map(req => (
                    <RequestCard
                        key={req.id}
                        onClick={() => onSelectRequest && onSelectRequest(req)}
                    >
                        <MethodBadge>SOAP</MethodBadge>
                        <RequestInfo>
                            <RequestName>{req.name}</RequestName>
                            <RequestMeta>{operation.action || 'No SOAP Action'}</RequestMeta>
                        </RequestInfo>
                        <ChevronRight size={16} style={{ opacity: 0.5 }} />
                    </RequestCard>
                ))}

                {operation.requests.length === 0 && (
                    <div style={{ opacity: 0.6, fontStyle: 'italic', padding: 20, textAlign: 'center' }}>
                        No requests defined for this operation.
                    </div>
                )}
            </RequestsSection>
        </OperationContainer>
    );
};

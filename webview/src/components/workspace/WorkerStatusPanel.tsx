import React from 'react';
import styled from 'styled-components';
import { Users, Server, Cpu, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { CoordinatorStatus } from '@shared/models';
import { EmptyState } from '../common/EmptyState';

const Container = styled.div`
    /* No outer styling - panel is now embedded in a Section */
`;

const WorkerList = styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
`;

const WorkerCard = styled.div<{ status: string }>`
    display: flex;
    align-items: center;
    padding: 10px 12px;
    background: var(--vscode-list-hoverBackground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    gap: 12px;
    border-left: 3px solid ${props => {
        switch (props.status) {
            case 'connected':
            case 'idle': return 'var(--vscode-testing-iconPassed)';
            case 'working': return 'var(--vscode-charts-blue)';
            case 'disconnected': return 'var(--vscode-testing-iconFailed)';
            default: return 'var(--vscode-panel-border)';
        }
    }};
`;

const WorkerIcon = styled.div<{ status: string }>`
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${props => {
        switch (props.status) {
            case 'connected':
            case 'idle': return 'var(--vscode-testing-iconPassed)';
            case 'working': return 'var(--vscode-charts-blue)';
            case 'disconnected': return 'var(--vscode-testing-iconFailed)';
            default: return 'var(--vscode-badge-background)';
        }
    }};
    color: white;
`;

const WorkerInfo = styled.div`
    flex: 1;
`;

const WorkerName = styled.div`
    font-weight: 500;
    font-size: 0.95em;
`;

const WorkerMeta = styled.div`
    font-size: 0.8em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    gap: 12px;
    margin-top: 3px;
`;

const StatusBadge = styled.span<{ status: string }>`
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.75em;
    font-weight: 500;
    text-transform: uppercase;
    background: ${props => {
        switch (props.status) {
            case 'connected':
            case 'idle': return 'var(--vscode-testing-iconPassed)';
            case 'working': return 'var(--vscode-charts-blue)';
            case 'disconnected': return 'var(--vscode-testing-iconFailed)';
            default: return 'var(--vscode-badge-background)';
        }
    }};
    color: white;
`;

const EmptyCode = styled.div`
    font-size: 0.85em;
    margin-top: 5px;
`;

interface WorkerStatusPanelProps {
    status: CoordinatorStatus;
}

export const WorkerStatusPanel: React.FC<WorkerStatusPanelProps> = ({
    status
}) => {
    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    const getStatusIcon = (workerStatus: string) => {
        switch (workerStatus) {
            case 'connected':
            case 'idle': return <CheckCircle size={16} />;
            case 'working': return <Loader size={16} />;
            case 'disconnected': return <AlertCircle size={16} />;
            default: return <Server size={16} />;
        }
    };

    return (
        <Container>
            <WorkerList>
                {status.workers.length === 0 ? (
                    status.running ? (
                        <EmptyState
                            icon={Users}
                            title="Waiting for workers to connect..."
                            description="Run a worker to connect to the coordinator."
                        >
                            <EmptyCode>
                                Run: <code>npx dirty-soap worker --connect ws://localhost:{status.port}</code>
                            </EmptyCode>
                        </EmptyState>
                    ) : (
                        <EmptyState
                            icon={Users}
                            title="No workers connected"
                            description="Start the coordinator to accept worker connections."
                        />
                    )
                ) : (
                    status.workers.map(worker => (
                        <WorkerCard key={worker.id} status={worker.status}>
                            <WorkerIcon status={worker.status}>
                                {getStatusIcon(worker.status)}
                            </WorkerIcon>
                            <WorkerInfo>
                                <WorkerName>{worker.id}</WorkerName>
                                <WorkerMeta>
                                    {worker.platform && (
                                        <span><Cpu size={12} /> {worker.platform}</span>
                                    )}
                                    {worker.nodeVersion && (
                                        <span>Node {worker.nodeVersion}</span>
                                    )}
                                    <span><Clock size={12} /> {formatTime(worker.connectedAt)}</span>
                                    {worker.assignedIterations && (
                                        <span>Iterations {worker.assignedIterations.start}-{worker.assignedIterations.end}</span>
                                    )}
                                </WorkerMeta>
                            </WorkerInfo>
                            <StatusBadge status={worker.status}>
                                {worker.status}
                            </StatusBadge>
                        </WorkerCard>
                    ))
                )}
            </WorkerList>
        </Container>
    );
};

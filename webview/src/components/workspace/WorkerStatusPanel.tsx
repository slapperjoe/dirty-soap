import React from 'react';
import styled from 'styled-components';
import { Users, Play, Square, Server, Cpu, Clock, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { CoordinatorStatus } from '../../models';

const Container = styled.div`
    /* No outer styling - panel is now embedded in a Section */
`;



const Controls = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const Input = styled.input`
    width: 70px;
    padding: 4px 8px;
    border: 1px solid var(--vscode-input-border);
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border-radius: 3px;
    font-size: 0.9em;
`;

const Label = styled.label`
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    align-items: center;
    gap: 5px;
`;

const Button = styled.button<{ variant?: 'primary' | 'danger' }>`
    padding: 5px 12px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 0.85em;
    background: ${props => props.variant === 'danger'
        ? 'var(--vscode-testing-iconFailed)'
        : 'var(--vscode-button-background)'};
    color: ${props => props.variant === 'danger'
        ? '#fff'
        : 'var(--vscode-button-foreground)'};
    
    &:hover {
        opacity: 0.9;
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
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

const EmptyState = styled.div`
    text-align: center;
    padding: 30px 20px;
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
`;



interface WorkerStatusPanelProps {
    status: CoordinatorStatus;
    onStart: (port: number, expectedWorkers: number) => void;
    onStop: () => void;
}

export const WorkerStatusPanel: React.FC<WorkerStatusPanelProps> = ({
    status,
    onStart,
    onStop
}) => {
    const [port, setPort] = React.useState(status.port || 8765);
    const [expectedWorkers, setExpectedWorkers] = React.useState(status.expectedWorkers || 1);

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
            {/* Controls for starting/stopping coordinator */}
            <Controls style={{ marginBottom: 15 }}>
                {!status.running ? (
                    <>
                        <Label>
                            Port:
                            <Input
                                type="number"
                                value={port}
                                onChange={e => setPort(parseInt(e.target.value) || 8765)}
                                min={1024}
                                max={65535}
                            />
                        </Label>
                        <Label>
                            Expected:
                            <Input
                                type="number"
                                value={expectedWorkers}
                                onChange={e => setExpectedWorkers(parseInt(e.target.value) || 1)}
                                min={1}
                                max={100}
                            />
                        </Label>
                        <Button onClick={() => onStart(port, expectedWorkers)}>
                            <Play size={14} /> Start Coordinator
                        </Button>
                    </>
                ) : (
                    <>
                        <Label>
                            <Server size={14} />
                            ws://localhost:{status.port}
                        </Label>
                        <Label>
                            {status.workers.length}/{status.expectedWorkers} connected
                        </Label>
                        <Button variant="danger" onClick={onStop}>
                            <Square size={14} /> Stop
                        </Button>
                    </>
                )}
            </Controls>

            <WorkerList>
                {status.workers.length === 0 ? (
                    <EmptyState>
                        {status.running ? (
                            <>
                                <Users size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
                                <div>Waiting for workers to connect...</div>
                                <div style={{ fontSize: '0.85em', marginTop: 5 }}>
                                    Run: <code>npx dirty-soap worker --connect ws://localhost:{status.port}</code>
                                </div>
                            </>
                        ) : (
                            <>
                                <Users size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
                                <div>Start the coordinator to accept worker connections</div>
                            </>
                        )}
                    </EmptyState>
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

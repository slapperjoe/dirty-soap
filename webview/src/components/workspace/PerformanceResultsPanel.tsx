import React from 'react';
import styled from 'styled-components';
import { Clock, AlertTriangle, CheckCircle, XCircle, BarChart3, Activity, Download, FileText } from 'lucide-react';
import { PerformanceRun, PerformanceStats } from '../../models';
import { ResponseTimeChart, statsToChartData } from './ResponseTimeChart';
import { generateMarkdownReport, downloadMarkdownReport } from '../../utils/reportGenerator';

const Container = styled.div`
    padding: 20px;
    height: 100%;
    overflow-y: auto;
    color: var(--vscode-editor-foreground);
    font-family: var(--vscode-font-family);
`;

const Section = styled.div`
    margin-bottom: 25px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    padding: 15px;
    border: 1px solid var(--vscode-widget-border);
`;

const SectionHeader = styled.h3`
    margin: 0 0 15px 0;
    font-size: 1.1em;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid var(--vscode-panel-border);
    padding-bottom: 8px;
`;

const StatsGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 15px;
`;

const StatCard = styled.div<{ variant?: 'success' | 'warning' | 'error' }>`
    background: var(--vscode-input-background);
    border-radius: 6px;
    padding: 12px;
    text-align: center;
    border-left: 3px solid ${props => {
        if (props.variant === 'success') return 'var(--vscode-testing-iconPassed)';
        if (props.variant === 'warning') return 'var(--vscode-charts-orange)';
        if (props.variant === 'error') return 'var(--vscode-testing-iconFailed)';
        return 'var(--vscode-textLink-foreground)';
    }};
`;

const StatValue = styled.div`
    font-size: 1.5em;
    font-weight: bold;
    margin-bottom: 4px;
`;

const StatLabel = styled.div`
    font-size: 0.85em;
    opacity: 0.7;
`;

const ProgressContainer = styled.div`
    margin-bottom: 20px;
`;

const ProgressBar = styled.div`
    height: 8px;
    background: var(--vscode-input-background);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
`;

const ProgressFill = styled.div<{ percent: number }>`
    height: 100%;
    width: ${props => props.percent}%;
    background: var(--vscode-textLink-foreground);
    transition: width 0.3s ease;
`;

const ProgressText = styled.div`
    font-size: 0.9em;
    display: flex;
    justify-content: space-between;
    opacity: 0.8;
`;

const HistoryItem = styled.div<{ status: string }>`
    display: flex;
    align-items: center;
    padding: 10px;
    background: var(--vscode-list-hoverBackground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    gap: 12px;
    margin-bottom: 8px;
    border-left: 3px solid ${props => {
        if (props.status === 'completed') return 'var(--vscode-testing-iconPassed)';
        if (props.status === 'aborted') return 'var(--vscode-charts-orange)';
        return 'var(--vscode-testing-iconFailed)';
    }};
`;

const ChartContainer = styled.div`
    margin-top: 20px;
`;

const ChartTitle = styled.div`
    font-size: 0.9em;
    font-weight: 600;
    margin-bottom: 10px;
    opacity: 0.8;
`;

const BarContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 6px;
`;

const BarRow = styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
`;

const BarLabel = styled.div`
    width: 80px;
    font-size: 0.85em;
    text-align: right;
    opacity: 0.7;
`;

const BarTrack = styled.div`
    flex: 1;
    height: 12px;
    background: var(--vscode-input-background);
    border-radius: 4px;
    overflow: hidden;
`;

const BarFill = styled.div<{ width: number; color?: string }>`
    height: 100%;
    width: ${props => props.width}%;
    background: ${props => props.color || 'var(--vscode-textLink-foreground)'};
    border-radius: 4px;
    transition: width 0.3s ease;
`;

const BarValue = styled.div`
    width: 60px;
    font-size: 0.85em;
    font-weight: 500;
`;

interface PerformanceResultsPanelProps {
    runs: PerformanceRun[];
    currentProgress?: { iteration: number; total: number } | null;
    isRunning: boolean;
    onExport?: (runId: string) => void;
}

export const PerformanceResultsPanel: React.FC<PerformanceResultsPanelProps> = ({
    runs,
    currentProgress,
    isRunning,
    onExport
}) => {
    const latestRun = runs.length > 0 ? runs[runs.length - 1] : null;

    const formatDuration = (ms: number) => {
        if (ms < 1000) return `${ms.toFixed(0)}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const formatTime = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const renderStats = (stats: PerformanceStats) => (
        <StatsGrid>
            <StatCard>
                <StatValue>{stats.totalRequests}</StatValue>
                <StatLabel>Total Requests</StatLabel>
            </StatCard>
            <StatCard variant={stats.successRate >= 0.95 ? 'success' : stats.successRate >= 0.8 ? 'warning' : 'error'}>
                <StatValue>{(stats.successRate * 100).toFixed(1)}%</StatValue>
                <StatLabel>Success Rate</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.avgResponseTime)}</StatValue>
                <StatLabel>Avg Response</StatLabel>
            </StatCard>
            <StatCard variant={stats.slaBreachCount === 0 ? 'success' : 'warning'}>
                <StatValue>{stats.slaBreachCount}</StatValue>
                <StatLabel>SLA Breaches</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.minResponseTime)}</StatValue>
                <StatLabel>Min Response</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.maxResponseTime)}</StatValue>
                <StatLabel>Max Response</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.p50)}</StatValue>
                <StatLabel>p50 (Median)</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.p95)}</StatValue>
                <StatLabel>p95</StatLabel>
            </StatCard>
            <StatCard>
                <StatValue>{formatDuration(stats.p99)}</StatValue>
                <StatLabel>p99</StatLabel>
            </StatCard>
        </StatsGrid>
    );

    return (
        <Container>
            {/* Progress Section */}
            {isRunning && currentProgress && (
                <Section>
                    <SectionHeader>
                        <Activity size={16} /> Running...
                    </SectionHeader>
                    <ProgressContainer>
                        <ProgressBar>
                            <ProgressFill percent={(currentProgress.iteration / currentProgress.total) * 100} />
                        </ProgressBar>
                        <ProgressText>
                            <span>Iteration {currentProgress.iteration} of {currentProgress.total}</span>
                            <span>{Math.round((currentProgress.iteration / currentProgress.total) * 100)}%</span>
                        </ProgressText>
                    </ProgressContainer>
                </Section>
            )}

            {/* Latest Run Stats */}
            {latestRun && (
                <Section>
                    <SectionHeader>
                        <BarChart3 size={16} /> Latest Run: {latestRun.suiteName}
                        {latestRun.status === 'completed' && <CheckCircle size={14} color="var(--vscode-testing-iconPassed)" />}
                        {latestRun.status === 'aborted' && <AlertTriangle size={14} color="var(--vscode-charts-orange)" />}
                        {latestRun.status === 'failed' && <XCircle size={14} color="var(--vscode-testing-iconFailed)" />}
                    </SectionHeader>
                    <div style={{ marginBottom: 15, fontSize: '0.9em', opacity: 0.7, display: 'flex', gap: 15 }}>
                        <span><Clock size={12} /> {formatTime(latestRun.startTime)}</span>
                        <span>Duration: {formatDuration(latestRun.endTime - latestRun.startTime)}</span>
                    </div>
                    {onExport && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 15 }}>
                            <button
                                onClick={() => onExport(latestRun.id)}
                                style={{
                                    background: 'var(--vscode-button-secondaryBackground)',
                                    color: 'var(--vscode-button-secondaryForeground)',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5
                                }}
                            >
                                <Download size={14} /> Export CSV
                            </button>
                            <button
                                onClick={() => {
                                    const report = generateMarkdownReport(latestRun);
                                    downloadMarkdownReport(report, `${latestRun.suiteName}_report`);
                                }}
                                style={{
                                    background: 'var(--vscode-button-secondaryBackground)',
                                    color: 'var(--vscode-button-secondaryForeground)',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 5
                                }}
                            >
                                <FileText size={14} /> Export Report
                            </button>
                        </div>
                    )}
                    {renderStats(latestRun.summary)}

                    {/* Response Time Chart */}
                    {latestRun.results.length > 0 && (
                        <ChartContainer>
                            <ChartTitle>Response Time Distribution (by Request)</ChartTitle>
                            <BarContainer>
                                {(() => {
                                    // Group results by request and calculate avg
                                    const avgByRequest = new Map<string, { name: string; avg: number; count: number }>();
                                    for (const r of latestRun.results) {
                                        const existing = avgByRequest.get(r.requestName) || { name: r.requestName, avg: 0, count: 0 };
                                        existing.avg = (existing.avg * existing.count + r.duration) / (existing.count + 1);
                                        existing.count++;
                                        avgByRequest.set(r.requestName, existing);
                                    }
                                    const data = Array.from(avgByRequest.values());
                                    const maxDuration = Math.max(...data.map(d => d.avg), 1);
                                    return data.map((d, i) => (
                                        <BarRow key={i}>
                                            <BarLabel>{d.name.substring(0, 12)}</BarLabel>
                                            <BarTrack>
                                                <BarFill
                                                    width={(d.avg / maxDuration) * 100}
                                                    color={d.avg > latestRun.summary.p95 ? 'var(--vscode-charts-orange)' : undefined}
                                                />
                                            </BarTrack>
                                            <BarValue>{formatDuration(d.avg)}</BarValue>
                                        </BarRow>
                                    ));
                                })()}
                            </BarContainer>
                        </ChartContainer>
                    )}
                </Section>
            )}

            {/* Run History */}
            {runs.length > 1 && (
                <Section>
                    <SectionHeader>
                        <Clock size={16} /> Run History ({runs.length} runs)
                    </SectionHeader>

                    {/* Response Time Trend Chart */}
                    <div style={{ marginBottom: 20 }}>
                        <ResponseTimeChart
                            data={statsToChartData(runs.slice(-10))} // Last 10 runs
                            title="Response Time Trend (Last 10 Runs)"
                            height={160}
                            showP95={true}
                            showP99={false}
                        />
                    </div>

                    {runs.slice(0, -1).reverse().map(run => (
                        <HistoryItem key={run.id} status={run.status}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: 500 }}>{run.suiteName}</div>
                                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                    {formatTime(run.startTime)} • {formatDuration(run.endTime - run.startTime)}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 500 }}>{formatDuration(run.summary.avgResponseTime)} avg</div>
                                <div style={{ fontSize: '0.85em', opacity: 0.7 }}>
                                    {(run.summary.successRate * 100).toFixed(0)}% success
                                </div>
                            </div>
                        </HistoryItem>
                    ))}
                </Section>
            )}

            {runs.length === 0 && !isRunning && (
                <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
                    <BarChart3 size={48} style={{ marginBottom: 15, opacity: 0.5 }} />
                    <div>No performance runs yet.</div>
                    <div style={{ fontSize: '0.9em', marginTop: 5 }}>Run a suite to see results here.</div>
                </div>
            )}
        </Container>
    );
};

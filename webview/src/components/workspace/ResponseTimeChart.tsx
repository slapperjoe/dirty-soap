/**
 * ResponseTimeChart Component
 * 
 * A simple SVG-based line chart for visualizing response times across runs.
 */

import React from 'react';
import { PerformanceStats } from '../../models';

interface DataPoint {
    label: string;
    value: number;
    p95?: number;
    p99?: number;
}

interface ResponseTimeChartProps {
    data: DataPoint[];
    height?: number;
    showP95?: boolean;
    showP99?: boolean;
    title?: string;
}

export const ResponseTimeChart: React.FC<ResponseTimeChartProps> = ({
    data,
    height = 150,
    showP95 = true,
    showP99 = false,
    title = 'Response Times'
}) => {
    if (data.length === 0) {
        return (
            <div style={{
                height,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--vscode-descriptionForeground)',
                fontSize: 12
            }}>
                No data to display
            </div>
        );
    }

    const width = 300;
    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    // Calculate scales
    const allValues = data.flatMap(d => [d.value, d.p95 || 0, d.p99 || 0]);
    const maxValue = Math.max(...allValues) * 1.1 || 100;
    const minValue = 0;

    const xScale = (index: number) => padding.left + (index / (data.length - 1 || 1)) * chartWidth;
    const yScale = (value: number) => height - padding.bottom - ((value - minValue) / (maxValue - minValue)) * chartHeight;

    // Create line paths
    const createPath = (accessor: (d: DataPoint) => number | undefined) => {
        const points = data
            .map((d, i) => {
                const val = accessor(d);
                return val !== undefined ? `${xScale(i)},${yScale(val)}` : null;
            })
            .filter(Boolean);
        return `M${points.join('L')}`;
    };

    const avgPath = createPath(d => d.value);
    const p95Path = showP95 ? createPath(d => d.p95) : '';
    const p99Path = showP99 ? createPath(d => d.p99) : '';

    // Grid lines
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map(ratio => ({
        y: padding.top + chartHeight * (1 - ratio),
        value: minValue + (maxValue - minValue) * ratio
    }));

    return (
        <div style={{ width: '100%' }}>
            {title && (
                <div style={{
                    fontSize: 11,
                    fontWeight: 500,
                    marginBottom: 4,
                    color: 'var(--vscode-foreground)'
                }}>
                    {title}
                </div>
            )}
            <svg
                width="100%"
                height={height}
                viewBox={`0 0 ${width} ${height}`}
                style={{ overflow: 'visible' }}
            >
                {/* Grid lines */}
                {gridLines.map((line, i) => (
                    <g key={i}>
                        <line
                            x1={padding.left}
                            y1={line.y}
                            x2={width - padding.right}
                            y2={line.y}
                            stroke="var(--vscode-editorWidget-border)"
                            strokeWidth={0.5}
                            strokeDasharray="3,3"
                        />
                        <text
                            x={padding.left - 8}
                            y={line.y + 3}
                            textAnchor="end"
                            fontSize={9}
                            fill="var(--vscode-descriptionForeground)"
                        >
                            {Math.round(line.value)}ms
                        </text>
                    </g>
                ))}

                {/* P99 line */}
                {showP99 && p99Path && (
                    <path
                        d={p99Path}
                        fill="none"
                        stroke="var(--vscode-charts-red)"
                        strokeWidth={1.5}
                        strokeDasharray="4,2"
                        opacity={0.6}
                    />
                )}

                {/* P95 line */}
                {showP95 && p95Path && (
                    <path
                        d={p95Path}
                        fill="none"
                        stroke="var(--vscode-charts-yellow)"
                        strokeWidth={1.5}
                        strokeDasharray="2,2"
                        opacity={0.8}
                    />
                )}

                {/* Average line */}
                <path
                    d={avgPath}
                    fill="none"
                    stroke="var(--vscode-charts-green)"
                    strokeWidth={2}
                />

                {/* Data points */}
                {data.map((d, i) => (
                    <circle
                        key={i}
                        cx={xScale(i)}
                        cy={yScale(d.value)}
                        r={3}
                        fill="var(--vscode-charts-green)"
                    />
                ))}

                {/* X-axis labels */}
                {data.map((d, i) => (
                    <text
                        key={i}
                        x={xScale(i)}
                        y={height - 8}
                        textAnchor="middle"
                        fontSize={8}
                        fill="var(--vscode-descriptionForeground)"
                    >
                        {d.label.length > 6 ? d.label.slice(0, 6) + '…' : d.label}
                    </text>
                ))}
            </svg>

            {/* Legend */}
            <div style={{
                display: 'flex',
                gap: 12,
                fontSize: 10,
                marginTop: 4,
                justifyContent: 'center'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 12, height: 2, background: 'var(--vscode-charts-green)' }} />
                    Avg
                </div>
                {showP95 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 2, background: 'var(--vscode-charts-yellow)', opacity: 0.8 }} />
                        P95
                    </div>
                )}
                {showP99 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 12, height: 2, background: 'var(--vscode-charts-red)', opacity: 0.6 }} />
                        P99
                    </div>
                )}
            </div>
        </div>
    );
};

/**
 * Convert PerformanceStats array to chart data points
 */
export function statsToChartData(runs: Array<{ id?: string; summary: PerformanceStats; startTime?: number }>): DataPoint[] {
    return runs.map((run, index) => ({
        label: run.startTime
            ? new Date(run.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : `Run ${index + 1}`,
        value: run.summary.avgResponseTime,
        p95: run.summary.p95,
        p99: run.summary.p99
    }));
}

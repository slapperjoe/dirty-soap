import React from 'react';
import { Bug, Play } from 'lucide-react';
import { MonacoRequestEditor } from '../MonacoRequestEditor';
import { Content, ToolbarButton } from '../../styles/WorkspaceLayout.styles';
import { ApinoxConfig } from '@shared/models';

export interface BreakpointData {
    breakpointName: string;
    type: 'request' | 'response';
    content: string;
    timeoutMs: number;
}

export interface BreakpointOverlayProps {
    breakpoint: BreakpointData;
    content: string;
    onContentChange: (content: string) => void;
    timeRemaining: number;
    onResolve: (content: string, cancelled?: boolean) => void;
    config?: ApinoxConfig;
}

/**
 * Full-screen overlay shown when a breakpoint is hit.
 * Allows editing request/response content before continuing.
 */
export const BreakpointOverlay: React.FC<BreakpointOverlayProps> = ({
    breakpoint,
    content,
    onContentChange,
    timeRemaining,
    onResolve,
    config
}) => {
    const bp = breakpoint;
    const seconds = Math.ceil(timeRemaining / 1000);
    const progress = (timeRemaining / bp.timeoutMs) * 100;

    return (
        <Content style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Breakpoint Banner */}
            <div style={{
                background: 'linear-gradient(90deg, #d97706 0%, #b45309 100%)',
                padding: '12px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                color: 'white'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Bug size={20} />
                    <div>
                        <strong>Breakpoint Hit: {bp.breakpointName}</strong>
                        <span style={{ marginLeft: 10, opacity: 0.9 }}>
                            ({bp.type === 'request' ? 'Outgoing Request' : 'Incoming Response'})
                        </span>
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                    <div style={{
                        width: 120,
                        height: 6,
                        background: 'rgba(255,255,255,0.3)',
                        borderRadius: 3,
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${progress}%`,
                            height: '100%',
                            background: 'white',
                            transition: 'width 1s linear'
                        }} />
                    </div>
                    <span style={{ fontWeight: 'bold', minWidth: 40 }}>{seconds}s</span>
                    <ToolbarButton
                        onClick={() => {
                            // Minify XML back to single line (remove pretty-print formatting)
                            const minified = content.replace(/>\s+</g, '><').trim();
                            onResolve(minified);
                        }}
                        style={{ background: 'white', color: '#b45309', padding: '6px 12px' }}
                    >
                        <Play size={14} /> Continue
                    </ToolbarButton>
                    <ToolbarButton
                        onClick={() => onResolve(bp.content, true)}
                        style={{ background: 'rgba(255,255,255,0.2)', color: 'white', padding: '6px 12px' }}
                    >
                        Cancel
                    </ToolbarButton>
                </div>
            </div>

            {/* Editable Content */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--vscode-panel-border)' }}>
                    <span style={{ fontWeight: 'bold' }}>
                        Edit {bp.type === 'request' ? 'Request' : 'Response'} Content:
                    </span>
                </div>
                <div style={{ flex: 1, position: 'relative' }}>
                    <MonacoRequestEditor
                        value={content}
                        onChange={onContentChange}
                        readOnly={false}
                        autoFoldElements={config?.ui?.autoFoldElements}
                    />
                </div>
            </div>
        </Content>
    );
};

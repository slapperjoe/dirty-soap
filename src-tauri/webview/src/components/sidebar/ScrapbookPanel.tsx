import React, { useState } from 'react';
import styled from 'styled-components';
import { Plus, Trash2, Play } from 'lucide-react';
import { SidebarContextMenu, CtxMenuSection } from './shared/SidebarContextMenu';
import { ScrapbookRequest } from '@shared/models';
import { SidebarHeaderActions, SidebarHeaderTitle, RequestItem as BaseRequestItem } from './shared/SidebarStyles';
import { HeaderButton } from '../common/Button';
import { SPACING_SM } from '../../styles/spacing';
import { EmptyState } from '../common/EmptyState';

export interface ScrapbookPanelProps {
    requests: ScrapbookRequest[];
    selectedRequest: ScrapbookRequest | null;
    loading: boolean;
    onCreateRequest: () => void;
    onSelectRequest: (request: ScrapbookRequest) => void;
    onDeleteRequest: (id: string) => void;
    onExecuteRequest: (request: ScrapbookRequest) => void;
    /**
     * Fill the host's full height (flex column) and make the request list the
     * internal scroll container. Used by the resizable Quick Requests
     * subwindow in the unified explorer sidebar; off by default so existing
     * (non-filled) hosts keep the panel's natural height + outer scroll.
     */
    fill?: boolean;
}

const SectionHeader = styled.div`
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 10px;
    min-height: 28px;
    user-select: none;
    margin-left: -10px;
    margin-right: -10px;
`;

const RequestList = styled.div<{ $fill?: boolean }>`
    display: flex;
    flex-direction: column;
    min-height: 0;
    ${props => props.$fill
        ? "flex: 1; overflow-y: auto; margin-left: -10px; margin-right: -10px;"
        : ""}
`;

const RequestItem = styled(BaseRequestItem)<{ $selected: boolean }>`
    display: flex;
    align-items: center;
    gap: ${SPACING_SM};
    background-color: ${props => props.$selected ? 'var(--apinox-list-activeSelectionBackground)' : 'transparent'};
    color: ${props => props.$selected ? 'var(--apinox-list-activeSelectionForeground)' : 'inherit'};
    
    &:hover {
        background-color: ${props => props.$selected ? 'var(--apinox-list-activeSelectionBackground)' : 'var(--apinox-list-hoverBackground)'};
    }
`;

const RequestName = styled.div`
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
`;

const RequestActions = styled.div`
    display: flex;
    gap: ${SPACING_SM};
    opacity: 0.7;

    &:hover {
        opacity: 1;
    }
`;

const IconButton = styled.button`
    background: transparent;
    border: none;
    color: var(--apinox-foreground);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;

    &:hover {
        background: var(--apinox-list-hoverBackground);
    }

    &:active {
        background: var(--apinox-list-activeSelectionBackground);
    }
`;

export const ScrapbookPanel: React.FC<ScrapbookPanelProps> = ({
    requests,
    selectedRequest,
    loading,
    onCreateRequest,
    onSelectRequest,
    onDeleteRequest,
    onExecuteRequest,
    fill = false,
}) => {
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; request: ScrapbookRequest } | null>(null);

    const handleContextMenu = (e: React.MouseEvent, request: ScrapbookRequest) => {
        e.preventDefault();
        e.stopPropagation();
        setCtxMenu({ x: e.clientX, y: e.clientY, request });
    };

    const closeCtxMenu = () => setCtxMenu(null);

    // Shared pieces. Non-fill render keeps the exact legacy fragment (header,
    // natural-height list, host scrolls). Fill mode — used by the resizable
    // Quick Requests subwindow — is a full-height flex column: fixed header,
    // request list as the internal scroll container, no double scrollbar.
    const sectionHeader = (
        <SectionHeader>
            <SidebarHeaderTitle>Quick Requests</SidebarHeaderTitle>
            <SidebarHeaderActions>
                <HeaderButton onClick={onCreateRequest} title="Create New Request">
                    <Plus size={16} />
                </HeaderButton>
            </SidebarHeaderActions>
        </SectionHeader>
    );

    const body = loading ? (
        <EmptyState icon={null} title="Loading..." />
    ) : requests.length === 0 ? (
        <EmptyState icon={null} title="No quick requests yet" description="Click + to create one." />
    ) : (
        <RequestList $fill={fill}>
            {requests.map(request => (
                <RequestItem
                    key={request.id}
                    $selected={selectedRequest?.id === request.id}
                    $active={selectedRequest?.id === request.id}
                    onClick={() => onSelectRequest(request)}
                    onContextMenu={(e) => handleContextMenu(e, request)}
                >
                    <RequestName title={request.name}>
                        {request.name}
                    </RequestName>
                    <RequestActions>
                        <IconButton
                            onClick={(e) => {
                                e.stopPropagation();
                                onExecuteRequest(request);
                            }}
                            title="Execute Request"
                        >
                            <Play size={14} />
                        </IconButton>
                        <IconButton
                            onClick={(e) => {
                                e.stopPropagation();
                                onDeleteRequest(request.id);
                            }}
                            title="Delete Request"
                        >
                            <Trash2 size={14} />
                        </IconButton>
                    </RequestActions>
                </RequestItem>
            ))}
        </RequestList>
    );

    const ctxMenuEl = ctxMenu && (
        <SidebarContextMenu
            x={ctxMenu.x}
            y={ctxMenu.y}
            sections={[{
                title: 'Actions',
                items: [
                    { icon: Play, label: 'Execute Request', onClick: () => { onExecuteRequest(ctxMenu.request); closeCtxMenu(); } },
                    { icon: Trash2, label: 'Delete', danger: true, onClick: () => { onDeleteRequest(ctxMenu.request.id); closeCtxMenu(); } },
                ],
            }] as CtxMenuSection[]}
            onClose={closeCtxMenu}
        />
    );

    if (fill) {
        return (
            <div
                data-testid="scrapbook-panel-root"
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    height: '100%',
                    minHeight: 0,
                    overflow: 'hidden',
                }}
            >
                {sectionHeader}
                {/* Loading/empty states are centered in their own bounded
                    scroll area so a shrunken subwindow clips nothing. */}
                {loading || requests.length === 0 ? (
                    <div
                        style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex' }}
                    >
                        {body}
                    </div>
                ) : (
                    body
                )}
                {ctxMenuEl}
            </div>
        );
    }
    return <>{sectionHeader}{body}{ctxMenuEl}</>;
};

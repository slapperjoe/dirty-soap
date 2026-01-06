import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import {
    Star,
    Trash2,
    Clock
} from 'lucide-react';
import { RequestHistoryEntry } from '@shared/models';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: 10px;
`;

const SearchBar = styled.input`
    width: 100%;
    padding: 8px 12px;
    margin-bottom: 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;

    &:focus {
        outline: none;
        border-color: var(--vscode-focusBorder);
    }

    &::placeholder {
        color: var(--vscode-input-placeholderForeground);
    }
`;

const Section = styled.div`
    margin-bottom: 15px;
`;

const SectionTitle = styled.div`
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    opacity: 0.7;
    margin-bottom: 8px;
    letter-spacing: 0.5px;
`;

const HistoryList = styled.div`
    flex: 1;
    overflow-y: auto;
`;

const HistoryItem = styled.div<{ $success?: boolean }>`
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 8px;
    margin-bottom: 4px;
    background: var(--vscode-list-inactiveSelectionBackground);
    border-radius: 4px;
    cursor: pointer;
    border-left: 3px solid ${props =>
        props.$success === false
            ? 'var(--vscode-testing-iconFailed)'
            : props.$success === true
                ? 'var(--vscode-testing-iconPassed)'
                : 'var(--vscode-input-border)'
    };

    &:hover {
        background: var(--vscode-list-hoverBackground);
    }
`;

const ItemContent = styled.div`
    flex: 1;
    min-width: 0;
`;

const ItemTitle = styled.div`
    font-weight: 500;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ItemDetails = styled.div`
    font-size: 11px;
    opacity: 0.7;
    margin-top: 2px;
`;

const ItemMeta = styled.div`
    font-size: 10px;
    opacity: 0.5;
    margin-top: 2px;
    display: flex;
    align-items: center;
    gap: 8px;
`;

const IconButton = styled.button`
    background: none;
    border: none;
    color: var(--vscode-foreground);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.6;
    border-radius: 3px;

    &:hover {
        opacity: 1;
        background: var(--vscode-toolbar-hoverBackground);
    }

    &.starred {
        opacity: 1;
        color: var(--vscode-editorWarning-foreground);
    }
`;

const EmptyState = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    text-align: center;
    opacity: 0.6;
`;

const EmptyIcon = styled.div`
    margin-bottom: 10px;
    opacity: 0.4;
`;

interface HistorySidebarProps {
    history: RequestHistoryEntry[];
    onReplay?: (entry: RequestHistoryEntry) => void;
    onToggleStar?: (id: string) => void;
    onDelete?: (id: string) => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
    history,
    onReplay,
    onToggleStar,
    onDelete
}) => {
    const [searchTerm, setSearchTerm] = useState('');

    // Filter history based on search
    const filteredHistory = useMemo(() => {
        if (!searchTerm) return history;

        const term = searchTerm.toLowerCase();
        return history.filter(entry =>
            entry.requestName.toLowerCase().includes(term) ||
            entry.operationName.toLowerCase().includes(term) ||
            entry.projectName.toLowerCase().includes(term) ||
            entry.endpoint.toLowerCase().includes(term)
        );
    }, [history, searchTerm]);

    // Group by time
    const groupedHistory = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTime = today.getTime();

        const yesterday = new Date(todayTime - 24 * 60 * 60 * 1000);
        const yesterdayTime = yesterday.getTime();

        const thisWeek = new Date(todayTime - 7 * 24 * 60 * 60 * 1000);
        const thisWeekTime = thisWeek.getTime();

        const groups: {
            starred: RequestHistoryEntry[];
            today: RequestHistoryEntry[];
            yesterday: RequestHistoryEntry[];
            thisWeek: RequestHistoryEntry[];
            older: RequestHistoryEntry[];
        } = {
            starred: [],
            today: [],
            yesterday: [],
            thisWeek: [],
            older: []
        };

        filteredHistory.forEach(entry => {
            if (entry.starred) {
                groups.starred.push(entry);
            }

            if (entry.timestamp >= todayTime) {
                groups.today.push(entry);
            } else if (entry.timestamp >= yesterdayTime) {
                groups.yesterday.push(entry);
            } else if (entry.timestamp >= thisWeekTime) {
                groups.thisWeek.push(entry);
            } else {
                groups.older.push(entry);
            }
        });

        return groups;
    }, [filteredHistory]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return '';
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(2)}s`;
    };

    const renderHistoryItem = (entry: RequestHistoryEntry) => (
        <HistoryItem key={entry.id} $success={entry.success}>
            <ItemContent onClick={() => onReplay?.(entry)}>
                <ItemTitle>{entry.requestName || entry.operationName}</ItemTitle>
                <ItemDetails>
                    {entry.projectName} › {entry.interfaceName} › {entry.operationName}
                </ItemDetails>
                <ItemMeta>
                    <span>{formatTime(entry.timestamp)}</span>
                    {entry.duration && <span>{formatDuration(entry.duration)}</span>}
                    {entry.statusCode && <span>{entry.statusCode}</span>}
                </ItemMeta>
            </ItemContent>

            <IconButton
                className={entry.starred ? 'starred' : ''}
                onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar?.(entry.id);
                }}
                title={entry.starred ? 'Remove from favorites' : 'Add to favorites'}
            >
                <Star size={14} fill={entry.starred ? 'currentColor' : 'none'} />
            </IconButton>

            <IconButton
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete?.(entry.id);
                }}
                title="Delete from history"
            >
                <Trash2 size={14} />
            </IconButton>
        </HistoryItem>
    );

    if (history.length === 0) {
        return (
            <Container>
                <EmptyState>
                    <EmptyIcon>
                        <Clock size={48} />
                    </EmptyIcon>
                    <div style={{ marginBottom: 8, fontWeight: 500 }}>No request history yet</div>
                    <div style={{ fontSize: 12 }}>
                        Execute a manual request to see it appear here
                    </div>
                </EmptyState>
            </Container>
        );
    }

    return (
        <Container>
            <SearchBar
                type="text"
                placeholder="Search history..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />

            <HistoryList>
                {groupedHistory.starred.length > 0 && (
                    <Section>
                        <SectionTitle>⭐ Favorites</SectionTitle>
                        {groupedHistory.starred.map(renderHistoryItem)}
                    </Section>
                )}

                {groupedHistory.today.length > 0 && (
                    <Section>
                        <SectionTitle>Today</SectionTitle>
                        {groupedHistory.today.map(renderHistoryItem)}
                    </Section>
                )}

                {groupedHistory.yesterday.length > 0 && (
                    <Section>
                        <SectionTitle>Yesterday</SectionTitle>
                        {groupedHistory.yesterday.map(renderHistoryItem)}
                    </Section>
                )}

                {groupedHistory.thisWeek.length > 0 && (
                    <Section>
                        <SectionTitle>This Week</SectionTitle>
                        {groupedHistory.thisWeek.map(renderHistoryItem)}
                    </Section>
                )}

                {groupedHistory.older.length > 0 && (
                    <Section>
                        <SectionTitle>Older</SectionTitle>
                        {groupedHistory.older.map(renderHistoryItem)}
                    </Section>
                )}
            </HistoryList>
        </Container>
    );
};

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ScrapbookPanel, ScrapbookPanelProps } from '../ScrapbookPanel';
import { ScrapbookRequest } from '@shared/models';

// ── fixtures ─────────────────────────────────────────────────────────────────
const makeRequest = (id: string, name: string): ScrapbookRequest => ({
    id,
    name,
    request: `<${name.replace(/\s+/g, '')}/>`,
    requestType: 'soap',
    method: 'POST',
    bodyType: 'xml',
    contentType: 'application/soap+xml',
    headers: { 'Content-Type': 'application/soap+xml' },
    endpoint: `http://example.com/${id}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-02T00:00:00.000Z',
});

const reqA = makeRequest('id-a', 'Request A');
const reqB = makeRequest('id-b', 'Request B');

const baseProps: Omit<ScrapbookPanelProps, 'requests' | 'selectedRequest'> = {
    loading: false,
    onCreateRequest: vi.fn(),
    onSelectRequest: vi.fn(),
    onDeleteRequest: vi.fn(),
    onExecuteRequest: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ScrapbookPanel (doc §8.2)', () => {
    it('renders the Quick Requests section header and request list', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA, reqB]}
                selectedRequest={reqB}
            />,
        );

        expect(screen.getByText('Quick Requests')).toBeInTheDocument();
        expect(screen.getByText('Request A')).toBeInTheDocument();
        expect(screen.getByText('Request B')).toBeInTheDocument();
    });

    it('renders the loading state', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                loading
                requests={[]}
                selectedRequest={null}
            />,
        );
        expect(screen.getByText('Loading...')).toBeInTheDocument();
        // No list items while loading.
        expect(screen.queryByText('Request A')).not.toBeInTheDocument();
    });

    it('renders the empty state when there are no requests', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[]}
                selectedRequest={null}
            />,
        );
        expect(screen.getByText('No quick requests yet')).toBeInTheDocument();
        expect(screen.getByText('Click + to create one.')).toBeInTheDocument();
    });

    it('onCreateRequest fires when the create (+) button is clicked', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA]}
                selectedRequest={null}
            />,
        );
        fireEvent.click(screen.getByTitle('Create New Request'));
        expect(baseProps.onCreateRequest).toHaveBeenCalledTimes(1);
    });

    it('onSelectRequest fires with the clicked request', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA, reqB]}
                selectedRequest={null}
            />,
        );
        fireEvent.click(screen.getByText('Request B'));
        expect(baseProps.onSelectRequest).toHaveBeenCalledTimes(1);
        expect(baseProps.onSelectRequest).toHaveBeenCalledWith(reqB);
    });

    it('onExecuteRequest fires with the clicked request (inline play button)', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA, reqB]}
                selectedRequest={null}
            />,
        );
        // The play button is the first action button inside Request A's row.
        const rows = screen.getAllByRole('button');
        const executeButton = rows.find(b => b.getAttribute('title') === 'Execute Request');
        expect(executeButton).toBeDefined();
        fireEvent.click(executeButton!);
        expect(baseProps.onExecuteRequest).toHaveBeenCalledTimes(1);
        expect(baseProps.onExecuteRequest).toHaveBeenCalledWith(reqA);
        // Clicking execute must NOT select the request.
        expect(baseProps.onSelectRequest).not.toHaveBeenCalled();
    });

    it('onDeleteRequest fires with the right id and does not bubble to select', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA, reqB]}
                selectedRequest={reqA}
            />,
        );
        const deleteButtons = screen.getAllByTitle('Delete Request');
        fireEvent.click(deleteButtons[0]);
        expect(baseProps.onDeleteRequest).toHaveBeenCalledTimes(1);
        expect(baseProps.onDeleteRequest).toHaveBeenCalledWith('id-a');
        expect(baseProps.onSelectRequest).not.toHaveBeenCalled();
    });

    it('highlights the selected request row (styled-components selection state)', () => {
        render(
            <ScrapbookPanel
                {...baseProps}
                requests={[reqA, reqB]}
                selectedRequest={reqB}
            />,
        );
        // RequestItem is a styled component: the selected row carries a
        // different generated class than the unselected one (jsdom does not
        // apply the stylesheets, so we assert on the class names).
        const nameA = screen.getByText('Request A');
        const nameB = screen.getByText('Request B');
        const rowA = nameA.parentElement!;
        const rowB = nameB.parentElement!;
        expect(rowA.className).toBeTruthy();
        expect(rowB.className).toBeTruthy();
        expect(rowB.className).not.toBe(rowA.className);
    });
});

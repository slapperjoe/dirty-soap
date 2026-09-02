import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UnifiedExplorerSidebar } from '../UnifiedExplorerSidebar';
import { UnifiedProject, ScrapbookRequest } from '@shared/models';

// ── fixtures ─────────────────────────────────────────────────────────────────
const makeProject = (): UnifiedProject => ({
    name: 'CountryInfo',
    source: 'wsdl',
    sourceUrl: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
    parsedAt: new Date().toISOString(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-1',
            name: 'GetCurrencyRate',
            action: 'http://www.oorsprong.org/websamples.countryinfo/GetCurrencyRate',
            targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo/',
            originalEndpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
            requests: [
                {
                    id: 'req-1',
                    name: 'MyRateRequest',
                    request: '<GetCurrencyRate/>',
                    endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                },
            ],
        },
    ],
});

const quickRequest: ScrapbookRequest = {
    id: 'quick-1',
    name: 'Quick Rate Check',
    request: '<Quick/>',
    requestType: 'soap',
    method: 'POST',
    bodyType: 'xml',
    contentType: 'text/xml',
    headers: { 'Content-Type': 'text/xml' },
    endpoint: 'http://example.com/soap',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-02T00:00:00.000Z',
};

const baseProps: Omit<React.ComponentProps<typeof UnifiedExplorerSidebar>, 'projects' | 'scrapbook'> = {
    selectedNode: null,
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteRequest: vi.fn(),
    onNewRequest: vi.fn(),
    onExportProject: vi.fn(),
    onReorderOperation: vi.fn(),
    onReorderRequest: vi.fn(),
};

const makeScrapbookProps = () => ({
    requests: [quickRequest],
    selectedRequest: null as ScrapbookRequest | null,
    loading: false,
    onCreateRequest: vi.fn(),
    onSelectRequest: vi.fn(),
    onDeleteRequest: vi.fn(),
    onExecuteRequest: vi.fn(),
});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('UnifiedExplorerSidebar + Quick Requests (doc §8.3 — Q1(a) bottom section)', () => {
    it('renders the quick-requests section below the project tree', () => {
        render(
            <UnifiedExplorerSidebar
                {...baseProps}
                projects={[makeProject()]}
                scrapbook={makeScrapbookProps()}
            />,
        );

        // Tree is still there (projects render above the section).
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
        const quickSection = screen.getByTestId('unified-quick-requests');
        expect(quickSection).toBeInTheDocument();
        expect(screen.getByText('Quick Requests')).toBeInTheDocument();
        expect(screen.getByText('Quick Rate Check')).toBeInTheDocument();

        // Section is strictly BELOW the tree in document order: walk up from
        // the project label to a common ancestor and compare firstChild indices.
        const treeLabel = screen.getByText('CountryInfo');
        const findCommonAncestor = (a: Node, b: Node): Node => {
            const aChain: Node[] = [];
            let n: Node | null = a;
            while (n && n !== document.body) { aChain.push(n); n = n.parentNode; }
            let m: Node | null = b;
            while (m) {
                if (aChain.includes(m)) return m;
                m = m.parentNode;
            }
            return document.body;
        };
        const common = findCommonAncestor(treeLabel, quickSection);
        const aChildren = Array.from(common.childNodes);
        const labelIdx = aChildren.findIndex(c => c === treeLabel || c.contains(treeLabel));
        const quickIdx = aChildren.findIndex(c => c === quickSection || c.contains(quickSection));
        expect(labelIdx).toBeGreaterThanOrEqual(0);
        expect(quickIdx).toBeGreaterThanOrEqual(0);
        expect(quickIdx).toBeGreaterThan(labelIdx);
    });

    it('selecting a scrapbook request drives the select handler with the right id', () => {
        const scrapbook = makeScrapbookProps();
        // The select handler (wired by MainContent) records the node — the
        // panel's onSelectRequest IS the select handler chain.
        render(
            <UnifiedExplorerSidebar
                {...baseProps}
                projects={[makeProject()]}
                scrapbook={scrapbook}
            />,
        );

        fireEvent.click(screen.getByText('Quick Rate Check'));
        expect(scrapbook.onSelectRequest).toHaveBeenCalledTimes(1);
        expect(scrapbook.onSelectRequest).toHaveBeenCalledWith(quickRequest);
    });

    it('create/delete/execute callbacks fire with the right ids', () => {
        const scrapbook = makeScrapbookProps();
        render(
            <UnifiedExplorerSidebar
                {...baseProps}
                projects={[makeProject()]}
                scrapbook={scrapbook}
            />,
        );

        fireEvent.click(screen.getByTitle('Create New Request'));
        expect(scrapbook.onCreateRequest).toHaveBeenCalledTimes(1);

        const executeButton = screen
            .getAllByRole('button')
            .find(b => b.getAttribute('title') === 'Execute Request');
        fireEvent.click(executeButton!);
        expect(scrapbook.onExecuteRequest).toHaveBeenCalledTimes(1);
        expect(scrapbook.onExecuteRequest).toHaveBeenCalledWith(quickRequest);

        fireEvent.click(screen.getByTitle('Delete Request'));
        expect(scrapbook.onDeleteRequest).toHaveBeenCalledTimes(1);
        expect(scrapbook.onDeleteRequest).toHaveBeenCalledWith('quick-1');
    });

    it('does not render the quick-requests section when no scrapbook prop is given (back-compat)', () => {
        render(
            <UnifiedExplorerSidebar
                {...baseProps}
                projects={[makeProject()]}
            />,
        );
        expect(screen.queryByTestId('unified-quick-requests')).not.toBeInTheDocument();
        // The tree still renders.
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
    });

    it('renders the quick-requests empty state below an empty tree', () => {
        const scrapbook = makeScrapbookProps();
        scrapbook.requests = [];
        render(
            <UnifiedExplorerSidebar
                {...baseProps}
                projects={[]}
                scrapbook={scrapbook}
            />,
        );
        expect(screen.getByText('No projects yet')).toBeInTheDocument();
        expect(screen.getByTestId('unified-quick-requests')).toBeInTheDocument();
        expect(screen.getByText('No quick requests yet')).toBeInTheDocument();
    });
});

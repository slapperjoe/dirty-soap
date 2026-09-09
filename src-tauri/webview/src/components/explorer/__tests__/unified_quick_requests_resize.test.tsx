import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
    UnifiedExplorerSidebar,
    QUICK_REQUESTS_DEFAULT_HEIGHT,
    QUICK_REQUESTS_MIN_HEIGHT,
    clampQuickRequestsHeight,
} from '../UnifiedExplorerSidebar';
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

const makeQuickRequest = (index: number): ScrapbookRequest => ({
    id: `quick-${index}`,
    name: `Quick Request ${index}`,
    request: `<Quick${index}/>`,
    requestType: 'soap',
    method: 'POST',
    bodyType: 'xml',
    contentType: 'text/xml',
    headers: { 'Content-Type': 'text/xml' },
    endpoint: `http://example.com/soap/${index}`,
    createdAt: '2026-01-01T00:00:00.000Z',
    lastModified: '2026-01-02T00:00:00.000Z',
});

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

const makeScrapbookProps = (requests: ScrapbookRequest[] = [makeQuickRequest(1)]) => ({
    requests,
    selectedRequest: null as ScrapbookRequest | null,
    loading: false,
    onCreateRequest: vi.fn(),
    onSelectRequest: vi.fn(),
    onDeleteRequest: vi.fn(),
    onExecuteRequest: vi.fn(),
});

// jsdom has no layout engine: stub getBoundingClientRect on the sidebar root
// (the element the drag handler measures) so the clamp math is deterministic.
const stubRect = (el: Element, rect: { top?: number; height?: number }) => {
    el.getBoundingClientRect = () => ({
        x: 0,
        y: rect.top ?? 0,
        top: rect.top ?? 0,
        left: 0,
        right: 0,
        bottom: (rect.top ?? 0) + (rect.height ?? 0),
        width: 240,
        height: rect.height ?? 0,
        toJSON: () => ({}),
    } as DOMRect);
};

const renderSidebar = (requests: ScrapbookRequest[] = [makeQuickRequest(1)]) => {
    const utils = render(
        <UnifiedExplorerSidebar
            {...baseProps}
            projects={[makeProject()]}
            scrapbook={makeScrapbookProps(requests)}
        />,
    );
    const root = utils.container.firstChild as HTMLElement;
    return { ...utils, root };
};

beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
});

// ── clamp helper ─────────────────────────────────────────────────────────────
describe('clampQuickRequestsHeight', () => {
    it('clamps below-minimum values to the minimum (header + one row)', () => {
        expect(QUICK_REQUESTS_MIN_HEIGHT).toBeGreaterThanOrEqual(60);
        expect(clampQuickRequestsHeight(10)).toBe(QUICK_REQUESTS_MIN_HEIGHT);
        expect(clampQuickRequestsHeight(0)).toBe(QUICK_REQUESTS_MIN_HEIGHT);
    });

    it('clamps above-maximum values to the maximum', () => {
        expect(clampQuickRequestsHeight(5000)).toBe(600);
    });

    it('falls back to the default for non-finite values and rounds fractions', () => {
        expect(clampQuickRequestsHeight(Number.NaN)).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);
        expect(clampQuickRequestsHeight(Number.POSITIVE_INFINITY)).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);
        expect(clampQuickRequestsHeight(200.6)).toBe(201);
        expect(clampQuickRequestsHeight(200.4)).toBe(200);
    });

    it('passes in-range values through unchanged', () => {
        expect(clampQuickRequestsHeight(QUICK_REQUESTS_DEFAULT_HEIGHT)).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);
    });
});

// ── resizable subwindow UI ───────────────────────────────────────────────────
describe('UnifiedExplorerSidebar — Quick Requests resizable subwindow', () => {
    it('renders a vertical resize handle above the subwindow at the default height', () => {
        renderSidebar();
        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        expect(handle).toBeInTheDocument();
        expect(handle.style.cursor).toBe('row-resize');

        const section = screen.getByTestId('unified-quick-requests');
        expect(section.style.height).toBe(`${QUICK_REQUESTS_DEFAULT_HEIGHT}px`);
        expect(section.style.minHeight).toBe(`${QUICK_REQUESTS_MIN_HEIGHT}px`);
    });

    it('dragging the handle changes the subwindow height', () => {
        const { root } = renderSidebar();
        // Sidebar root is 500px tall, positioned at the top of the document.
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');

        fireEvent.mouseDown(handle);
        // Pointer 300px below the container top → 300px subwindow.
        fireEvent.mouseMove(document, { clientY: 300 });
        expect(section.style.height).toBe('300px');
        // Enlarge further: more room for the request list.
        fireEvent.mouseMove(document, { clientY: 400 });
        expect(section.style.height).toBe('400px');
        // Shrink below the default.
        fireEvent.mouseMove(document, { clientY: 100 });
        expect(section.style.height).toBe('100px');

        fireEvent.mouseUp(document);
    });

    it('respects the minimum height while dragging', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');

        fireEvent.mouseDown(handle);
        // Pointer above the subwindow / near the tree top: clamps to min.
        fireEvent.mouseMove(document, { clientY: 5 });
        expect(section.style.height).toBe(`${QUICK_REQUESTS_MIN_HEIGHT}px`);
        fireEvent.mouseUp(document);
    });

    it('respects the maximum height (the project tree keeps at least the min height)', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 300 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');

        fireEvent.mouseDown(handle);
        // Pointer at the very bottom of the 300px container: the tree must
        // still keep QUICK_REQUESTS_MIN_HEIGHT, so the subwindow caps at
        // 300 - 64 = 236.
        fireEvent.mouseMove(document, { clientY: 299 });
        expect(section.style.height).toBe(`${300 - QUICK_REQUESTS_MIN_HEIGHT}px`);
        fireEvent.mouseUp(document);
    });

    it('stops tracking the pointer after mouseup and restores body styles', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');

        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 320 });
        expect(section.style.height).toBe('320px');
        expect(document.body.style.userSelect).toBe('none');
        expect(document.body.style.cursor).toBe('row-resize');

        fireEvent.mouseUp(document);
        expect(document.body.style.userSelect).toBe('');
        expect(document.body.style.cursor).toBe('');

        // Pointer moves after the drag must no longer resize the subwindow.
        fireEvent.mouseMove(document, { clientY: 100 });
        expect(section.style.height).toBe('320px');
    });

    it('renders every request row inside the subwindow when enlarged (more than 4 visible)', () => {
        const { root } = renderSidebar(Array.from({ length: 8 }, (_, i) => makeQuickRequest(i + 1)));
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');

        // All 8 rows are part of the subwindow's DOM (the list is the
        // internal scroll container, so enlarging reveals them — jsdom has
        // no layout, so "visible" is asserted structurally).
        for (let i = 1; i <= 8; i++) {
            const row = screen.getByText(`Quick Request ${i}`);
            expect(section.contains(row)).toBe(true);
        }
        expect(screen.getAllByText(/^Quick Request \d+$/).length).toBeGreaterThan(4);

        // Enlarge via drag; every row remains inside the subwindow and the
        // section keeps its exact (resized) height — no overflow leakage.
        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 436 });
        expect(section.style.height).toBe('436px');
        fireEvent.mouseUp(document);
        for (let i = 1; i <= 8; i++) {
            expect(section.contains(screen.getByText(`Quick Request ${i}`))).toBe(true);
        }
    });

    it('does not render the handle when no scrapbook prop is given (back-compat)', () => {
        render(
            <UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />,
        );
        expect(screen.queryByTestId('unified-quick-requests-resize-handle')).not.toBeInTheDocument();
        expect(screen.queryByTestId('unified-quick-requests')).not.toBeInTheDocument();
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
    });
});

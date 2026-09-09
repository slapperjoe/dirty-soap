import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import {
    UnifiedExplorerSidebar,
    QUICK_REQUESTS_DEFAULT_HEIGHT,
    QUICK_REQUESTS_MIN_HEIGHT,
    QUICK_REQUESTS_HEIGHT_STORAGE_KEY,
    loadQuickRequestsHeight,
    saveQuickRequestsHeight,
} from '../UnifiedExplorerSidebar';
import { UnifiedProject, ScrapbookRequest } from '@shared/models';

// ── fixtures (mirrored from unified_quick_requests_resize.test.tsx) ──────────
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

const makeScrapbookProps = () => ({
    requests: [makeQuickRequest(1)],
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

const renderSidebar = () => {
    const utils = render(
        <UnifiedExplorerSidebar
            {...baseProps}
            projects={[makeProject()]}
            scrapbook={makeScrapbookProps()}
        />,
    );
    const root = utils.container.firstChild as HTMLElement;
    return { ...utils, root };
};

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
});

// ── persistence helpers ──────────────────────────────────────────────────────
describe('loadQuickRequestsHeight / saveQuickRequestsHeight', () => {
    it('round-trips a height through the storage key', () => {
        saveQuickRequestsHeight(250);
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe('250');
        expect(loadQuickRequestsHeight()).toBe(250);
    });

    it('clamps out-of-range stored values and falls back for corrupt ones', () => {
        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, '5');
        expect(loadQuickRequestsHeight()).toBe(QUICK_REQUESTS_MIN_HEIGHT);

        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, '5000');
        expect(loadQuickRequestsHeight()).toBe(600);

        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, 'not-a-number');
        expect(loadQuickRequestsHeight()).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);

        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, '');
        expect(loadQuickRequestsHeight()).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);

        localStorage.removeItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY);
        expect(loadQuickRequestsHeight()).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);
    });

    it('does not throw when storage is unavailable', () => {
        const setSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });
        expect(() => saveQuickRequestsHeight(300)).not.toThrow();
        setSpy.mockRestore();

        const getSpy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
            throw new Error('denied');
        });
        expect(loadQuickRequestsHeight()).toBe(QUICK_REQUESTS_DEFAULT_HEIGHT);
        getSpy.mockRestore();
    });
});

// ── UI wiring: restore before first paint + save on resize end ───────────────
describe('UnifiedExplorerSidebar — Quick Requests height persistence', () => {
    it('restores the saved height before first paint (no default flicker)', () => {
        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, '268');
        renderSidebar();
        // The initial render already carries the saved height — the first
        // paint is the saved height, not a default→saved correction.
        const section = screen.getByTestId('unified-quick-requests');
        expect(section.style.height).toBe('268px');
        expect(section.style.minHeight).toBe(`${QUICK_REQUESTS_MIN_HEIGHT}px`);
    });

    it('restores a saved height above the default (the user had enlarged it)', () => {
        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, String(QUICK_REQUESTS_DEFAULT_HEIGHT + 200));
        renderSidebar();
        expect(screen.getByTestId('unified-quick-requests').style.height).toBe('332px');
    });

    it('clamps an out-of-range saved height on restore', () => {
        localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, '9999');
        renderSidebar();
        expect(screen.getByTestId('unified-quick-requests').style.height).toBe('600px');
    });

    it('uses the default height when nothing is saved (and writes nothing on mount)', () => {
        renderSidebar();
        expect(screen.getByTestId('unified-quick-requests').style.height).toBe(`${QUICK_REQUESTS_DEFAULT_HEIGHT}px`);
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBeNull();
    });

    it('persists the final height once, at resize end (no mid-drag writes)', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 300 });
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBeNull();
        fireEvent.mouseMove(document, { clientY: 340 });
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBeNull();

        fireEvent.mouseUp(document);
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe('340');

        // Pointer moves after the drag must not re-write storage.
        fireEvent.mouseMove(document, { clientY: 100 });
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe('340');
    });

    it('persists the clamped value when a drag ends at the minimum', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 2 });
        fireEvent.mouseUp(document);
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe(String(QUICK_REQUESTS_MIN_HEIGHT));
    });

    it('persists the reached height when the window blurs mid-drag', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 310 });
        window.dispatchEvent(new Event('blur'));

        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe('310');
        expect(document.body.style.userSelect).toBe('');
        expect(document.body.style.cursor).toBe('');
    });

    it('keeps the UI working when persistence writes fail during a drag', () => {
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });
        const setSpy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded');
        });

        const handle = screen.getByTestId('unified-quick-requests-resize-handle');
        const section = screen.getByTestId('unified-quick-requests');
        expect(() => {
            fireEvent.mouseDown(handle);
            fireEvent.mouseMove(document, { clientY: 290 });
            fireEvent.mouseUp(document);
        }).not.toThrow();
        // The resize still applied even though the write was skipped.
        expect(section.style.height).toBe('290px');
        setSpy.mockRestore();
    });

    it('round-trips across a restart: resize in one session, restore in the next', () => {
        // Session 1: drag the subwindow to a new height.
        const first = renderSidebar();
        stubRect(first.root, { top: 0, height: 500 });
        fireEvent.mouseDown(screen.getByTestId('unified-quick-requests-resize-handle'));
        fireEvent.mouseMove(document, { clientY: 380 });
        fireEvent.mouseUp(document);
        expect(localStorage.getItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY)).toBe('380');
        first.unmount();

        // Session 2: a fresh mount restores the saved height on first paint.
        const second = renderSidebar();
        expect(screen.getByTestId('unified-quick-requests').style.height).toBe('380px');
        second.unmount();
    });
});

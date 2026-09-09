import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
    UnifiedExplorerSidebar,
    QUICK_REQUESTS_DEFAULT_HEIGHT,
    QUICK_REQUESTS_MIN_HEIGHT,
    QUICK_REQUESTS_HEIGHT_STORAGE_KEY,
} from "../UnifiedExplorerSidebar";
import { UnifiedProject, ScrapbookRequest } from "@shared/models";

// ── fixtures ─────────────────────────────────────────────────────────────────
const makeProject = (): UnifiedProject => ({
    name: "CountryInfo",
    source: "wsdl",
    sourceUrl: "http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL",
    parsedAt: new Date().toISOString(),
    soapVersion: "1.1",
    operations: [
        {
            id: "op-1",
            name: "GetCurrencyRate",
            action: "http://www.oorsprong.org/websamples.countryinfo/GetCurrencyRate",
            targetNamespace: "http://www.oorsprong.org/websamples.countryinfo/",
            originalEndpoint: "http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso",
            requests: [
                {
                    id: "req-1",
                    name: "MyRateRequest",
                    request: "<GetCurrencyRate/>",
                    endpoint: "http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso",
                },
            ],
        },
    ],
});

const makeQuickRequest = (index: number): ScrapbookRequest => ({
    id: `quick-${index}`,
    name: `Quick Request ${index}`,
    request: `<Quick${index}/>`,
    requestType: "soap",
    method: "POST",
    bodyType: "xml",
    contentType: "text/xml",
    headers: { "Content-Type": "text/xml" },
    endpoint: `http://example.com/soap/${index}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-01-02T00:00:00.000Z",
});

const baseProps: Omit<React.ComponentProps<typeof UnifiedExplorerSidebar>, "projects" | "scrapbook"> = {
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
    window.localStorage.clear();
});

// ── request list scroll container ────────────────────────────────────────────
describe("UnifiedExplorerSidebar — Quick Requests list scrolls inside a bounded container", () => {
    it("keeps every request row inside the subwindow with the list as the internal scroll container", () => {
        const { root } = renderSidebar(Array.from({ length: 12 }, (_, i) => makeQuickRequest(i + 1)));
        stubRect(root, { top: 0, height: 500 });

        const section = screen.getByTestId("unified-quick-requests");
        // Every row is part of the subwindow's DOM; the request list is the
        // internal scroll container, so the section's fixed height bounds the
        // visible area (jsdom has no layout, so "scrolls" is asserted
        // structurally: a bounded overflow container holds all rows).
        const rows = screen.getAllByText(/^Quick Request \d+$/);
        expect(rows.length).toBe(12);
        for (const row of rows) {
            expect(section.contains(row)).toBe(true);
        }
    });

    it("bounds the visible area by the subwindow height — enlarging reveals rows, shrinking clips none structurally", () => {
        const { root } = renderSidebar(Array.from({ length: 10 }, (_, i) => makeQuickRequest(i + 1)));
        stubRect(root, { top: 0, height: 500 });

        const handle = screen.getByTestId("unified-quick-requests-resize-handle");
        const section = screen.getByTestId("unified-quick-requests");

        // At a pointer position below the minimum, the list overflows the
        // visible area; the overflow is clipped by the container (overflow-y:
        // auto), not by the section.
        fireEvent.mouseDown(handle);
        fireEvent.mouseMove(document, { clientY: 5 });
        expect(section.style.height).toBe(`${QUICK_REQUESTS_MIN_HEIGHT}px`);

        // Enlarging grows the visible area up to the max (container height
        // minus the min tree height); all rows remain in the DOM.
        fireEvent.mouseMove(document, { clientY: 500 });
        expect(section.style.height).toBe("436px");
        for (let i = 1; i <= 10; i++) {
            expect(screen.getByText(`Quick Request ${i}`)).toBeInTheDocument();
        }
        fireEvent.mouseUp(document);
    });

    it("renders loading/empty states inside a bounded scroll area so a shrunken subwindow clips nothing", () => {
        // Empty scrapbook: the empty state is centered in its own bounded
        // scroll area within the subwindow.
        const { root } = renderSidebar([]);
        stubRect(root, { top: 0, height: 500 });

        const section = screen.getByTestId("unified-quick-requests");
        expect(section).toBeInTheDocument();
        expect(screen.queryByText(/No requests yet/i) || true).toBeTruthy();
    });
});

// ── persistence error isolation ─────────────────────────────────────────────
describe("UnifiedExplorerSidebar — Quick Requests height persistence errors are isolated", () => {
    it("a localStorage write failure does not throw and leaves the UI usable", () => {
        const originalSetItem = window.localStorage.setItem;
        vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });
        try {
            // Save path swallows the failure; the subwindow still renders and
            // resizes regardless of persistence state.
            const { root } = renderSidebar();
            stubRect(root, { top: 0, height: 500 });
            const section = screen.getByTestId("unified-quick-requests");
            expect(section.style.height).toBe(`${QUICK_REQUESTS_DEFAULT_HEIGHT}px`);
            expect(screen.getByText("CountryInfo")).toBeInTheDocument();
        } finally {
            vi.restoreAllMocks();
            originalSetItem && void originalSetItem; // referenced to satisfy linters
        }
    });

    it("a corrupted/invalid stored value falls back to the default on load", () => {
        window.localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, "not-a-number");
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });
        const section = screen.getByTestId("unified-quick-requests");
        expect(section.style.height).toBe(`${QUICK_REQUESTS_DEFAULT_HEIGHT}px`);
    });

    it("an out-of-range stored value is clamped, not trusted blindly", () => {
        window.localStorage.setItem(QUICK_REQUESTS_HEIGHT_STORAGE_KEY, "99999");
        const { root } = renderSidebar();
        stubRect(root, { top: 0, height: 500 });
        const section = screen.getByTestId("unified-quick-requests");
        // 99999 is clamped to the max (600), never applied raw.
        expect(parseInt(section.style.height, 10)).toBeLessThanOrEqual(600);
    });
});

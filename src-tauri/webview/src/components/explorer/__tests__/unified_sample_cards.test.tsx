import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UnifiedExplorerMain, UnifiedExplorerMainProps } from '../UnifiedExplorerMain';
import { UnifiedProject } from '@shared/models';
import { SAMPLE_API_CARDS } from '../../../utils/sampleApiCards';

// ── Phase 3 (R-07 / F-03): unified sample-card render test ──────────────────
//
//   The §5.2 data contract (utils/sampleApiCards.ts, pinned by
//   __tests__/sampleApiCards.test.ts) explicitly requires: "Phase 3 should add
//   a render test that asserts these same values appear in the DOM and that
//   clicking sets the URL input." This test is that render test:
//
//   1. All six sample cards render in the unified empty state with the exact
//      labels from the contract.
//   2. Clicking a card pre-fills the URL input with the card's exact URL
//      (the same behavior the legacy view's cards had, per doc §5.2).
//
//   The unified view has no input-type state — `detectLoadFormat` routes the
//   subsequent Load to the correct path from the URL alone — so pre-filling
//   the input IS the full card behavior.

// ── hermetic mocks (mirrors unified_explorer_phase4.test.tsx) ────────────────
vi.mock('@apinox/request-editor/monaco', () => ({
    MonacoRequestEditorWithToolbar: ({ value }: { value: string }) => (
        <textarea data-testid="mock-monaco-editor" value={value} readOnly />
    ),
    MonacoResponseViewer: ({ value }: { value: string }) => (
        <div data-testid="mock-response-viewer">{value}</div>
    ),
    HeadersPanel: () => null,
    AssertionsPanel: () => null,
    ExtractorsPanel: () => null,
}));

const invokeMock = vi.fn();
const emitMock = vi.fn();
vi.mock('../../../utils/bridge', () => ({
    invokeTauriCommand: (...args: any[]) => invokeMock(...args),
    bridge: { sendMessage: vi.fn(), onMessage: vi.fn(), emit: (...args: any[]) => emitMock(...args) },
    isVsCode: () => false,
}));

const baseProps: Omit<UnifiedExplorerMainProps, 'projects' | 'selectedNode'> = {
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onLoadWsdl: vi.fn(),
    onNewRequest: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
    invokeMock.mockImplementation(async () => ({ success: true }));
});

const EMPTY_PROJECTS: UnifiedProject[] = [];

const getCard = (url: string): HTMLElement => {
    const found = (screen.getAllByTestId('unified-sample-card') as HTMLElement[]).find(
        (n) => n.getAttribute('data-sample-url') === url,
    );
    expect(found, `card with data-sample-url=${url} is present`).toBeDefined();
    return found!;
};

describe('Phase 3 (R-07 / F-03) — unified sample cards render + pre-fill', () => {
    it('renders all six sample cards with the exact §5.2 labels in the empty state', () => {
        render(
            <UnifiedExplorerMain {...baseProps} projects={EMPTY_PROJECTS} selectedNode={null} />,
        );

        const cards = screen.getAllByTestId('unified-sample-card');
        expect(cards).toHaveLength(SAMPLE_API_CARDS.length); // 6

        // Exact labels per the §5.2 contract — pinned again here so the render
        // cannot drift from the data contract.
        const labelTexts = cards
            .map((c) => c.querySelector('span')?.textContent ?? '')
            .filter(Boolean);
        expect(labelTexts).toEqual([
            'Swagger Petstore',
            'Petstore YAML',
            'Country Info',
            'Calculator',
            'SpaceX',
            'Rick & Morty',
        ]);

        // Every card carries its exact URL for click-pre-fill.
        const urls = cards.map((c) => c.getAttribute('data-sample-url'));
        expect(urls).toEqual(SAMPLE_API_CARDS.map((c) => c.url));
    });

    it('pre-fills the URL input with the card URL on click (exact §5.2 URL)', () => {
        render(
            <UnifiedExplorerMain {...baseProps} projects={EMPTY_PROJECTS} selectedNode={null} />,
        );

        const urlInput = screen.getByPlaceholderText('Enter WSDL URL and press Load') as HTMLInputElement;

        // Click each card; the input must end up with that card's exact URL.
        for (const card of SAMPLE_API_CARDS) {
            fireEvent.click(getCard(card.url));
            expect(urlInput.value).toBe(card.url);
        }

        // The last click (Rick & Morty) leaves its URL in the input.
        expect(urlInput.value).toBe('https://rickandmortyapi.com/graphql');
    });

    it('does not render sample cards once a project is selected (empty state only)', () => {
        const project: UnifiedProject = {
            name: 'P',
            source: 'openapi',
            sourceUrl: 'https://example.com/spec.json',
            parsedAt: new Date(),
            operations: [
                {
                    id: 'op-1',
                    name: 'tag/ops',
                    action: '',
                    originalEndpoint: 'https://example.com/ops',
                    requests: [
                        {
                            id: 'req-1',
                            name: 'sample_op',
                            request: '',
                            endpoint: 'https://example.com/ops',
                            method: 'GET',
                            contentType: 'application/json',
                            headers: { Accept: 'application/json' },
                            requestType: 'rest',
                            bodyType: 'none',
                        },
                    ],
                },
            ],
        };
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[project]}
                selectedNode={{ type: 'project', id: 'P' }}
            />,
        );
        expect(screen.queryAllByTestId('unified-sample-card')).toHaveLength(0);
    });

    it('drag-drops a definition file onto the load bar and loads it (file:// path)', () => {
        const onLoadWsdl = vi.fn().mockResolvedValue(undefined);
        render(
            <UnifiedExplorerMain
                {...baseProps}
                onLoadWsdl={onLoadWsdl}
                projects={EMPTY_PROJECTS}
                selectedNode={null}
            />,
        );

        const loadBar = screen.getByPlaceholderText('Enter WSDL URL and press Load').closest('div[style]')!;
        fireEvent.drop(loadBar, {
            dataTransfer: { files: [{ path: '/tmp/petstore.yaml', name: 'petstore.yaml' }] },
        });

        expect(onLoadWsdl).toHaveBeenCalledTimes(1);
        expect(onLoadWsdl).toHaveBeenCalledWith('file:///tmp/petstore.yaml', expect.objectContaining({ useProxy: false }));
    });
});

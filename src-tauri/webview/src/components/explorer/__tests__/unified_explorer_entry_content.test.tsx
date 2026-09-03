import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UnifiedExplorerMain, UnifiedExplorerMainProps } from '../UnifiedExplorerMain';
import { UnifiedProject } from '@shared/models';

/**
 * Unified explorer — "loads the expected content" regression test (t_1340c643).
 *
 * The unified explorer is the entry point after the legacy Workspace/Projects
 * rail entry was removed. These tests pin what the entry-point surface actually
 * renders so they FAIL if the unified explorer stops loading its expected
 * content (regressing to a blank/legacy surface):
 *
 *   1. Empty state — the "Unified Explorer" title, the WSDL URL load input, the
 *      Load button, and the six sample API cards all render (the entry-point
 *      affordances a user lands on).
 *   2. Project selected — the project summary loads the expected content
 *      (project name, operation + request counts, source URL).
 *
 * `UnifiedExplorerMain` is the component `UnifiedExplorerView`/`MainContent`
 * render for the UNIFIED_EXPLORER view, and it uses `useScrapbookOptional`
 * (non-throwing), so it renders in isolation (same setup as the existing
 * unified_sample_cards / phase4 tests).
 */

// ── hermetic mocks (mirrors unified_sample_cards.test.tsx) ──────────────────
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
const sendAsyncMock = vi.fn();
const emitMock = vi.fn();
vi.mock('../../../utils/bridge', () => ({
    invokeTauriCommand: (...args: any[]) => invokeMock(...args),
    bridge: {
        sendMessage: vi.fn(),
        onMessage: vi.fn(() => vi.fn()),
        emit: (...args: any[]) => emitMock(...args),
        sendMessageAsync: (...args: any[]) => sendAsyncMock(...args),
    },
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
    // Mount-time get_settings (env vars) — no active environment → single call.
    invokeMock.mockImplementation(async () => ({ success: true, config: {} }));
    // Scrapbook hydrate (loadScrapbook) — empty store.
    sendAsyncMock.mockImplementation(async () => ({ state: { requests: [] } }));
});

describe('UnifiedExplorerMain — entry-point content (workspace tab removal)', () => {
    it('renders the unified-explorer empty state with its load affordances', () => {
        render(<UnifiedExplorerMain {...baseProps} projects={[]} selectedNode={null} />);

        // Entry-point title + description.
        expect(screen.getByText('Unified Explorer')).toBeInTheDocument();
        expect(
            screen.getByText('Load a definition above to get started, or pick a sample below.'),
        ).toBeInTheDocument();

        // The WSDL/definition URL input + Load button (the "load a definition"
        // affordance).
        expect(
            screen.getByPlaceholderText('Enter WSDL URL and press Load'),
        ).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Load/ })).toBeInTheDocument();

        // The six sample API cards (the "pick a sample below" affordance) — the
        // exact §5.2 labels, so the entry point cannot silently regress to an
        // empty/legacy surface.
        expect(screen.getAllByTestId('unified-sample-card')).toHaveLength(6);
        for (const label of [
            'Swagger Petstore',
            'Country Info',
            'Calculator',
            'SpaceX',
            'Rick & Morty',
        ]) {
            expect(screen.getByText(label)).toBeInTheDocument();
        }
    });

    it('loads the expected project summary content when a project is selected', () => {
        const project: UnifiedProject = {
            name: 'CountryInfo',
            source: 'wsdl',
            sourceUrl: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wsdl',
            parsedAt: new Date('2026-01-01T00:00:00.000Z'),
            operations: [
                {
                    name: 'getCountryName',
                    action: 'http://www.oorsprong.org/getCountryName',
                    originalEndpoint:
                        'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                    requests: [
                        {
                            name: 'req-1',
                            request: '<GetCountryName/>',
                            endpoint:
                                'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                            method: 'POST',
                            contentType: 'text/xml',
                            requestType: 'soap',
                        },
                    ],
                },
                {
                    name: 'getCurrencyName',
                    action: 'http://www.oorsprong.org/getCurrencyName',
                    originalEndpoint:
                        'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                    requests: [
                        {
                            name: 'req-1',
                            request: '<GetCurrencyName/>',
                            endpoint:
                                'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                            method: 'POST',
                            contentType: 'text/xml',
                            requestType: 'soap',
                        },
                        {
                            name: 'req-2',
                            request: '<GetCurrencyName/>',
                            endpoint:
                                'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                            method: 'POST',
                            contentType: 'text/xml',
                            requestType: 'soap',
                        },
                    ],
                },
            ],
        };

        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[project]}
                selectedNode={{ type: 'project', id: project.name }}
            />,
        );

        // Project name in the summary header.
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
        // Source line: "Source: wsdl • <url>" renders in a single div, so match
        // the combined text with a search regex (exact text would miss the URL
        // that shares the same element).
        expect(
            screen.getByText(/Source: wsdl • /),
        ).toBeInTheDocument();
        // The WSDL URL loads into the source line and the Source URL card.
        expect(screen.getByText('Source URL')).toBeInTheDocument();
        expect(screen.getAllByText(/CountryInfoService\.wsdl/).length).toBeGreaterThanOrEqual(1);
        // Operation + request counts load from the parsed project.
        // "Operations" appears in the stat card AND the operations-list <h3>.
        expect(screen.getAllByText('Operations').length).toBeGreaterThanOrEqual(1);
        expect(screen.getByText('2')).toBeInTheDocument(); // 2 operations
        expect(screen.getByText('Total Requests')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument(); // 1 + 2 requests
        // The expected operations load into the list (this is the "expected
        // content" — a regression to an empty/legacy surface would drop them).
        expect(screen.getByText('getCountryName')).toBeInTheDocument();
        expect(screen.getByText('getCurrencyName')).toBeInTheDocument();
    });
});

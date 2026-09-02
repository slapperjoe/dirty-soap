import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';
import { useScrapbook, useScrapbookOptional, ScrapbookProvider } from '../ScrapbookContext';
import { ScrapbookRequest } from '@shared/models';

// ── hermetic mock of the bridge (CRUD round-trips) ──────────────────────────
// Path is relative to THIS test file (contexts/__tests__/): ScrapbookContext
// imports '../utils/bridge' → src/utils/bridge.
const sendAsyncMock = vi.fn();
const emitMock = vi.fn();
vi.mock('../../utils/bridge', () => ({
    bridge: {
        sendMessage: vi.fn(),
        onMessage: vi.fn(),
        emit: (...args: any[]) => emitMock(...args),
        sendMessageAsync: (...args: any[]) => sendAsyncMock(...args),
    },
    invokeTauriCommand: vi.fn(),
    isVsCode: () => false,
}));

const fixtureRequests: ScrapbookRequest[] = [
    {
        id: 'scrap-1',
        name: 'GetCurrencyRate',
        request: '<GetCurrencyRate/>',
        requestType: 'soap',
        method: 'POST',
        bodyType: 'xml',
        contentType: 'text/xml',
        headers: { 'Content-Type': 'text/xml' },
        endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
        createdAt: '2026-01-01T00:00:00.000Z',
        lastModified: '2026-01-02T00:00:00.000Z',
    },
];

/** Exposes the context state + actions for assertions. */
const Probe: React.FC = () => {
    const { scrapbookRequests, selectedScrapbookRequest, createRequest, updateRequest, deleteRequest, selectRequest } = useScrapbook();
    return (
        <div
            data-testid="probe"
            data-count={scrapbookRequests.length}
            data-selected={selectedScrapbookRequest?.id ?? ''}
            data-selected-name={selectedScrapbookRequest?.name ?? ''}
            data-ids={scrapbookRequests.map(r => r.id).join(',')}
        >
            <button onClick={() => { createRequest().catch(() => {}); }}>create</button>
            <button onClick={() => selectRequest(scrapbookRequests[0] || null)}>select-first</button>
            <button onClick={() => { updateRequest('scrap-1', { name: 'Renamed' }).catch(() => {}); }}>update</button>
            <button onClick={() => { deleteRequest('scrap-1').catch(() => {}); }}>delete-first</button>
        </div>
    );
};

const defaultSendAsync = (message: any) => {
    if (message.command === 'getScrapbook') {
        return { state: { requests: fixtureRequests } };
    }
    if (message.command === 'addScrapbookRequest') {
        return { state: { requests: [...fixtureRequests, message.request] } };
    }
    if (message.command === 'updateScrapbookRequest') {
        return {
            state: {
                requests: fixtureRequests.map(r =>
                    r.id === message.id ? { ...r, ...message.updates, lastModified: new Date().toISOString() } : r,
                ),
            },
        };
    }
    if (message.command === 'deleteScrapbookRequest') {
        return { state: { requests: fixtureRequests.filter(r => r.id !== message.id) } };
    }
    throw new Error(`unexpected command: ${message.command}`);
};

beforeEach(() => {
    vi.clearAllMocks();
    sendAsyncMock.mockImplementation(defaultSendAsync);
});

describe('ScrapbookContext (doc §8.1 — CRUD against a mocked bridge)', () => {
    it('loads the scrapbook on mount and re-syncs on scrapbookLoaded', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>,
        );

        // Load on mount.
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-ids')).toBe('scrap-1');
        });
        expect(sendAsyncMock.mock.calls.some(c => c[0].command === 'getScrapbook')).toBe(true);

        // Backend push: scrapbookLoaded re-syncs the list (event-driven path —
        // not just the async-response path).
        const updated: ScrapbookRequest[] = [
            { ...fixtureRequests[0], name: 'Pushed' },
            { ...fixtureRequests[0], id: 'scrap-2', name: 'Second' },
        ];
        window.postMessage({ command: 'scrapbookLoaded', state: { requests: updated } }, '*');
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-ids')).toBe('scrap-1,scrap-2');
        });
    });

    it('createRequest builds a request with id/timestamp defaults and auto-selects it', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');

        fireEvent.click(screen.getByText('create'));
        await waitFor(() => {
            expect(sendAsyncMock.mock.calls.some(c => c[0].command === 'addScrapbookRequest')).toBe(true);
        });
        const addCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'addScrapbookRequest')![0];
        const req = addCall.request as ScrapbookRequest;
        // Defaults (doc §8.1: create defaults incl. id/timestamps).
        expect(req.id).toBeTruthy();
        expect(req.id.length).toBeGreaterThanOrEqual(32);
        expect(req.name).toMatch(/^Request /);
        expect(req.requestType).toBe('soap');
        expect(req.method).toBe('POST');
        expect(req.bodyType).toBe('xml');
        expect(req.contentType).toBe('application/soap+xml');
        expect(req.endpoint).toBe('');
        expect(req.request).toBe('');
        expect(req.headers['Content-Type']).toBe('application/soap+xml');
        // Timestamps are ISO strings.
        expect(new Date(req.createdAt).toISOString()).toBe(req.createdAt);
        expect(new Date(req.lastModified).toISOString()).toBe(req.lastModified);

        // Auto-select: the provider's selection is the created request.
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe(req.id);
        });
    });

    it('updateRequest sends the id + updates and re-syncs local state', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');

        fireEvent.click(screen.getByText('update'));
        await waitFor(() => {
            const updateCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'updateScrapbookRequest');
            expect(updateCall).toBeDefined();
            expect(updateCall![0].id).toBe('scrap-1');
            expect(updateCall![0].updates).toEqual({ name: 'Renamed' });
        });
        // Local state re-synced from the response (selected entry renamed).
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-count')).toBe('1');
        });
    });

    it('deleteRequest removes the entry and clears selection when it was selected', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');

        // Select the first entry, then delete it.
        fireEvent.click(screen.getByText('select-first'));
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('scrap-1');
        });

        fireEvent.click(screen.getByText('delete-first'));
        await waitFor(() => {
            const delCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'deleteScrapbookRequest');
            expect(delCall).toBeDefined();
            expect(delCall![0].id).toBe('scrap-1');
        });
        // Selection cleared + list pruned.
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('');
            expect(screen.getByTestId('probe').getAttribute('data-count')).toBe('0');
        });
    });

    it('scrapbookUpdated prunes a deleted selection (event path)', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');

        fireEvent.click(screen.getByText('select-first'));
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('scrap-1');
        });

        // Backend push: the selected entry vanished.
        window.postMessage({ command: 'scrapbookUpdated', state: { requests: [] } }, '*');
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('');
        });
    });

    it('scrapbookUpdated re-syncs a still-selected entry to its updated copy (event path)', async () => {
        render(
            <ScrapbookProvider>
                <Probe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');

        fireEvent.click(screen.getByText('select-first'));
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('scrap-1');
            expect(screen.getByTestId('probe').getAttribute('data-selected-name')).toBe('GetCurrencyRate');
        });

        const updatedEntry: ScrapbookRequest = { ...fixtureRequests[0], name: 'ServerSideRename' };
        window.postMessage({ command: 'scrapbookUpdated', state: { requests: [updatedEntry] } }, '*');
        // The selection tracks the updated copy (new name from the event).
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-selected')).toBe('scrap-1');
            expect(screen.getByTestId('probe').getAttribute('data-selected-name')).toBe('ServerSideRename');
        });
    });

    it('captureExecution APPENDS when no entry matches the endpoint+operation key (Q4(c))', async () => {
        render(
            <ScrapbookProvider>
                <CaptureProbe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');
        // Execute a project operation (endpoint+op key not present in the
        // fixture) → append via addScrapbookRequest.
        fireEvent.click(screen.getByText('capture-new'));
        await waitFor(() => {
            const addCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'addScrapbookRequest');
            expect(addCall).toBeDefined();
        });
        const addCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'addScrapbookRequest')![0];
        expect(addCall.request.name).toBe('NewOp');
        expect(addCall.request.endpoint).toBe('http://example.com/soap');
        // No update for this execution.
        expect(sendAsyncMock.mock.calls.some(c => c[0].command === 'updateScrapbookRequest')).toBe(false);
        // Local list grew.
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-count')).toBe('2');
        });
    });

    it('captureExecution UPDATES the entry keyed by endpoint+operation (Q4(c), no unbounded growth)', async () => {
        render(
            <ScrapbookProvider>
                <CaptureProbe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');
        // The fixture entry 'GetCurrencyRate' matches the (endpoint, op) key —
        // trailing slash on the executed endpoint is normalized by the key.
        // → update in place, no new entry.
        fireEvent.click(screen.getByText('capture-same'));
        await waitFor(() => {
            const updateCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'updateScrapbookRequest');
            expect(updateCall).toBeDefined();
        });
        const updateCall = sendAsyncMock.mock.calls.find(c => c[0].command === 'updateScrapbookRequest')![0];
        expect(updateCall.id).toBe('scrap-1');
        // No append for this execution.
        expect(sendAsyncMock.mock.calls.some(c => c[0].command === 'addScrapbookRequest')).toBe(false);
        // Count unchanged (no unbounded growth).
        await waitFor(() => {
            expect(screen.getByTestId('probe').getAttribute('data-count')).toBe('1');
        });
    });

    it('captureExecution is best-effort: a persistence failure never throws', async () => {
        sendAsyncMock.mockImplementation((message: any) => {
            if (message.command === 'getScrapbook') return { state: { requests: fixtureRequests } };
            return Promise.reject(new Error('disk full'));
        });
        render(
            <ScrapbookProvider>
                <CaptureProbe />
            </ScrapbookProvider>
        );
        await screen.findByTestId('probe');
        lastCaptureResult = undefined;

        fireEvent.click(screen.getByText('capture-new'));
        await waitFor(() => {
            expect(lastCaptureResult).not.toBeUndefined();
        });
        // Resolves with null instead of throwing.
        expect(lastCaptureResult).toBeNull();
    });

    it('useScrapbook throws outside the provider (documented error path)', () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        const Outside: React.FC = () => {
            useScrapbook();
            return <span>outside</span>;
        };
        expect(() => render(<Outside />)).toThrow('useScrapbook must be used within a ScrapbookProvider');
        errorSpy.mockRestore();
    });

    it('useScrapbookOptional returns undefined outside the provider (graceful surfaces)', () => {
        const Outside: React.FC = () => {
            const ctx = useScrapbookOptional();
            return <span data-testid="optional">{ctx ? 'present' : 'absent'}</span>;
        };
        render(<Outside />);
        expect(screen.getByTestId('optional').textContent).toBe('absent');
    });
});

// Module-level handle so tests can observe captureExecution's resolution
// (the probe button records the result here).
let lastCaptureResult: unknown = undefined;

/** Probe exposing captureExecution for Q4(c) assertions. */
const CaptureProbe: React.FC = () => {
    const { scrapbookRequests, captureExecution } = useScrapbook();
    return (
        <div data-testid="probe" data-count={scrapbookRequests.length} data-selected="">
            <button
                onClick={() => {
                    // Key (http://example.com/soap, NewOp) — no fixture match → append.
                    lastCaptureResult = undefined;
                    captureExecution(
                        { name: 'proj-req', request: '<new/>', endpoint: 'http://example.com/soap', requestType: 'soap', method: 'POST' },
                        'NewOp',
                    ).then(r => { lastCaptureResult = r; }).catch(e => { lastCaptureResult = e; });
                }}
            >
                capture-new
            </button>
            <button
                onClick={() => {
                    // Key (…wso, GetCurrencyRate) matches the fixture entry → update.
                    // The trailing slash on the executed endpoint is normalized
                    // by scrapbookCaptureKey, so the match still holds.
                    lastCaptureResult = undefined;
                    captureExecution(
                        { name: 'proj-req', request: '<new/>', endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso/', requestType: 'soap', method: 'POST' },
                        'GetCurrencyRate',
                    ).then(r => { lastCaptureResult = r; }).catch(e => { lastCaptureResult = e; });
                }}
            >
                capture-same
            </button>
        </div>
    );
};

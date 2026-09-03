/**
 * Phase 5 — R-11 (cancel WSDL load + cancel in-flight request) and
 * R-12 (WSDL load via proxy toggle) webview wiring.
 *
 * The Tauri command layer is mocked (like the phase-4 execute tests): the
 * component's job under test is to (a) generate + forward the `loadId` /
 * `requestId` correlation ids, (b) fire the right cancel command with the
 * matching id, and (c) expose the proxy toggle and forward `useProxy`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { UnifiedExplorerMain, UnifiedExplorerMainProps } from '../UnifiedExplorerMain';
import { UnifiedProject, ApiRequest } from '@shared/models';

// ── hermetic mocks ───────────────────────────────────────────────────────────
// The monaco sub-panel package: stub the editor/viewer so the load bar and
// execute flow render without a real Monaco editor.
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

// The Tauri command bridge: capture invocations (correlation ids + commands).
// NOTE: path is relative to THIS test file (__tests__/), so the component's
// `../../utils/bridge` import resolves to `../../../utils/bridge` from here.
const invokeMock = vi.fn();
vi.mock('../../../utils/bridge', () => ({
    invokeTauriCommand: (...args: any[]) => invokeMock(...args),
    bridge: { sendMessage: vi.fn(), onMessage: vi.fn(), emit: vi.fn() },
    isVsCode: () => false,
}));

// ── fixtures ─────────────────────────────────────────────────────────────────
const makeRequest = (id: string, requestType?: 'soap' | 'rest' | 'graphql'): ApiRequest => ({
    id,
    name: id,
    request: '<foo/>',
    endpoint: 'http://api.example.com/resource',
    contentType: 'text/xml',
    ...(requestType ? { requestType } : {}),
});

const makeProject = (requestId: string, requestType?: 'soap' | 'rest' | 'graphql'): UnifiedProject => ({
    name: 'TestService',
    source: 'wsdl',
    sourceUrl: 'http://api.example.com/service?wsdl',
    parsedAt: new Date(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-1',
            name: 'GetFoo',
            action: 'http://api.example.com/GetFoo',
            targetNamespace: 'http://api.example.com/',
            originalEndpoint: 'http://api.example.com/service',
            requests: [makeRequest(requestId, requestType)],
        },
    ],
});

const baseProps: Omit<UnifiedExplorerMainProps, 'projects' | 'selectedNode'> = {
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onLoadWsdl: vi.fn(),
    onNewRequest: vi.fn(),
};

/**
 * Invoke mock that answers the cancel commands like Rust does and leaves
 * execute commands PENDING (so the in-flight UI state — and therefore the
 * Cancel buttons — stays visible for the assertions).
 */
const setupInvoke = () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
        if (cmd === 'execute_soap_request' || cmd === 'execute_rest_request') {
            // Never settles — the request is "in flight" while we assert.
            return new Promise(() => {});
        }
        if (cmd === 'cancel_request' || cmd === 'cancel_rest_request' || cmd === 'cancel_unified_load') {
            return Promise.resolve({ cancelled: true, found: true });
        }
        return Promise.resolve({});
    });
};

beforeEach(() => {
    vi.clearAllMocks();
});

const typeUrl = (value: string) =>
    fireEvent.change(screen.getByPlaceholderText(/Enter WSDL URL/i), { target: { value } });

// ── R-12 (F-23): WSDL load via proxy toggle ──────────────────────────────────
describe('R-12: WSDL load via proxy toggle (F-23)', () => {
    it('exposes a proxy toggle in the load bar, off by default', () => {
        render(
            <UnifiedExplorerMain {...baseProps} projects={[]} selectedNode={null} />,
        );
        const toggle = screen.getByTestId('unified-load-proxy-toggle');
        const checkbox = toggle.querySelector('input[type="checkbox"]') as HTMLInputElement;
        expect(checkbox).toBeTruthy();
        expect(checkbox.checked).toBe(false);
    });

    it('load forwards useProxy=false (default) + a loadId to onLoadWsdl', async () => {
        setupInvoke();
        const onLoadWsdl = vi.fn().mockResolvedValue(undefined);
        render(
            <UnifiedExplorerMain {...baseProps} projects={[]} selectedNode={null} onLoadWsdl={onLoadWsdl} />,
        );

        typeUrl('http://example.com/service.wsdl');
        fireEvent.click(screen.getByRole('button', { name: /^load$/i }));

        await waitFor(() => expect(onLoadWsdl).toHaveBeenCalledTimes(1));
        const [url, opts] = onLoadWsdl.mock.calls[0];
        expect(url).toBe('http://example.com/service.wsdl');
        expect(opts?.useProxy).toBe(false);
        expect(typeof opts?.loadId).toBe('string');
        expect((opts?.loadId as string).length).toBeGreaterThan(0);
    });

    it('toggling the proxy on forwards useProxy=true to onLoadWsdl', async () => {
        setupInvoke();
        const onLoadWsdl = vi.fn().mockResolvedValue(undefined);
        render(
            <UnifiedExplorerMain {...baseProps} projects={[]} selectedNode={null} onLoadWsdl={onLoadWsdl} />,
        );

        const checkbox = screen
            .getByTestId('unified-load-proxy-toggle')
            .querySelector('input[type="checkbox"]') as HTMLInputElement;
        fireEvent.click(checkbox);
        expect(checkbox.checked).toBe(true);

        typeUrl('http://example.com/service.wsdl');
        fireEvent.click(screen.getByRole('button', { name: /^load$/i }));

        await waitFor(() => expect(onLoadWsdl).toHaveBeenCalledTimes(1));
        expect(onLoadWsdl.mock.calls[0][1]?.useProxy).toBe(true);
    });
});

// ── R-11 (F-10): cancel in-flight WSDL load ──────────────────────────────────
describe('R-11: cancel in-flight WSDL load (F-10)', () => {
    it('the load-bar Cancel button fires cancel_unified_load with the active loadId', async () => {
        setupInvoke();
        let resolveLoad: () => void;
        const loadGate = new Promise<void>(r => { resolveLoad = r; });
        const onLoadWsdl = vi.fn().mockReturnValue(loadGate);
        render(
            <UnifiedExplorerMain {...baseProps} projects={[]} selectedNode={null} onLoadWsdl={onLoadWsdl} />,
        );

        const cancelBtn = () => screen.getByTestId('unified-load-cancel') as HTMLButtonElement;
        // Idle: nothing in flight → disabled.
        expect(cancelBtn().disabled).toBe(true);

        typeUrl('http://example.com/service.wsdl');
        fireEvent.click(screen.getByRole('button', { name: /^load$/i }));
        await waitFor(() => expect(onLoadWsdl).toHaveBeenCalledTimes(1));
        const loadId = onLoadWsdl.mock.calls[0][1].loadId as string;

        // In flight: enabled, and clicking it cancels by loadId.
        expect(cancelBtn().disabled).toBe(false);
        fireEvent.click(cancelBtn());

        await waitFor(() => {
            const cancelCall = invokeMock.mock.calls.find(c => c[0] === 'cancel_unified_load');
            expect(cancelCall).toBeDefined();
            expect(cancelCall![1]).toEqual({ loadId });
        });

        // Load settles → the button re-disables (ref released).
        act(() => { resolveLoad!(); });
        await waitFor(() => expect(cancelBtn().disabled).toBe(true));
    });
});

// ── R-11 (F-11): cancel in-flight request ────────────────────────────────────
describe('R-11: cancel in-flight request (F-11)', () => {
    it('SOAP: the Run button spawns a Cancel that fires cancel_request with the same requestId', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeProject('req-1')]}
                selectedNode={{ type: 'request', id: 'req-1' }}
            />,
        );

        expect(screen.queryByTestId('unified-request-cancel')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        // The execute call carries the UI-generated requestId.
        await waitFor(() => {
            const executeCall = invokeMock.mock.calls.find(c => c[0] === 'execute_soap_request');
            expect(executeCall).toBeDefined();
            expect(typeof executeCall![1].request.requestId).toBe('string');
        });
        const executeCall = invokeMock.mock.calls.find(c => c[0] === 'execute_soap_request')!;
        const requestId = executeCall[1].request.requestId as string;

        // In flight: the Cancel button appears and fires cancel_request.
        const cancelBtn = await screen.findByTestId('unified-request-cancel');
        fireEvent.click(cancelBtn);

        await waitFor(() => {
            const cancelCall = invokeMock.mock.calls.find(c => c[0] === 'cancel_request');
            expect(cancelCall).toBeDefined();
            expect(cancelCall![1]).toEqual({ requestId });
        });
    });

    it('REST: the Run button spawns a Cancel that fires cancel_rest_request with the same requestId', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeProject('req-rest', 'rest')]}
                selectedNode={{ type: 'request', id: 'req-rest' }}
            />,
        );

        expect(screen.queryByTestId('unified-request-cancel')).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const executeCall = invokeMock.mock.calls.find(c => c[0] === 'execute_rest_request');
            expect(executeCall).toBeDefined();
            expect(typeof executeCall![1].requestId).toBe('string');
        });
        const executeCall = invokeMock.mock.calls.find(c => c[0] === 'execute_rest_request')!;
        const requestId = executeCall[1].requestId as string;

        const cancelBtn = await screen.findByTestId('unified-request-cancel');
        fireEvent.click(cancelBtn);

        await waitFor(() => {
            const cancelCall = invokeMock.mock.calls.find(c => c[0] === 'cancel_rest_request');
            expect(cancelCall).toBeDefined();
            expect(cancelCall![1]).toEqual({ requestId });
            // The SOAP cancel command must NOT fire for a REST request.
            expect(invokeMock.mock.calls.find(c => c[0] === 'cancel_request')).toBeUndefined();
        });
    });
});

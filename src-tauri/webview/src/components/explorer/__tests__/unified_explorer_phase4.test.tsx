import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { UnifiedExplorerMain, UnifiedExplorerMainProps } from '../UnifiedExplorerMain';
import { UnifiedProject, ApiRequest, ScrapbookRequest } from '@shared/models';

// ── Phase 4 (R-09 / F-06 / F-07): per-type integration tests ────────────────
//
//   SOAP    — regression guard: the dispatcher must call `execute_soap_request`
//             with a payload BYTE-IDENTICAL to the R-02 baseline (doc §9 R3:
//             "keep SOAP path byte-identical; regression test (SOAP Country
//             Info) as gate"). The exact expected payload is asserted
//             field-for-field; the R-02 test in unified_explorer_execute.test.tsx
//             remains the second guard.
//   REST    — `execute_rest_request` with the legacy flat-arg semantics
//             (bridge.ts:433–505), plus a history write.
//   GraphQL — `execute_rest_request` with the raw query wrapped as
//             {"query": …, "operationName": …} (legacy bridge.ts:439–456).
//   History — REST and GraphQL executions call `add_history_entry` with the
//             correct fields (single global store, doc §10.4 / Q6).
//   Quick requests — a REST and a GraphQL quick request execute through the
//             same dispatcher (task item 4).

// ── hermetic mocks ───────────────────────────────────────────────────────────
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

// ── fixtures ─────────────────────────────────────────────────────────────────
const SOAP_ENDPOINT = 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso';
const SOAP_ACTION = 'http://webservices.oorsprong.org/websamples.countryinfo/GetCountryName';
const SOAP_TARGET_NS = 'http://webservices.oorsprong.org/websamples.countryinfo/';

const SOAP_BODY = '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><GetCountryName><sISOAlpha2CountryCode>US</sISOAlpha2CountryCode></GetCountryName></soapenv:Body></soapenv:Envelope>';

/** WSDL-shaped project mirroring the Country Info sample (the phase-4
 *  regression gate from the acceptance criteria). */
const makeSoapProject = (): UnifiedProject => ({
    name: 'CountryInfo',
    source: 'wsdl',
    sourceUrl: `${SOAP_ENDPOINT}?WSDL`,
    parsedAt: new Date(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-soap',
            name: 'GetCountryName',
            action: SOAP_ACTION,
            targetNamespace: SOAP_TARGET_NS,
            originalEndpoint: SOAP_ENDPOINT,
            input: { name: 'GetCountryName', children: [{ name: 'sISOAlpha2CountryCode', type: 'string' }] },
            fullSchema: { name: 'GetCountryName', type: 'complex', children: [{ name: 'sISOAlpha2CountryCode', type: 'string' }] },
            requests: [
                {
                    id: 'req-soap',
                    name: 'req-soap',
                    request: SOAP_BODY,
                    endpoint: SOAP_ENDPOINT,
                    contentType: 'text/xml',
                    method: 'POST',
                },
            ],
        },
    ],
});

/** OpenAPI (Petstore-shaped) project with a GET and a JSON-body POST. */
const makeRestProject = (): UnifiedProject => ({
    name: 'Petstore',
    source: 'openapi',
    sourceUrl: 'https://petstore.swagger.io/v2/swagger.json',
    parsedAt: new Date(),
    operations: [
        {
            id: 'op-pet-id',
            name: 'tag/petId',
            action: '',
            originalEndpoint: 'https://petstore.swagger.io/v2/pet/1',
            requests: [
                {
                    id: 'req-get',
                    name: 'sample_petId',
                    request: '',
                    endpoint: 'https://petstore.swagger.io/v2/pet/1',
                    method: 'GET',
                    contentType: 'application/json',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    requestType: 'rest',
                    bodyType: 'none',
                },
            ],
        },
        {
            id: 'op-pet',
            name: 'tag/pet',
            action: '',
            originalEndpoint: 'https://petstore.swagger.io/v2/pet',
            requests: [
                {
                    id: 'req-post',
                    name: 'sample_pet',
                    request: '{\n  "name": "dog",\n  "photoUrls": []\n}',
                    endpoint: 'https://petstore.swagger.io/v2/pet',
                    method: 'POST',
                    contentType: 'application/json',
                    headers: { 'Content-Type': 'application/json' },
                    requestType: 'rest',
                    bodyType: 'json',
                },
            ],
        },
    ],
});

/** GraphQL (SpaceX-shaped) project. */
const makeGraphqlProject = (): UnifiedProject => ({
    name: 'SpaceX',
    source: 'graphql',
    sourceUrl: 'https://spacex-production.up.railway.app/graphql',
    parsedAt: new Date(),
    operations: [
        {
            id: 'op-queries-missions',
            name: 'Query/missions',
            action: '',
            originalEndpoint: 'https://spacex-production.up.railway.app/graphql',
            requests: [
                {
                    id: 'req-gql',
                    name: 'sample_missions',
                    request: 'query Missions {\n  missions {\n    __typename\n    name\n  }\n}',
                    endpoint: 'https://spacex-production.up.railway.app/graphql',
                    method: 'POST',
                    contentType: 'application/json',
                    headers: { 'Content-Type': 'application/json' },
                    requestType: 'graphql',
                    bodyType: 'graphql',
                },
            ],
        },
    ],
});

const baseProps: Omit<UnifiedExplorerMainProps, 'projects' | 'selectedNode'> = {
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onLoadWsdl: vi.fn(),
    onNewRequest: vi.fn(),
};

const setupInvoke = () => {
    invokeMock.mockReset();
    invokeMock.mockImplementation(async (cmd: string) => {
        switch (cmd) {
            case 'get_settings':
                return {};
            case 'execute_soap_request':
                return {
                    success: true,
                    statusCode: 200,
                    headers: [['content-type', 'text/xml; charset=utf-8']],
                    rawXml: '<ok>United States of America</ok>',
                    body: null,
                    error: null,
                };
            case 'execute_rest_request':
                return {
                    success: true,
                    status: 200,
                    status_text: 'OK',
                    headers: { 'content-type': 'application/json' },
                    body: '{"id":1,"name":"dog"}',
                    time_taken_ms: 12,
                    error: null,
                    truncated: false,
                };
            case 'add_history_entry':
                return { success: true };
            case 'save_unified_project':
                return { success: true };
            default:
                return {};
        }
    });
};

const findCall = (cmd: string) => invokeMock.mock.calls.find(c => c[0] === cmd);

beforeEach(() => {
    vi.clearAllMocks();
});

// ── SOAP regression gate ─────────────────────────────────────────────────────

describe('Phase 4 — SOAP regression gate (Country Info, byte-identical R-02 baseline)', () => {
    it('a SOAP project request executes through execute_soap_request with the exact R-02 payload', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeSoapProject()]}
                selectedNode={{ type: 'request', id: 'req-soap' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_soap_request');
            expect(call).toBeDefined();
            // The full invoke payload is asserted field-for-field: this is the
            // byte-identity gate against the R-02 baseline (doc §9 R3).
            // R-11 (additive): the correlation `requestId` rides alongside the
            // payload so the UI's Cancel button can target exactly this
            // in-flight call via `cancel_request`. It is stripped here so the
            // baseline payload is compared byte-for-byte as before, then
            // asserted separately as a non-empty string.
            const payload = { ...call![1] };
            const requestId = (payload.request as any).requestId;
            delete (payload.request as any).requestId;
            expect(payload).toEqual({
                request: {
                    operation: {
                        name: 'GetCountryName',
                        action: SOAP_ACTION,
                        input: { name: 'GetCountryName', children: [{ name: 'sISOAlpha2CountryCode', type: 'string' }] },
                        output: {},
                        targetNamespace: SOAP_TARGET_NS,
                        originalEndpoint: SOAP_ENDPOINT,
                        fullSchema: { name: 'GetCountryName', type: 'complex', children: [{ name: 'sISOAlpha2CountryCode', type: 'string' }] },
                        description: null,
                        portName: null,
                    },
                    soapVersion: '1.1',
                    endpoint: SOAP_ENDPOINT,
                    rawXml: SOAP_BODY,
                    contentType: 'text/xml',
                    headers: {},
                    envVariables: {},
                    contextVariables: {},
                    username: null,
                    password: null,
                    passwordType: null,
                    addTimestamp: false,
                    proxyUrl: null,
                },
            });
            expect(typeof requestId).toBe('string');
            expect((requestId as string).length).toBeGreaterThan(0);
        });

        // No REST dispatch for SOAP requests.
        expect(findCall('execute_rest_request')).toBeUndefined();

        // Response rendered + history written (phase-2 behaviour intact).
        const viewer = await screen.findByTestId('mock-response-viewer');
        expect(viewer).toHaveTextContent('<ok>United States of America</ok>');
        const historyCall = findCall('add_history_entry');
        expect(historyCall).toBeDefined();
        expect(historyCall![1].entry.requestName).toBe('req-soap');
        expect(historyCall![1].entry.method).toBe('POST');
    });

    it('a project-level content-type override is respected in the SOAP payload', async () => {
        setupInvoke();
        const project = makeSoapProject();
        const req = project.operations[0].requests[0];
        // No explicit request content type (drop the field + any header) so
        // resolution falls through to the interface-override tier.
        delete req.contentType;
        project.contentType = 'application/xml';
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[project]}
                selectedNode={{ type: 'request', id: 'req-soap' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_soap_request');
            expect(call).toBeDefined();
            // The override (application/xml) wins over the SOAP 1.1 default
            // (text/xml; charset=utf-8) — F-22 behaviour preserved.
            expect(call![1].request.contentType).toBe('application/xml');
        });
    });
});

// ── REST execution ───────────────────────────────────────────────────────────

describe('Phase 4 — REST execution (R-09 / F-06)', () => {
    it('a Petstore GET executes through execute_rest_request with no body and writes history', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeRestProject()]}
                selectedNode={{ type: 'request', id: 'req-get' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            // Legacy flat-arg shape (bridge.ts:459–464); GET carries no body.
            // R-11 (additive): the correlation `requestId` is stripped so the
            // legacy flat-arg payload is compared as before, then asserted
            // separately as a non-empty string (cancel_rest_request target).
            const args = { ...call![1] };
            const requestId = args.requestId;
            delete args.requestId;
            expect(args).toEqual({
                method: 'GET',
                url: 'https://petstore.swagger.io/v2/pet/1',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: null,
            });
            expect(typeof requestId).toBe('string');
            expect((requestId as string).length).toBeGreaterThan(0);
        });
        expect(findCall('execute_soap_request')).toBeUndefined();

        // Response rendered from the normalized execute_rest_request result.
        const viewer = await screen.findByTestId('mock-response-viewer');
        expect(viewer).toHaveTextContent('{"id":1,"name":"dog"}');

        // History write (R-08 extension) with the correct fields.
        const historyCall = findCall('add_history_entry');
        expect(historyCall).toBeDefined();
        const entry = historyCall![1].entry;
        expect(entry.requestName).toBe('sample_petId');
        expect(entry.endpoint).toBe('https://petstore.swagger.io/v2/pet/1');
        expect(entry.method).toBe('GET');
        expect(entry.projectName).toBe('Petstore');
        expect(entry.interfaceName).toBe('Petstore');
        expect(entry.operationName).toBe('tag/petId');
        expect(entry.requestBody).toBe('');
        expect(entry.statusCode).toBe(200);
        expect(entry.status).toBe(200);
        expect(entry.responseBody).toBe('{"id":1,"name":"dog"}');
        expect(entry.responseHeaders).toEqual({ 'content-type': 'application/json' });
        expect(entry.success).toBe(true);
        // Live History view updated via HistoryUpdate (same as legacy path).
        await waitFor(() => {
            const emitCalls = emitMock.mock.calls.filter(c => c[0]?.command === 'historyUpdate');
            expect(emitCalls.length).toBeGreaterThanOrEqual(1);
            expect(emitCalls[emitCalls.length - 1][0].entry.requestName).toBe('sample_petId');
        });
    });

    it('a Petstore POST sends the JSON body and writes history with that body', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeRestProject()]}
                selectedNode={{ type: 'request', id: 'req-post' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            expect(call![1].method).toBe('POST');
            expect(call![1].url).toBe('https://petstore.swagger.io/v2/pet');
            expect(call![1].body).toBe('{\n  "name": "dog",\n  "photoUrls": []\n}');
            expect(call![1].headers).toEqual({ 'Content-Type': 'application/json' });
        });

        const historyCall = findCall('add_history_entry');
        expect(historyCall).toBeDefined();
        expect(historyCall![1].entry.requestBody).toBe('{\n  "name": "dog",\n  "photoUrls": []\n}');
        expect(historyCall![1].entry.method).toBe('POST');
        expect(historyCall![1].entry.operationName).toBe('tag/pet');
    });
});

// ── GraphQL execution ────────────────────────────────────────────────────────

describe('Phase 4 — GraphQL execution (R-09 / F-07)', () => {
    it('a SpaceX query wraps the raw query as {"query": …, "operationName": …} and writes history', async () => {
        setupInvoke();
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[makeGraphqlProject()]}
                selectedNode={{ type: 'request', id: 'req-gql' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            expect(call![1].method).toBe('POST');
            expect(call![1].url).toBe('https://spacex-production.up.railway.app/graphql');
            const sentBody = JSON.parse(call![1].body);
            // The raw query is wrapped verbatim and the operation name is
            // extracted from the query text (legacy bridge.ts:444–456).
            expect(sentBody.query).toBe('query Missions {\n  missions {\n    __typename\n    name\n  }\n}');
            expect(sentBody.operationName).toBe('Missions');
            expect(sentBody.variables).toBeUndefined();
        });

        const viewer = await screen.findByTestId('mock-response-viewer');
        expect(viewer).toHaveTextContent('{"id":1,"name":"dog"}');

        const historyCall = findCall('add_history_entry');
        expect(historyCall).toBeDefined();
        const entry = historyCall![1].entry;
        expect(entry.requestName).toBe('sample_missions');
        expect(entry.method).toBe('POST');
        expect(entry.operationName).toBe('Query/missions');
        // The history records the WRAPPED payload actually sent on the wire.
        const sentBody = JSON.parse(findCall('execute_rest_request')![1].body);
        expect(entry.requestBody).toBe(JSON.stringify(sentBody));
        expect(entry.success).toBe(true);
    });

    it('a GraphQL body that is already a JSON payload is not re-wrapped', async () => {
        setupInvoke();
        const project = makeGraphqlProject();
        const req = project.operations[0].requests[0];
        const payload = JSON.stringify({ query: 'query { id }', variables: { x: 1 } });
        req.request = payload;
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[project]}
                selectedNode={{ type: 'request', id: 'req-gql' }}
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: /run/i }));

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            // Passed through untouched (legacy bridge.ts:446 guard).
            expect(call![1].body).toBe(payload);
        });
    });
});

// ── Quick requests through the dispatcher ───────────────────────────────────

const makeQuickRequest = (overrides: Partial<ScrapbookRequest>): ScrapbookRequest => ({
    id: 'qr-1',
    name: 'qr-1',
    request: '',
    endpoint: '',
    method: 'GET',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    ...overrides,
});

describe('Phase 4 — quick requests via the dispatcher (task item 4)', () => {
    it('a REST quick request executes through execute_rest_request', async () => {
        setupInvoke();
        const quickRest = makeQuickRequest({
            endpoint: 'https://petstore.swagger.io/v2/pet/1',
            method: 'GET',
            requestType: 'rest',
            bodyType: 'none',
            contentType: 'application/json',
            headers: { 'Content-Type': 'application/json' },
        });

        // The quick-request panel registers the component's execute function
        // via onRegisterExecute and calls it with the scrapbook request.
        let registered: (req: ApiRequest) => Promise<void> = async () => undefined;
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[]}
                selectedNode={{ type: 'scrapbook', id: quickRest.id }}
                onRegisterExecute={(fn) => { registered = fn; }}
            />,
        );

        await registered(quickRest);

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            // R-11 (additive): strip the correlation `requestId` before the
            // legacy flat-arg comparison, then assert it as a non-empty string.
            const args = { ...call![1] };
            const requestId = args.requestId;
            delete args.requestId;
            expect(args).toEqual({
                method: 'GET',
                url: 'https://petstore.swagger.io/v2/pet/1',
                headers: { 'Content-Type': 'application/json' },
                body: null,
            });
            expect(typeof requestId).toBe('string');
            expect((requestId as string).length).toBeGreaterThan(0);
        });
        expect(findCall('execute_soap_request')).toBeUndefined();
        // History entry written for the quick request too (single global store).
        const historyCall = findCall('add_history_entry');
        expect(historyCall).toBeDefined();
        expect(historyCall![1].entry.requestName).toBe('qr-1');
        expect(historyCall![1].entry.endpoint).toBe('https://petstore.swagger.io/v2/pet/1');
        expect(historyCall![1].entry.projectName).toBe('');
    });

    it('a GraphQL quick request wraps the query and executes', async () => {
        setupInvoke();
        const quickGql = makeQuickRequest({
            endpoint: 'https://spacex-production.up.railway.app/graphql',
            method: 'POST',
            requestType: 'graphql',
            bodyType: 'graphql',
            contentType: 'application/json',
            headers: { 'Content-Type': 'application/json' },
            request: 'query Launches {\n  launches {\n    __typename\n  }\n}',
        });

        let registered: (req: ApiRequest) => Promise<void> = async () => undefined;
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[]}
                selectedNode={{ type: 'scrapbook', id: quickGql.id }}
                onRegisterExecute={(fn) => { registered = fn; }}
            />,
        );

        await registered(quickGql);

        await waitFor(() => {
            const call = findCall('execute_rest_request');
            expect(call).toBeDefined();
            expect(call![1].method).toBe('POST');
            const sentBody = JSON.parse(call![1].body);
            expect(sentBody.query).toBe('query Launches {\n  launches {\n    __typename\n  }\n}');
            expect(sentBody.operationName).toBe('Launches');
        });
    });

    it('a SOAP quick request (undeclared requestType) still takes the SOAP path', async () => {
        setupInvoke();
        const quickSoap = makeQuickRequest({
            endpoint: SOAP_ENDPOINT,
            method: 'POST',
            contentType: 'application/soap+xml',
            request: '<soap/>',
        });

        let registered: (req: ApiRequest) => Promise<void> = async () => undefined;
        render(
            <UnifiedExplorerMain
                {...baseProps}
                projects={[]}
                selectedNode={{ type: 'scrapbook', id: quickSoap.id }}
                onRegisterExecute={(fn) => { registered = fn; }}
            />,
        );

        await registered(quickSoap);

        await waitFor(() => {
            expect(findCall('execute_soap_request')).toBeDefined();
        });
        expect(findCall('execute_rest_request')).toBeUndefined();
    });
});

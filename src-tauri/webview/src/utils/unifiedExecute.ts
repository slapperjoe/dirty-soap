import { ApiRequest, ApiOperation, UnifiedProject } from '@shared/models';
import type { ExecutionResponse } from '@apinox/request-editor/monaco';

/**
 * Phase 4 (R-09 / F-06 / F-07): request-type dispatcher for the unified
 * execute path.
 *
 * The unified explorer's `handleExecuteRequest` (UnifiedExplorerMain) used to
 * call `execute_soap_request` for every request. This module splits the
 * non-SOAP branches out of the component so the dispatch rules are testable
 * in isolation (doc §8: "per-type integration test") and so the SOAP branch
 * stays byte-identical to the R-02 baseline (doc §9 R3: "keep SOAP path
 * byte-identical; regression test (SOAP Country Info) as gate").
 *
 * REST/GraphQL semantics mirror the legacy bridge execute path
 * (`utils/bridge.ts` `ExecuteRequest` handler, baseline `3f7bc2f` lines
 * 433–505):
 *   - `execute_rest_request` is invoked with FLAT args
 *     `{ method, url, headers, body }` (the Rust command at
 *     `src-tauri/src/http/commands.rs` takes them positionally by name).
 *   - The body is sent only for GraphQL (always — it is the query) and for
 *     REST methods POST/PUT/PATCH; GET/DELETE/etc. send no body.
 *   - A raw GraphQL query (one that does not already start with `{` or `[`,
 *     i.e. is not an already-executable JSON payload) is wrapped as
 *     `{"query": …, "variables": …?, "operationName": …?}` (legacy
 *     `bridge.ts` lines 444–456).
 *
 * The legacy bridge itself is untouched (hard constraint 3: the legacy
 * EXPLORER view stays fully functional until Phase 6).
 */

/** Request-type discriminator used by the unified execute path. */
export type UnifiedRequestType = 'soap' | 'rest' | 'graphql';

/** `execute_rest_request` response — Rust `HttpResponse` (http/client.rs). */
export interface ExecuteRestResponse {
    success: boolean;
    status: number;
    status_text?: string;
    headers: Record<string, string>;
    body: string;
    time_taken_ms?: number;
    error?: string | null;
    truncated?: boolean;
}

export interface RestGraphQlDispatchInput {
    /** `execute_rest_request` is flat-arg — `method` is required. */
    method: string;
    url: string;
    /** Request headers (already resolved; the dispatcher only passes them through). */
    headers: Record<string, string>;
    /** Raw body: JSON text for REST, raw GraphQL query for GraphQL. */
    body: string | null;
    /** GraphQL variables (from `req.graphqlConfig.variables`) — legacy parity. */
    variables?: Record<string, any>;
    /** `true` for the GraphQL branch (forces a body + enables query wrapping). */
    isGraphQL: boolean;
}

/**
 * Resolve the effective request type for a unified request.
 *
 * `ApiRequest.requestType` is the Phase-1 discriminator (Rust builders emit
 * `'rest'` for OpenAPI operations, `'graphql'` for introspected GraphQL
 * fields). Unset values default to SOAP — backward-compatible with WSDL
 * projects and with requests created before Phase 4 (doc §5.3(3), risk R3).
 */
export function resolveRequestType(req: ApiRequest): UnifiedRequestType {
    switch (req.requestType) {
        case 'rest':
        case 'graphql':
            return req.requestType;
        case 'soap':
        default:
            return 'soap';
    }
}

/**
 * Build the flat `execute_rest_request` argument object for a REST or
 * GraphQL request, applying the legacy body/GraphQL-wrap rules.
 *
 * Returned object is the EXACT argument record passed to the Tauri command
 * (the component spreads nothing into it) — tests assert on it verbatim.
 */
export function buildRestGraphQlInvokeArgs(input: RestGraphQlDispatchInput): {
    method: string;
    url: string;
    headers: Record<string, string>;
    body: string | null;
} {
    const method = (input.method || 'GET').toUpperCase();
    const headers = { ...(input.headers || {}) };

    // Legacy rule (bridge.ts:440): GraphQL always carries a JSON body;
    // REST carries one only for the body methods.
    const hasBody = input.isGraphQL || ['POST', 'PUT', 'PATCH'].includes(method);
    let body: string | null = hasBody ? (input.body || null) : null;

    // Legacy GraphQL wrapping (bridge.ts:444–456): a raw query (not an
    // already-JSON payload) becomes {"query": …} plus optional
    // variables/operationName extracted from the query text.
    if (input.isGraphQL && body) {
        const trimmed = body.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            const opMatch = trimmed.match(/^\s*(?:query|mutation|subscription)\s+(\w+)/m);
            const operationName = opMatch ? opMatch[1] : undefined;
            const variables = input.variables && Object.keys(input.variables).length > 0
                ? input.variables
                : undefined;
            const payload: Record<string, unknown> = { query: body };
            if (variables) payload.variables = variables;
            if (operationName) payload.operationName = operationName;
            body = JSON.stringify(payload);
        }
    }

    return { method, url: input.url, headers, body };
}

/**
 * Normalize a Rust `execute_rest_request` response into the `ExecutionResponse`
 * shape the unified response viewer renders (same shape the SOAP path
 * produces).
 */
export function normalizeRestGraphQlResponse(
    result: ExecuteRestResponse,
    fallbackContentType?: string,
): ExecutionResponse {
    const headers = result.headers || {};
    return {
        rawResponse: result.body || '',
        status: result.status ?? 0,
        statusText: result.status_text || (result.success ? 'OK' : (result.error || 'Error')),
        headers,
        contentType: headers['content-type'] || fallbackContentType,
    };
}

/**
 * Monaco editor language for a unified request (doc §5.3(3), risk R3: the
 * unified editor used to hardcode `language="xml"`).
 *
 * Chosen by the request's `contentType` / `requestType` / `bodyType`:
 *   - SOAP → `xml` (the R-02 baseline editor language).
 *   - REST → `json` (OpenAPI sample bodies are JSON; the Phase-1 builders
 *     set `contentType: application/json`), falling back to `plaintext`
 *     for a non-JSON content type.
 *   - GraphQL → `graphql` (Monaco's GraphQL language id).
 *
 * Quick requests (scrapbook) carry no `requestType` in the frozen
 * scrapbook.json schema, so a SOAP quick request still gets `xml` here —
 * existing behavior preserved.
 */
export function editorLanguageForRequest(req: ApiRequest | null | undefined): string {
    if (!req) return 'xml';
    const requestType: UnifiedRequestType = resolveRequestType(req);
    if (requestType === 'graphql') {
        return 'graphql';
    }
    if (requestType === 'rest') {
        const ct = (req.contentType || '').toLowerCase();
        return ct.includes('json') ? 'json' : 'plaintext';
    }
    // SOAP (and quick requests, whose type is undeclared in scrapbook.json).
    return 'xml';
}

/** Owner lookup shared by the dispatcher tests and the component. */
export interface OwnerInfo {
    project?: UnifiedProject;
    operation?: ApiOperation;
}

/**
 * Find the project/operation owning a request by id (same scan the execute
 * handler performs). Returns nothing when the request is not nested in the
 * given projects (e.g. quick requests).
 */
export function findOwnerRequest(
    projects: UnifiedProject[],
    requestId: string,
): OwnerInfo | null {
    for (const project of projects) {
        for (const op of project.operations || []) {
            if ((op.requests || []).some(r => (r.id || r.name) === requestId)) {
                return { project, operation: op };
            }
        }
    }
    return null;
}

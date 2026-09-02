import { ApiRequest, ApiOperation } from "@shared/models";

/**
 * Shape of the `operation` object sent to the Rust `execute_soap_request`
 * command. Mirrors the serde fields of `ServiceOperation`
 * (packages/wsdl-parser/src/types.rs) plus `name`. The Rust struct uses
 * `Option<..>` with `skip_serializing_if`, so `null`/absent is wire-safe.
 */
export interface ExecuteOperation {
    name: string;
    action: string | null;
    input: unknown;
    output: unknown;
    targetNamespace: string | null;
    originalEndpoint: string | null;
    fullSchema: unknown;
    description: string | null;
    portName: string | null;
}

/**
 * Build the real resolved operation to send to `execute_soap_request`.
 *
 * R-02 (docs/UNIFIED_EXPLORER_PARITY_RECOMMENDATIONS.md): the unified execute
 * path must send the actual `ownerOperation` fields (action / input /
 * targetNamespace / fullSchema) rather than a hardcoded nulled stub. The
 * nulled stub shape is kept ONLY as a fallback for when `ownerOperation` is
 * genuinely absent (a request not nested under a parsed WSDL operation).
 *
 * The request body (`rawXml`) is unaffected — only the `operation` metadata
 * changes. The one observable on-the-wire consequence is the SOAP 1.1
 * `SOAPAction` header (`soap/client.rs: execute_raw_with_cancel`), which now
 * carries the resolved action instead of an empty string — the same value the
 * legacy explorer sends for the same operation (bridge.ts `ExecuteRequest`
 * handler: `action: message.soapAction` = `selectedOperation?.action || ''`),
 * i.e. parity rather than a regression.
 *
 * `output` / `description` / `portName` are not part of the unified
 * `ApiOperation` TS model (they exist only on the Rust `ServiceOperation`), so
 * they retain their stub values on the unified path.
 */
export function buildExecuteOperation(
    ownerOperation: ApiOperation | null | undefined,
    request: ApiRequest,
): ExecuteOperation {
    const reqName = request.name;

    if (!ownerOperation) {
        // Genuine fallback: no owning operation resolved. Keep the previous
        // stub shape so a request with no owner behaves exactly as before.
        return {
            name: reqName,
            action: null,
            input: null,
            output: {},
            targetNamespace: null,
            originalEndpoint: request.endpoint || null,
            fullSchema: null,
            description: null,
            portName: null,
        };
    }

    return {
        name: ownerOperation.name || reqName,
        // ApiOperation.action is a required string (possibly ""); treat an
        // empty string as "not resolved" so the SOAP 1.1 header stays `""`.
        action: ownerOperation.action ? ownerOperation.action : null,
        input: ownerOperation.input ?? null,
        output: {},
        targetNamespace: ownerOperation.targetNamespace || null,
        // Prefer the concrete request endpoint; fall back to the operation's
        // WSDL endpoint. The Rust command re-falls-back to
        // operation.originalEndpoint when request.endpoint is empty, so this
        // ordering is consistent with the execute path.
        originalEndpoint: request.endpoint || ownerOperation.originalEndpoint || null,
        fullSchema: ownerOperation.fullSchema ?? null,
        description: null,
        portName: null,
    };
}

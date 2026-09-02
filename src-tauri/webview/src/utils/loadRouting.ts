/**
 * Load-format routing for the unified explorer (R-03c / doc §8.5).
 *
 * Extracted as a pure function so the routing decision — URL/file extension
 * → WSDL vs OpenAPI vs GraphQL — is testable without a Tauri backend.
 *
 * The rules mirror the legacy `bridge.ts` `LoadWsdl` routing (bridge.ts
 * `tryRustCommand`), which is the parity baseline:
 *   1. Strip the query string, lowercase.
 *   2. `.json` / `.yaml` / `.yml` → OpenAPI/Swagger spec
 *      (`parse_openapi_spec` on the unified path, Phase 1).
 *   3. URL path containing `graphql` or `/gql` → GraphQL introspection.
 *   4. Everything else → WSDL path. Unknown/unsupported formats are NOT a
 *      separate "error" format: they route to the WSDL parser, which errors
 *      cleanly for non-WSDL input (doc §6 phase-1 row: "non-WSDL URL to
 *      legacy WSDL path still errors cleanly"). This matches legacy behavior
 *      where the default branch of the router is the WSDL command.
 */
export type LoadFormat = "wsdl" | "openapi" | "graphql";

export function detectLoadFormat(source: string): LoadFormat {
    // Strip query string for the extension check (e.g. `...?WSDL`, `?wsdl`).
    const urlLower = (source || "").toLowerCase().split("?")[0];

    if (urlLower.endsWith(".json") || urlLower.endsWith(".yaml") || urlLower.endsWith(".yml")) {
        return "openapi";
    }
    if (urlLower.includes("graphql") || urlLower.includes("/gql")) {
        return "graphql";
    }
    return "wsdl";
}

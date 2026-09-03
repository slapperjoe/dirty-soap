# AGENTS.md — Unified Explorer primary-surface section (Phase 6)

The verification report (§9.3 of `UNIFIED_EXPLORER_VERIFICATION_REPORT.md`) staged
this text but the write to `AGENTS.md` is blocked by the agent protected-file
guard (approval prompt times out in headless runs). Phase 6 (this change)
completes the retirement the staged text referenced ("slated for retirement in
Phase 6"), so the applied text below says **retired** instead.

Apply by pasting the block below into `AGENTS.md` after the
`- Simpler build and packaging flow` line (before `### 1. Rust Backend`).

---

### Unified Explorer (primary explorer surface)

The **unified explorer** is the primary explorer surface. It is a single tree
(project → operations → requests) that replaces the legacy API Explorer view,
which was retired in Phase 6.

- **Load**: WSDL / OpenAPI (.json/.yaml/.yml) / GraphQL (URL path containing
  `graphql` or `/gql`) via the URL bar, file dialog, or drag-drop. Routing is
  `detectLoadFormat` (`webview/src/utils/loadRouting.ts`); the six sample cards
  (`webview/src/utils/sampleApiCards.ts`, exact URLs in
  `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` §5.2) render in the unified empty
  state and pre-fill the URL input on click.
- **Execute**: one dispatcher by `requestType` — SOAP via
  `execute_soap_request` (byte-identical to the R-02 baseline), REST/GraphQL via
  `execute_rest_request` (legacy `bridge.ts:433–505` semantics; GraphQL queries
  are wrapped as `{"query": …, "operationName": …}`). Every execution writes a
  history entry (`add_history_entry`, single global `history.json` store) and
  auto-captures into `scrapbook.json` (Quick Requests).
- **Persistence**: projects live under `APINOX_CONFIG_DIR/unified-projects/`
  (`UnifiedProject`, `source: "wsdl" | "openapi" | "graphql"`, additive-only
  fields); quick requests in `scrapbook.json` (frozen schema, never modified by
  the unified view).

# Spec: Interface-Level SOAP Content-Type Override

Status: approved — implement per this doc, no further product decisions.
Source issue: t_da120619 (SOAP interface in unified explorer: samples/summary show text/xml while a new request's "locked" header claims application/soap+xml; user wants one interface-level content-type control that propagates to everything underneath, including existing requests).

## 1. Problem (verified in code)

Content-Type is decided independently in five places, and they disagree:

| Site | Location | Current value |
|---|---|---|
| Unified sample requests (backend) | `src-tauri/src/parsers/unified_explorer_commands.rs:136,238` | hardcoded `"text/xml"` |
| Unified new request (backend) | `unified_explorer_commands.rs:386-390` | `operation.input.contentType`, fallback `"application/soap+xml"` |
| Classic WSDL parse, samples | `webview/src/hooks/useMessageHandler.ts:205-208`, `webview/src/components/MainContent.tsx:2468-2471` | `portName.includes("12") ? "application/soap+xml" : "text/xml"` (string heuristic, not the computed `soapVersion`) |
| Classic new request | `MainContent.tsx:341` (handleUnifiedNewRequest) | `sample.contentType \|\| operation.input?.contentType \|\| "application/soap+xml"` |
| Toolbar dropdown / headers display | `packages/request-editor/src/components/RequestTypeSelector.tsx:106` (prop default), `HeadersPanel.tsx:86` (`contentType \|\| 'application/soap+xml'`), `RequestWorkspace.tsx:441` | shows `application/soap+xml` even when the stored `req.contentType` is `text/xml` or empty — the reported "locked, claims soap+xml but sends text/xml" |
| Outgoing request (classic) | `webview/src/hooks/useRequestExecution.ts:253-255` (fixContentType), backend fallback `src-tauri/src/soap/commands.rs:247-248` + `envelope_builder.rs:29-34` | `req.contentType` if set, else `application/soap+xml`, else SOAP-version default |
| Outgoing request (unified) | `webview/src/components/explorer/UnifiedExplorerMain.tsx:227` | `req.contentType \|\| 'text/xml'` |

Result: UI displays one value, wire sends another; no way to fix it at interface level.

## 2. Terminology

- **Interface** = the SOAP binding entity:
  - Classic projects: `ApiInterface` (`shared/src/models.ts:331`), stored as `interface.json` under `interfaces/`.
  - Unified explorer: a unified project IS one WSDL service (one top-level "interface"): `UnifiedProject` (`shared/src/models.ts:405`), stored as `properties.json` + `Operation*/operation.json`.
- **Sample request** = the generated request, `name` starts with `sample_` (unified) or `name === "Sample"` (classic WSDL parse). Always treated as *inheriting*, never as user-customized.
- **SOAP-version default** (`soapDefault`): `1.1` → `text/xml; charset=utf-8`, `1.2` → `application/soap+xml; charset=utf-8` (mirrors `SoapVersion::content_type()`, `envelope_builder.rs:29-34`).

## 3. Storage

### 3.1 New field

- `ApiInterface.contentType?: string` — classic (`models.ts`, next to `soapVersion`). Persisted in `interface.json` under key `contentType` (camelCase, like `bindingName`/`soapVersion`). Added to `FolderProjectStorage` save/load so it round-trips (spread-based persistence already copies unknown fields, but add it explicitly and test it).
- `UnifiedProject.contentType?: string` — unified (`models.ts:405`). Persisted in `properties.json` under key `content_type` (snake_case, matching `UnifiedProperties` in `src-tauri/src/project_storage.rs:770`):
  - Add `content_type: Option<String>` to `UnifiedProperties` (skip_serializing_if = None).
  - `save_unified_project` reads it from the incoming project JSON as `project["contentType"]` (camelCase, same pattern as `sourceUrl`/`parsedAt`).
  - `load_unified_project` emits it back as `contentType`.
  - `refresh` (`unified_explorer_commands.rs:179-182`) must preserve the existing `contentType` on the merged project (same as `soapVersion`/`bindingName`).

### 3.2 Semantics

`contentType` is an **optional override**:
- `undefined` / `null` / `""` → no override; effective value falls through to lower tiers.
- Non-empty string → override. The canonical set is `text/xml`, `application/soap+xml`, `application/xml` (the existing toolbar set, `RequestTypeSelector.tsx:126-130`), but any well-formed media type is accepted and sent verbatim.
- **No charset is auto-appended.** The value is sent exactly as stored. Only the `soapDefault` tier carries `; charset=utf-8`.
- Initial value on WSDL load: **unset** (no override). The SOAP-version default applies until the user chooses an override. Do NOT prefill from the port-name heuristic.

## 4. Precedence (the one rule, everywhere)

Effective Content-Type for a request, first match wins:

1. **Explicit request value** — `request.headers["Content-Type"]` (case-insensitive key, non-empty) if present; else `request.contentType` field if non-empty. (The app keeps header == field in sync on every write — see §6 — so in practice these are one value; header listed first to match the stated product precedence for legacy/diverged data.)
2. **Interface override** — `interface.contentType` (unified: `project.contentType`).
3. **Action default** — `operation.sampleMetadata?.contentType` ?? `operation.input?.contentType` ?? the operation's sample request `contentType` (used when creating a new request from a sample).
4. **SOAP default** — `soapDefault(soapVersion)` from §2.

Canonical helper (single source of truth):

```ts
// shared/src/utils/soapUtils.ts — new
export function resolveEffectiveContentType(
  request: { contentType?: string; headers?: Record<string, string> } | null,
  operation: { sampleMetadata?: SampleRequestMetadata; input?: any; requests?: ApiRequest[] } | null,
  iface: { contentType?: string; soapVersion?: string } | null
): string
```

Returns the first tier that yields a non-empty value; `soapDefault` is never empty. Rust consumers do not need a duplicate: the webview always resolves and passes the effective value explicitly in `executeRequest` / `execute_soap_request` payloads. The backend `content_type` override + its SOAP-version fallback (`commands.rs:247`) is kept unchanged as a safety net for legacy/other callers.

## 5. Behavior per surface

### 5.1 WSDL load — sample request generation

- Classic (`useMessageHandler.ts:201-212`, `MainContent.tsx:2464-2475`): sample request `contentType` **and** `headers["Content-Type"]` = `soapDefault(iface.soapVersion)`. Compute `soapVersion` exactly once (existing `portName.includes("12")` heuristic) and derive content-type from that same value — never a second, independent string check.
- Unified (`unified_explorer_commands.rs:130-140, 233-241`): replace hardcoded `"text/xml"` with `soapVersion::content_type()` for the project's `soap_version` (`1.1` → `text/xml; charset=utf-8`, `1.2` → `application/soap+xml; charset=utf-8`).
- `generateSampleWithMetadata` (`shared/src/utils/soapUtils.ts:300-319`): replace hardcoded `"text/xml; charset=utf-8"` fallback with `resolveEffectiveContentType(...)` given the operation + interface.

### 5.2 New request creation

- Unified backend `add_unified_request` (`unified_explorer_commands.rs:383-423`): `contentType` = project `contentType` override ?? `op.input.contentType` ?? `soapDefault(project.soap_version)`. Delete the `"application/soap+xml"` fallback.
- Unified frontend `handleUnifiedNewRequest` (`MainContent.tsx:334-344`): same order using `project.contentType`; delete the `"application/soap+xml"` fallback.
- Classic `useContextMenu.ts:196` (`defaultContentType`): `iface.contentType ?? soapDefault(iface.soapVersion)` — the port-name branch becomes the soapVersion default branch.
- Traffic-log → request (`MainContent.tsx:634-642`): keep the logged header when present (tier 1); fallback `iface.contentType ?? soapDefault(iface.soapVersion)`.

### 5.3 Display / "locked header" fix

- `RequestTypeSelector.tsx`: default prop `contentType` stays, but callers must pass the **effective** value (`resolveEffectiveContentType(...)`) — never a bare `request.contentType` — for SOAP requests. `HeadersPanel.tsx:86` and `RequestWorkspace.tsx:441` get the same effective value.
- Dropdown (`RequestTypeSelector.tsx:174-185`): options = `[("SOAP default (X)", ""), ("text/xml"), ("application/soap+xml"), ("application/xml")]` where X is the soapVersion default; `""` selects "no request-level explicit value" (removes both `contentType` and `headers["Content-Type"]`, so tier 2+ applies). Disabled when the request is a sample/readOnly (`readOnly` prop already exists) — display the effective value in that case.
- Summary screen (`SampleRequestPanel.tsx:220-225`, `OperationSummary.tsx`): display `resolveEffectiveContentType(sample, operation, iface)` so it always equals what will be sent. No separate "interface override" badge is required; the value shown is the effective one.
- Unified explorer: a project-level control (dropdown in the unified explorer toolbar/summary area, bound to `project.contentType`) with the same options, `""` = "SOAP default". This is the interface-level control the issue asks for.

### 5.4 Propagation when the interface override changes

The user's explicit requirement: changing the interface content-type updates **existing requests in place** (not just new ones).

On change to `iface.contentType = V` (V may be `""`):
1. `prevEffective` = old interface override if non-empty, else `soapDefault(iface.soapVersion)`.
2. `newEffective` = V if non-empty, else `soapDefault(iface.soapVersion)`.
3. For every operation in the interface, for every request:
   - Sample requests (`name` starts with `sample_`, or `name === "Sample"` / `readOnly`): always set `contentType = newEffective` and `headers["Content-Type"] = newEffective`.
   - Other requests: set both fields to `newEffective` **only if the request is inheriting**, where inheriting ⟺ `!req.contentType || req.contentType === prevEffective || req.contentType === soapDefault(iface.soapVersion)`.
   - A request with a non-empty `contentType` that differs from both is user-customized → left untouched (tier-1 precedence from §4 is preserved).
4. Persist immediately (classic: `saveProject`; unified: `save_unified_project`) and mark the project dirty.
5. `lastResponse` history is untouched.

### 5.5 Execution paths

- Classic `useRequestExecution.ts`: after `fixContentType`, if the result's contentType is empty, resolve via `resolveEffectiveContentType(selectedRequest, selectedOperation, selectedInterface)` before sending; also **fix the soap branch of `fixContentType`** (lines 87-98) to the sync direction header→field only when the field is empty (today it force-overwrites the header from the field, which would break tier-1 for legacy diverged data).
- Unified `UnifiedExplorerMain.tsx:227`: send `resolveEffectiveContentType(req, null, { contentType: project.contentType, soapVersion: project.soapVersion })` instead of `req.contentType || 'text/xml'`.
- `PerformanceContext.tsx:274`, `WorkspaceLayout.tsx:288`, `shared/src/utils/codeGenerator.ts:12`: use `req.contentType ?? interface override ?? soapDefault` (drop the bare `application/soap+xml` / soapVersion-only fallbacks).
- Backend `execute_soap_request` unchanged beyond keeping its existing fallback.

## 6. Invariant

Every code path that writes a request's content-type writes **both** `contentType` and `headers["Content-Type"]` with the same value (or clears both). This keeps the UI (which hides Content-Type from the headers table) in sync with the wire and makes tier 1 unambiguous.

## 7. Out of scope

- HTTP (non-SOAP) requests: `fixContentType` REST/GraphQL logic untouched.
- No change to WSDL parsing of `soap:binding transport` — `soapVersion` detection stays as-is (port-name heuristic); this spec only makes content-type *consistent with* that detection.
- No new backend command; the existing `save_unified_project` / `saveProject` round-trip carries the new field.

## 8. Acceptance

1. Load a SOAP 1.1 WSDL in the unified explorer: sample request, summary screen, and new-request form all show `text/xml; charset=utf-8`; running it sends exactly that.
2. Set the project content-type control to `application/soap+xml`: sample + all inheriting existing requests are rewritten in place (field + header) and persisted; a request the user had manually set to a different value is untouched; new requests created afterwards inherit `application/soap+xml`; outgoing request sends `application/soap+xml`.
3. Revert the control to "SOAP default": inheriting requests go back to `text/xml; charset=utf-8`; customized requests still untouched.
4. Classic projects: same behavior via the interface-level control; `interface.json` round-trips `contentType` through save/load.
5. Toolbar dropdown on a non-sample request shows the effective value; choosing "SOAP default" clears the explicit value so the interface override (or default) applies; on a sample request it is disabled and read-only.
6. `npm test` and `cargo test` pass; the tests in t_1885a01e fail before implementation and pass after.
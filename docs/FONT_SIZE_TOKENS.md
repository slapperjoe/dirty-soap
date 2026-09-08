# APInox Font-Size Tokens

Shared font-size design tokens for the APInox webview. The baseline is the
**quick request** surface (user-confirmed as the realistic reference scale),
audited in kanban task `t_e8e2f709` (findings note on that task).

## Definition

Tokens live on `:root` in `src-tauri/webview/src/index.css` (the same block
that defines `--apinox-font-size: 13px` and the `--space-*` scale). They are
**theme-independent** — like the spacing scale, they are *not* part of the
per-theme variable sets in `shared/src/styles/themes.ts`, and ThemeContext's
runtime `setProperty` loop cannot override them.

| Token | Value | Use | Replaces |
|---|---|---|---|
| `--apinox-fs-xs` | 10px | badges, counters | ad-hoc `fontSize: 10` (e.g. `CertificateManager.tsx:221` badges) |
| `--apinox-fs-sm` | 11px | section labels (uppercase 700), dense tree/list rows | `SidebarHeaderTitle` 11px, `RequestItem` `0.82em` (~10.7px) rows, proxy `tokens.fontSize.xs` (11px) |
| `--apinox-fs-md` | 12px | meta / secondary text, tabs, buttons, table labels | proxy `tokens.fontSize.sm` (12px), quick-request meta (12px), ProxyPanel tabs (12px) |
| `--apinox-fs-base` | `var(--apinox-font-size)` = 13px | body / inputs | proxy `tokens.fontSize.base` (13px), hardcoded 13px inputs |
| `--apinox-fs-title` | 15px | panel / section titles, quick-request name (weight 600) | quick-request title 15px (`UnifiedExplorerMain.tsx:1154`) |

### Why px, not em

The legacy sidebar used an em hierarchy (`ServiceItem` 0.95em ≈ 12.4px,
`OperationItem` 0.88em ≈ 11.4px, `RequestItem` 0.82em ≈ 10.7px in
`components/sidebar/shared/SidebarStyles.tsx`) on the 13px app base. The
unified explorer sidebar dropped that hierarchy and renders every tree level
at the inherited 13px. Fixed-px tokens make the scale independent of nesting
depth and match the px values the quick-request surface already hardcodes
(11px label, 12px meta, 13px input, 15px title). If em-based sizing is
preferred later, keep the token names and switch values to em on the 13px
base (e.g. `0.82em`, `0.85em`, `1em`, `1.15em`).

### Why this is the baseline

Quick request is the densest, most-used surface and is user-confirmed as the
reference: 11px section labels, ~10.7px sidebar rows, 12px meta, 13px
body/inputs, 15px panel titles. The app-wide base is
`--apinox-font-size: 13px` (`App.styles.ts:25`, `index.css:34`).

## Applying the tokens

Consumption in styled-components or inline styles:

```tsx
style={{ fontSize: "var(--apinox-fs-sm)" }}
```

Proxy/mock components already centralize values in
`src-tauri/webview/src/components/proxy/tokens.ts` — that file's `fontSize`
scale (xs 11 / sm 12 / base 13 / md 14 / lg 16 / xl 18, copied from APIprox)
is the intended consumer for the settings Proxy page. When re-pointing it,
map the first three steps to the shared tokens and drop `md`+ (nothing in
the quick-request baseline uses 14px or larger):

```ts
fontSize: {
  xs:   "var(--apinox-fs-sm)",   // 11px section labels / rows
  sm:   "var(--apinox-fs-md)",   // 12px meta / tabs / buttons
  base: "var(--apinox-fs-base)", // 13px body / inputs
},
```

### Settings → Proxy page (`components/proxy/ProxySettingsPanel.tsx`, `CertificateManager.tsx`)

Deviation: larger than baseline (see audit `t_e8e2f709`).

| Element | Current | Target token |
|---|---|---|
| Page title `<h2>` (`ProxySettingsPanel.tsx:73`) | 18px | `var(--apinox-fs-title)` (15px) |
| Section heads `<h3>` via `sectionHeadStyle` (62-69) | 14px | `var(--apinox-fs-sm)` (11px uppercase — matches `SidebarHeaderTitle`) |
| `CertificateManager.tsx:130,203,266` heads | 14px | `var(--apinox-fs-sm)` (11px uppercase) |
| Body / inputs | 13px | `var(--apinox-fs-base)` — already fine |
| Descriptions / status | 12px | `var(--apinox-fs-md)` — already fine |
| Table header (255), hint (194) | 11px | `var(--apinox-fs-sm)` — already fine |
| Badges (221) | 10px | `var(--apinox-fs-xs)` — already fine |

### Unified explorer sidebar (`components/explorer/UnifiedExplorerSidebar.tsx`)

Deviation: `TreeItem` rows (132-170) inherit the 13px app base — no
font-size is set anywhere in the render chain. Give rows explicit sizes that
restore the legacy em hierarchy:

| Element | Current | Target token |
|---|---|---|
| Project rows | 13px (inherited) | `var(--apinox-fs-md)` (12px, ≈ legacy `ServiceItem` 0.95em) |
| Operation rows | 13px (inherited) | `var(--apinox-fs-sm)` (11px, ≈ legacy `OperationItem` 0.88em) |
| Request rows | 13px (inherited) | `var(--apinox-fs-sm)` (11px, ≈ legacy `RequestItem` 0.82em) |
| Quick Requests header (`SidebarHeaderTitle`) | 11px | `var(--apinox-fs-sm)` — already baseline, don't touch |
| Quick request rows (`ScrapbookPanel` / `RequestItem` 0.82em) | ~10.7px | leave as-is — already baseline |
| Empty state (448) | 12px | `var(--apinox-fs-md)` — already fine |

## Do not touch

- Monaco `editorFontSize` (code editors are a separate system)
- 10px badges and 15px remove-glyph sizes that already match the scale
- `SettingsEditorModal` tab bar (12px) — already fine
- `--apinox-font-size` itself — `--apinox-fs-base` aliases it, so any future
  base-size change propagates automatically

## Scope

Token definition + documentation only (kanban task `t_5986b56b`). Component
markup and rendered styles are intentionally unchanged; the application work
is tracked in `t_d19eeb2d` (settings proxy page) and `t_8f2b97a4`
(explorer sidebar).

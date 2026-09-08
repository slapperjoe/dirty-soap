# Font-size tokens

Shared baseline font sizes for the webview UI. Defined in `src/index.css`
(`:root`) and referenced via `var(--apinox-fs-*)` in component styles.

| Token | Value | Used for |
|-------|-------|----------|
| `--apinox-fs-xs` | 10px | Badges, small counters |
| `--apinox-fs-sm` | 11px | Tree rows (operation/request), quick-request rows |
| `--apinox-fs-md` | 12px | Project rows, sample-card titles, compact tables |
| `--apinox-fs-title` | 16px | Modal/card titles |
| `--apinox-fs-base` | 13px | Default app text (body) |

Rules:
- Sidebar tree rows in `UnifiedExplorerSidebar` (project/operation/request)
  MUST use these tokens — never raw px values — so the quick-request baseline
  stays consistent across all list surfaces.
- Badges (e.g. `--apinox-fs-xs`) must never be applied to a row's whole font;
  the token controls the row, not the badge.

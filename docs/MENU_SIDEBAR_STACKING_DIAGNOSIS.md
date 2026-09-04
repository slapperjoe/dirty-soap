# Menu / Sidebar Strip Stacking — Diagnosis & Placement Strategy

Task: t_8de3fefc (decomposition of t_5a771ccd)
Date: 2026-09-04 · Branch: wt/t_8de3fefc · Status: DECIDED

## Symptom

In the **Tests** sidebar view, clicking the **+** ("Add Test Suite") button in the
"Test Suites" panel header opens a dropdown menu that renders **behind the
sidebar rail strip** (the 50px icon rail on the left). The menu's left part is
invisible; the user can only see a slice of the menu to the right of the rail.

## Components involved

| Element | File:line | Role |
|---|---|---|
| Button | `src-tauri/webview/src/components/sidebar/TestsUi.tsx:290` (`HeaderButton`, `title="Add Test Suite"`) | Opens the menu |
| Menu | `TestsUi.tsx:30` `AddSuiteMenu` styled component (rendered at `:299`) | The hidden dropdown |
| Rail strip | `src-tauri/webview/src/components/sidebar/SidebarRail.tsx:101-112` (width 50px) | The strip the menu ends up behind |
| Panel | `TestsUi.tsx:282` `TestsContainer` → `TestsContent` (`shared/SidebarStyles.tsx`) | Menu's containing panel |
| Sidebar wrapper | `src-tauri/webview/src/components/Sidebar.tsx:17` `SidebarContainer`, `:40` `SidebarContent` | Layout / clipping ancestors |
| Layout row | `src-tauri/webview/src/index.css:330` `.content-row` (mobile), `:388` (`display: contents`, desktop ≥900px) | Sidebar + main content siblings |

## DOM / CSS layout (verified in source)

```
.content-row (mobile: flex row, overflow:hidden @index.css:330)
└─ .sidebar-drawer = SidebarContainer  (Sidebar.tsx:17)
   │   desktop (≥900px): position: relative !important @index.css:397
   │   mobile  (<900px): position: fixed !important, z-index: 1000,
   │                     transform: translateX(0) @index.css:339-348
   │   NOTE: no z-index of its own on desktop
   ├─ SidebarRail          (first flex child, 50px wide, no z-index, no
   │                       position → auto)
   └─ SidebarContent ($hidden) (second flex child, flex:1)
         │   index.css-agnostic: overflow: hidden  @Sidebar.tsx:45
         └─ TestsUi → TestsContainer (flex column, height:100%)
              ├─ SidebarHeader  (44px)
              │    └─ HeaderActions  (position: relative @TestsUi.tsx:26)
              │         ├─ HeaderButton (the + button)
              │         └─ AddSuiteMenu  (position: absolute, top:100%,
              │                           right:0, z-index:100 @TestsUi.tsx:30-41)
              └─ TestsContent (flex:1, overflow-y:auto)
```

Geometry (sidebar default 240px, `Sidebar.tsx:50`):

- `.sidebar-drawer` (`SidebarContainer`) width = 240px = `SidebarRail` (50px)
  + `SidebarContent` (flex:1) + `ResizeHandle` (4px) ⇒ panel content ≈ 186px,
  occupying viewport x `50…236`.
- `AddSuiteMenu`: `min-width: 180px`, anchored `right: 0` of `HeaderActions`,
  which sits ~10px inside the panel's right edge (header padding 10px).
  It grows **leftward** from that anchor.
- Available space to the left of the anchor ≈ 166–176px (panel 186px minus
  header padding, minus the button + title on the left). The 180px menu is
  **wider than that**, so its left edge crosses the panel's left boundary
  (viewport x = 50).
- ⇒ the menu's left slice **projects under the rail strip** x `0…50` and is
  clipped there. The overflow is a thin sliver at 240px but **grows as the
  sidebar narrows**: at the 160px minimum (`Sidebar.tsx:61`), panel content ≈
  106px, so ~84px of the 180px menu (over half) is clipped behind the rail.
  Long project names in the items push the menu even wider, worsening it.

Verified in a real browser (isolated repro, same box model): a 180px
right-anchored absolute menu inside an `overflow: hidden` panel next to a 50px
rail overflows the panel's left edge; `document.elementFromPoint` over the
rail's x-range returns the rail, **not** the menu — i.e. the menu's left
portion is clipped, not just painted underneath.

## Root cause

**The menu is clipped by `overflow: hidden` on `SidebarContent`
(`Sidebar.tsx:45`), not by z-index.**

1. `AddSuiteMenu` is absolutely positioned inside the sidebar panel
   (`TestsUi.tsx:30-41`, `position: absolute; top: 100%; right: 0;
   z-index: 100`). It never escapes the panel's box.
2. The panel's ancestor `SidebarContent` has `overflow: hidden`
   (`Sidebar.tsx:45`). Anything of the menu that extends beyond the panel's
   left edge (viewport x < 50) is **clipped** — not painted at all.
3. The rail strip (`SidebarRail`) is a normal-flow sibling *before* the panel
   with its own opaque background. The clipped region is exactly where the rail
   is drawn, so the menu visually appears "behind the sidebar strip".
4. `z-index: 100` on the menu is irrelevant here: z-index only orders
   paint *within* the same stacking context, and both the menu and the rail
   live in the same context, but **clipping happens before paint order
   matters** — the menu pixels are simply cut off at the panel's left edge.

### Facts checked (per the task checklist)

- **z-index**: menu `z-index: 100` (TestsUi.tsx:38) vs rail (none/auto) vs
  `.sidebar-drawer` (`z-index: 1000` **only** in the <900px mobile media
  query, index.css:344; `position: relative` with **no** z-index at ≥900px,
  index.css:396-400). So on desktop the drawer and the main content are
  siblings in the same stacking context — raising the menu's z-index alone
  would **not** help, because the menu is clipped, not covered.
- **Stacking contexts**: no `position`+`z-index`, `transform`, `filter`,
  `will-change`, `contain`, or `opacity < 1` on any ancestor between the menu
  and the viewport on desktop (`SidebarContainer`, `SidebarContent`,
  `TestsContainer` all checked). On mobile the drawer's `transform:
  translateX(0)` makes `.sidebar-drawer` a containing block — a `position:
  fixed` menu inside it would be contained by the *drawer*, which on mobile is
  a left-anchored fixed strip covering the full content area, so a fixed
  placement still works there (it just contains to the drawer, which spans the
  whole sidebar).
- **DOM order**: rail is the first child of the drawer; the panel is second.
  In paint order the panel (and its children) paints *after* the rail — so
  if the menu were not clipped, it would actually paint *above* the rail. The
  observed "behind" is purely the clip + opaque rail.
- **Portals**: not used. `AddSuiteMenu` renders inline in the panel's DOM.
  (Contrast: the shared right-click context menu,
  `sidebar/shared/SidebarContextMenu.tsx:68-79`, uses `position: fixed;
  z-index: 99999` inline — also no portal, but it never needs to escape a
  clipping box because it is positioned in viewport coordinates.)
- **Transforms**: none on desktop ancestors (see above).
- **Overflow**: `SidebarContent` `overflow: hidden` (Sidebar.tsx:45) is the
  clipper. `TestsContent` is `overflow-y: auto` but the menu is attached to
  the header, above it, so it is not the clipper. `.content-row` (mobile)
  `overflow: hidden` (index.css:335) is a second clipper on mobile.
- **Positioning**: `right: 0` anchors the menu to the panel's right edge; the
  only direction it can grow is leftward, straight into the rail's territory.

### Why it looks "behind the strip"

Clipped menu + opaque rail painted in the same x-range ⇒ the visible part of
the menu starts at x=50 (the rail's right border). To the eye: the menu goes
behind the strip.

## Placement decision

**Option A — render above (over) the sidebar strip.** Keep the menu anchored
where it is (right of the button, below the header) and make it escape the
clipping box so it paints over the rail. Implementation: position the menu in
**viewport coordinates** (like the existing `SidebarContextMenu` pattern):
compute the button's rect on open and render `position: fixed` at
`rect.bottom + 4` / right-aligned to `rect.right`, with `z-index` above the
rail (e.g. `1001+`; the drawer is 1000 only on mobile, nothing on desktop).
Because no desktop ancestor creates a containing block, `fixed` = viewport.
On mobile the drawer is a transformed containing block, but it spans the whole
sidebar (rail + panel) from `left: 0`, so the menu still renders inside the
open drawer and is visible. No layout shift, no new scroll.

**Option B — reposition left of the rail strip** (i.e. into the main content
area, which is to the *right* of the sidebar… "left of the rail" would mean
off-screen at x<0 — impossible). The only coherent reading of "left of the
strip" is opening the menu toward the **right** (into the main content
area), e.g. `left: 0` of the button growing rightward. This works geometrically
(`min-width 180px` ≤ remaining window width on any sane viewport) and needs
no portal/fixed positioning — just flip `right: 0` to `left: 0` and keep it
inside the panel (still clipped at the panel's right edge, so it would need a
wider menu area or the fixed-position treatment anyway once it grows past the
panel's right edge).

### Recommendation: **Option A (viewport/fixed positioning, "above the
strip")**

Rationale:

1. **Minimal + safe**: one component (`TestsUi` `AddSuiteMenu`) changes; the
   panel layout, header, rail, and all other menus are untouched.
2. **Consistent with the codebase**: the established escape-the-clipping-box
   pattern already exists — `SidebarContextMenu` (fixed + z-index 99999) and
   `DropdownMenu` (common/DropdownMenu.tsx, z-index 1000, absolute within a
   non-clipping parent). Following the `SidebarContextMenu` coordinate
   approach keeps behavior identical to the right-click menus users already
   trust.
3. **Robust across the whole bug class**: any future sidebar header dropdown
   wider than the panel gets the same treatment; no per-width special-casing.
4. **Option B is worse**: flipping to `left: 0` still leaves the menu inside
   the `overflow: hidden` panel, so a menu wider than the panel (long project
   names → items wider than 180px) would be clipped at the *right* edge
   instead — same bug, mirrored. True "into the main content" placement
   requires the same fixed-positioning machinery, so it is Option A anyway.
5. **Accessibility preserved**: the menu keeps its DOM position (next to the
   button) so focus order is unchanged; with fixed positioning it stays fully
   visible (keyboard Tab/Arrow still reach it; Escape-to-close handler can be
   added in the fix task alongside the existing outside-click behavior the
   menu currently lacks).

**Decision: render the menu above the sidebar strip using viewport-relative
(`position: fixed`) placement computed from the trigger button's rect, with a
z-index above the drawer's mobile value (≥1001) and no desktop containing
block to worry about. Do NOT flip to `left: 0` in-panel.**

## Minimal safe fix (for t_894bcad3)

Target file: `src-tauri/webview/src/components/sidebar/TestsUi.tsx`

1. Add a ref to the `HeaderButton` (trigger) and measure it on open:
   ```tsx
   const addSuiteBtnRef = useRef<HTMLButtonElement>(null);
   const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

   const openAddSuiteMenu = () => {
       const rect = addSuiteBtnRef.current?.getBoundingClientRect();
       if (!rect) { setShowAddSuiteMenu(v => !v); return; }
       if (!showAddSuiteMenu) {
           // right-aligned to the button, 4px gap below it
           const menuW = 200; // ~ min-width 180 + padding; or measure after render
           const left = Math.max(8, rect.right - menuW);
           const top = rect.bottom + 4;
           setMenuPos({ top, left });
       }
       setShowAddSuiteMenu(v => !v);
   };
   ```
   (Or render first with `visibility: hidden` to measure the real width and
   reposition — the `SidebarContextMenu.clampedPosition` approach is a good
   reference, `shared/SidebarContextMenu.tsx:307-312`.)

2. Change `AddSuiteMenu` from in-panel absolute to viewport fixed:
   ```tsx
   const AddSuiteMenu = styled.div`
       position: fixed;
       top: 0;        /* overridden by inline style */
       left: 0;       /* overridden by inline style */
       z-index: 1001;  /* above .sidebar-drawer's mobile 1000; desktop has none */
       background: var(--apinox-dropdown-background);
       border: 1px solid var(--apinox-dropdown-border);
       border-radius: 4px;
       min-width: 180px;
       box-shadow: 0 4px 10px rgba(0,0,0,0.2);
   `;
   ```
   and render with `style={{ top: menuPos?.top, left: menuPos?.left }}`.

3. Close-on-outside-click + Escape: add the same `document mousedown`
   listener pattern as `DropdownMenu.tsx:87-101` / `SidebarContextMenu`
   (capture-phase is fine), and close on `Escape`.

4. No changes to `Sidebar.tsx`, `SidebarStyles.tsx`, `SidebarRail.tsx`, or
   `index.css`. Do not touch `overflow: hidden` on `SidebarContent` — it is
   correct for the panel and removing it would re-introduce horizontal
   overflow of long tree labels.

### Acceptance checks for the fix

- Click +: menu opens fully visible, its right edge aligned near the button,
  its left edge overlapping the rail strip but painting **on top** of it.
- Works at sidebar widths 160–600px (resize handle range) and at viewport
  widths ≥ ~600px (menu never needs viewport-edge clamping at `left ≥ 8`).
- Mobile (<900px, drawer fixed + transformed): menu still opens inside the
  open drawer, visible above the rail.
- No new horizontal scrollbar, no layout shift (menu is out of flow, `fixed`).
- Other menus unaffected: `DropdownMenu`, `SidebarContextMenu` (context
  menus), `WorkflowBuilderModal` local dropdowns, `EnvironmentSelector` (its
  own overlay + fixed positioning, already works).
- Keyboard: Tab reaches menu items; Escape closes.

## Regression tests (for t_1553298f)

Existing framework: vitest + Testing Library under
`src-tauri/webview/src/components/**/__tests__` (e.g.
`sidebar/__tests__/SidebarRail.test.tsx`). jsdom note: getBoundingClientRect
returns zeros in jsdom — stub `HTMLElement.prototype.getBoundingClientRect`
to assert the computed placement (see existing unified explorer tests for the
pattern). Suggested assertions:

1. Clicking the `title="Add Test Suite"` button renders the menu (menu title
   text present in document).
2. The menu's computed style is `position: fixed` (not absolute inside the
   panel) and its `z-index` (≥1001) exceeds the drawer's mobile value (1000).
3. With a stubbed button rect (e.g. `{right: 230, bottom: 80}`) and a known
   menu width, the menu's `left`/`top` equal the expected viewport
   coordinates (right-aligned, below the button).
4. Sidebar collapsed/expanded states (if the fix adds an
   `sidebarExpanded`-aware test) keep the menu in the same viewport position.
5. Outside click closes the menu; Escape closes the menu.
6. Optional visual: no screenshot tooling is configured in the repo (no
   playwright/cypress/puppeteer in the webview package.json), so a DOM-level
   geometry assertion (item 3) is the stable substitute for a visual
   regression test.

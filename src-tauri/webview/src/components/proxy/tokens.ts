import type React from 'react';

/**
 * Design tokens for proxy/mock components (copied from APIprox webview).
 *
 * All UI colours, font sizes, spacing and radii live here.
 * Import this file instead of repeating raw values in inline styles.
 *
 * Usage:
 *   import { tokens } from './tokens';
 *   <div style={{ background: tokens.surface.base, color: tokens.text.primary }} />
 */

export const tokens = {
  /** Background surface layers (darkest → lightest) */
  surface: {
    /** Deepest background — editor / content areas */
    base: 'var(--apinox-editor-background, #1e1e1e)',
    /** Slightly deeper than base — template bars, dense rows */
    deep: 'var(--apinox-surface-deep, #181818)',
    /** Panel / sidebar background */
    panel: 'var(--apinox-sideBar-background, #252526)',
    /** Tab bar / header / toolbar background */
    elevated: 'var(--apinox-surface-elevated, #2d2d30)',
    /** Subtle row separator / alternating stripe */
    stripe: 'var(--apinox-editor-lineHighlightBackground, #2a2a2a)',
    /** Input field background */
    input: 'var(--apinox-input-background, #3c3c3c)',
    /** Hover / subtle overlay on inputs/items */
    hover: 'var(--apinox-list-hoverBackground, #2a2d2e)',
    /** Active / selected item background */
    active: 'var(--apinox-list-activeSelectionBackground, #37373d)',
    /** Danger button / delete background */
    danger: 'var(--apinox-surface-danger, #5a2e2e)',
    /** Drop / destructive action button (darker red) */
    dangerDark: 'var(--apinox-surface-danger-dark, #6b1010)',
    /** Allow / continue / success action button (dark green) */
    successDark: 'var(--apinox-surface-success-dark, #106b21)',
    /** Tag chip background */
    tag: 'var(--apinox-surface-tag, #1e4a7a)',
  },

  /** Border colours */
  border: {
    /** Default separator between elements */
    default: 'var(--apinox-border-default, #3e3e42)',
    /** Subtle (less prominent borders, e.g. nested inputs) */
    subtle: 'var(--apinox-border-subtle, #555555)',
  },

  /** Text colours */
  text: {
    /** Primary body text */
    primary: 'var(--apinox-editor-foreground, #d4d4d4)',
    /** Secondary text / labels */
    secondary: 'var(--apinox-foreground, #cccccc)',
    /** Muted / placeholder / de-emphasised text */
    muted: 'var(--apinox-descriptionForeground, #858585)',
    /** Hint / meta / helper text (lighter than muted) */
    hint: 'var(--apinox-disabledForeground, #666666)',
    /** Very subtle / decorative text (dividers, counters) */
    faint: 'var(--apinox-text-faint, #555555)',
    /** Danger / delete icon text */
    danger: 'var(--apinox-text-danger, #ff6b6b)',
    /** Tag chip text */
    tag: 'var(--apinox-text-tag, #90caf9)',
    /** Full-bright white */
    white: '#ffffff',
  },

  /** Semantic status / action colours */
  status: {
    /** Success / running / allow */
    success: 'var(--apinox-testing-iconPassed, #22c55e)',
    successGlow: '#22c55e99',
    /** Warning / caution */
    warning: 'var(--apinox-testing-iconQueued, #f59e0b)',
    /** Error / danger / drop / stopped */
    error: 'var(--apinox-testing-iconFailed, #ef4444)',
    errorGlow: '#ef444499',
    /** Brand / link / active accent (VS Code blue) */
    accent: 'var(--apinox-focusBorder, #007acc)',
    /** Primary button / action blue (darker variant) */
    accentDark: 'var(--apinox-button-background, #0e639c)',
    /** Hover state for accentDark buttons */
    accentHover: 'var(--apinox-button-hoverBackground, #1177bb)',
  },

  /** HTTP response status code colours */
  httpStatus: {
    success:     '#4caf50',   // 2xx
    redirect:    '#ff9800',   // 3xx
    clientError: '#f44336',   // 4xx
    serverError: '#e53935',   // 5xx
    unknown:     '#858585',
  },

  /** Syntax / traffic labelling colours */
  syntax: {
    /** REQUEST labels (teal) */
    request: '#4ec9b0',
    /** RESPONSE labels (warm yellow) */
    response: '#dcdcaa',
    /** String literals */
    string: '#ddb165',
    /** Parameters / identifiers */
    param: '#9cdcfe',
    /** Error / exception output */
    error: '#f48771',
  },

  /**
   * Font size scale.
   *
   * The first three steps map to the shared quick-request baseline tokens
   * defined on :root in src/index.css (docs/FONT_SIZE_TOKENS.md):
   * section labels 11px, meta/tabs/buttons 12px, body/inputs 13px.
   * The larger steps (md and up) are used only by sibling settings pages
   * (Mock/Breakpoints dialogs) that are not part of this baseline and keep
   * their legacy values for now.
   */
  fontSize: {
    xs:   'var(--apinox-fs-sm)',   // 11px section labels / dense rows
    sm:   'var(--apinox-fs-md)',   // 12px meta / tabs / buttons
    base: 'var(--apinox-fs-base)', // 13px body / inputs (aliases --apinox-font-size)
    md:   '14px',
    lg:   '16px',
    xl:   '18px',
    xxl:  '20px',
  },

  /** Spacing scale (use for padding, margin, gap) */
  space: {
    '1': '4px',
    '2': '6px',
    '3': '8px',
    '4': '12px',
    '5': '16px',
    '6': '20px',
    '7': '24px',
  },

  /** Border radius */
  radius: {
    sm: '3px',
    md: '4px',
    lg: '6px',
    full: '50%',
  },

  /** Font family */
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',

  /** Panel / section title style — matches SidebarHeaderTitle from SidebarStyles */
  sectionTitle: {
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    color: 'var(--apinox-sideBarTitle-foreground)',
    margin: 0,
  } as React.CSSProperties,
} as const;

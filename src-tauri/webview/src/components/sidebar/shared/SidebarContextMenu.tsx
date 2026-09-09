/**
 * SidebarContextMenu.tsx
 * 
 * Shared context menu for all sidebar panels.
 * Supports section headers, icon + label + sub-text layout,
 * viewport edge-clamping, and clipboard toast feedback.
 */

import React, { useState, useEffect, useRef } from 'react';
import styled from 'styled-components';
import {
  Pencil,
  Trash2,
  Globe,
  Link,
  Copy,
  FileText,
  RefreshCw,
  Pause,
  Download,
  VenetianMask,
  Check,
  FolderOpen,
  Plus,
  ExternalLink,
  Code,
  File,
} from 'lucide-react';
import { tokens } from '../../proxy/tokens';

// ─── Types ────────────────────────────────────────────────────────────────

export interface CtxMenuItem {
  /** Lucide icon component class */
  icon: typeof Pencil;
  /** Primary label */
  label: string;
  /** Optional sub-label (pattern, URL, etc.) */
  sub?: string;
  /** Optional hover tooltip (rendered as the native `title` attribute) */
  tooltip?: string;
  /** Click handler — called when item is clicked */
  onClick?: () => void;
  /** If set, this text is copied to clipboard on click (triggers toast + close) */
  copyText?: string;
  /** Danger styling for destructive actions */
  danger?: boolean;
  /** Optional nested sub-items (creates a submenu on hover) */
  subItems?: CtxMenuItem[];
  /** Optional icon for sub-menu parent items */
  subIcon?: typeof Pencil;
}

export interface CtxMenuSection {
  title: string;
  items: CtxMenuItem[];
}

export interface SidebarContextMenuProps {
  x: number;
  y: number;
  sections: CtxMenuSection[];
  onClose: () => void;
  /** Optional: external copy handler (replaces built-in clipboard). Receives the text to copy. */
  onCopy?: (text: string) => Promise<void>;
}

// ─── Styled ───────────────────────────────────────────────────────────────

const MenuContainer = styled.div<{ $top: number; $left: number }>`
  position: fixed;
  top: ${p => p.$top}px;
  left: ${p => p.$left}px;
  z-index: 99999;
  background: ${tokens.surface.panel};
  border: 1px solid ${tokens.border.default};
  border-radius: ${tokens.radius.lg};
  box-shadow: 0 14px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
  min-width: 260px;
  animation: ctxFadeIn 0.1s ease;
`;

const SectionHeader = styled.div`
  padding: 8px 14px;
  background: ${tokens.surface.elevated};
  border-bottom: 1px solid ${tokens.border.default};
  font-size: 10px;
  font-weight: 600;
  color: ${tokens.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.06em;
`;

const MenuItem = styled.div<{ $danger?: boolean; $hover: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  cursor: pointer;
  background: ${p => p.$hover ? (p.$danger ? 'rgba(156,14,14,0.18)' : tokens.surface.stripe) : 'transparent'};
  transition: background 0.1s;
`;

const IconWrapper = styled.span`
  font-size: 14px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
`;

const LabelWrapper = styled.div`
  min-width: 0;
`;

const Label = styled.div<{ $danger?: boolean }>`
  font-size: 12px;
  font-weight: 600;
  color: ${p => p.$danger ? tokens.text.danger : tokens.text.primary};
`;

const SubLabel = styled.div`
  font-size: 10px;
  color: ${tokens.text.hint};
  font-family: monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200px;
`;

const Toast = styled.div`
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: ${tokens.surface.panel};
  color: ${tokens.text.primary};
  padding: 8px 20px;
  border-radius: ${tokens.radius.lg};
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  font-size: 13px;
  font-weight: 600;
  z-index: 100000;
  animation: ctxFadeIn 0.2s ease;
`;

const SubMenu = styled.div`
  position: fixed;
  z-index: 100000;
  background: ${tokens.surface.panel};
  border: 1px solid ${tokens.border.default};
  border-radius: ${tokens.radius.lg};
  box-shadow: 0 14px 40px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.4);
  min-width: 220px;
  animation: ctxFadeIn 0.1s ease;
`;

const ChevronRight = styled.div`
  margin-left: auto;
  font-size: 16px;
  color: ${tokens.text.hint};
  transition: transform 0.15s ease;
`;

// ─── Sub-components ───────────────────────────────────────────────────────

const ItemContainer = styled.div`
  position: relative;
`;

const SubMenuContainer = styled.div`
  position: relative;
`;

function MenuItemRow({ item, onCopy }: { item: CtxMenuItem; onCopy: (text: string) => Promise<void> }) {
  const [hover, setHover] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuItemRef = useRef<HTMLDivElement>(null);
  const [subMenuPos, setSubMenuPos] = useState<{ left: number; top: number } | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const IconComp = item.icon;
  const hasSubItems = item.subItems && item.subItems.length > 0;

  // Calculate viewport position for the sub-menu with edge clamping
  const updateSubMenuPos = () => {
    // Synchronous estimate for immediate rendering
    if (menuItemRef.current) {
      const rect = menuItemRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        // Ref is laid out - use the real dimensions immediately
        const subMenuW = 220;
        let left = rect.right;
        if (left + subMenuW > window.innerWidth) {
          left = rect.left - subMenuW;
        }
        let top = rect.top;
        if (rect.bottom + 100 > window.innerHeight) {
          top = window.innerHeight - 110;
        }
        setSubMenuPos({ left, top });
      } else {
        // Ref not laid out yet - defer to next frame
        requestAnimationFrame(() => {
          if (menuItemRef.current) {
            const rect = menuItemRef.current.getBoundingClientRect();
            const subMenuW = 220;
            let left = rect.right;
            if (left + subMenuW > window.innerWidth) {
              left = rect.left - subMenuW;
            }
            let top = rect.top;
            if (rect.bottom + 100 > window.innerHeight) {
              top = window.innerHeight - 110;
            }
            setSubMenuPos({ left, top });
          }
        });
      }
    }
  };

  const clearHoverTimeout = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };

  const handleClick = async () => {
    if (item.copyText !== undefined) {
      await onCopy(item.copyText);
    } else if (item.onClick) {
      item.onClick();
    }
  };

  const handleParentLeave = () => {
    // Debounce: delay hiding so user can move to submenu without flicker
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => {
      setHover(false);
    }, 80);
  };

  const handleSubMenuEnter = () => {
    clearHoverTimeout();
    setHover(true);
  };

  const handleSubMenuLeave = () => {
    clearHoverTimeout();
    hoverTimeoutRef.current = setTimeout(() => {
      setHover(false);
    }, 80);
  };

  return (
    <SubMenuContainer>
      <ItemContainer
        ref={containerRef}
        onMouseEnter={() => {
          clearHoverTimeout();
          setHover(true);
          if (hasSubItems) updateSubMenuPos();
        }}
        onMouseLeave={handleParentLeave}
      >
        <MenuItem
          ref={menuItemRef}
          $danger={item.danger}
          $hover={hover || false}
          title={item.tooltip}
          onClick={hasSubItems ? undefined : handleClick}
        >
          <IconWrapper>
            <IconComp size={14} />
          </IconWrapper>
          <LabelWrapper>
            <Label $danger={item.danger}>{item.label}</Label>
            {item.sub && <SubLabel>{item.sub}</SubLabel>}
          </LabelWrapper>
          {hasSubItems && <ChevronRight>▶</ChevronRight>}
        </MenuItem>
        {hasSubItems && hover && (
          <SubMenu
            style={{
              position: 'fixed',
              left: subMenuPos ? subMenuPos.left : 0,
              top: subMenuPos ? subMenuPos.top : 0,
            }}
            onMouseEnter={handleSubMenuEnter}
            onMouseLeave={handleSubMenuLeave}
          >
            {item.subItems!.map((subItem, ii) => (
              <MenuItemRow key={ii} item={subItem} onCopy={onCopy} />
            ))}
          </SubMenu>
        )}
      </ItemContainer>
    </SubMenuContainer>
  );
}


// ─── Main Component ───────────────────────────────────────────────────────

/**
 * Computes viewport-safe position to prevent menu from going off-screen.
 */
function clampedPosition(x: number, y: number, estimatedHeight: number): { top: number; left: number } {
  const menuW = 260;
  const left = x + menuW > window.innerWidth ? x - menuW : x;
  const top = y + estimatedHeight > window.innerHeight ? y - estimatedHeight : y;
  return { top, left };
}

/**
 * Shared sidebar context menu.
 * Renders section headers + items with Lucide icons.
 * Supports clipboard toast via `onCopy` callback pattern.
 */
export function SidebarContextMenu({ x, y, sections, onClose, onCopy }: SidebarContextMenuProps) {
  const [copied, setCopied] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Use capture phase so it fires before child element handlers
    document.addEventListener('mousedown', handleClickOutside, true);
    return () => document.removeEventListener('mousedown', handleClickOutside, true);
  }, [onClose]);

  // Estimate total height for clamping: each section header ~28px, each item ~36px
  let estimatedHeight = 0;
  for (const sec of sections) {
    estimatedHeight += 28 + sec.items.length * 36;
  }
  const { top, left } = clampedPosition(x, y, estimatedHeight);

  const handleCopy = async (text: string) => {
    if (onCopy) {
      await onCopy(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    onClose();
  };

  return (
    <>
      <MenuContainer ref={menuRef} $top={top} $left={left} onMouseDown={e => e.stopPropagation()}>
        {sections.map((section, si) => (
          <React.Fragment key={section.title}>
            <SectionHeader>{section.title}</SectionHeader>
            {section.items.map((item, ii) => (
              <MenuItemRow key={`${section.title}-${ii}`} item={item} onCopy={handleCopy} />
            ))}
            {si < sections.length - 1 && (
              <div style={{ borderTop: `1px solid ${tokens.border.default}` }} />
            )}
          </React.Fragment>
        ))}
      </MenuContainer>

      {copied && (
        <Toast>
          <Check size={13} style={{ marginRight: 6 }} />
          Copied!
        </Toast>
      )}
    </>
  );
}

// ─── Export common icon mappings ──────────────────────────────────────────
export {
  Pencil, Trash2, Globe, Link, Copy, FileText,
  RefreshCw, Pause, Download, VenetianMask, Check,
  FolderOpen, Plus, ExternalLink, Code, File,
};

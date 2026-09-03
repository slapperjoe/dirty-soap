import React from "react";
import {
  Settings,
  HelpCircle,
  Compass,
  FlaskConical,
  Home,
  Clock,
  Workflow,
  Shuffle,
  Server,
  Eye,
  Activity,
  FileText,
  Layers,
} from "lucide-react";
import { SidebarView } from "@shared/models";
import { EnvironmentSelector } from "./EnvironmentSelector";

interface SidebarRailProps {
  activeView: SidebarView;
  onChangeView: (view: SidebarView) => void;
  onOpenSettings?: () => void;
  onOpenHelp?: () => void;
  activeEnvironment?: string;
  environments?: Record<string, any>;
  onChangeEnvironment?: (env: string) => void;
  onMobileClose?: () => void;
  hasUpdate?: boolean;
}

const NavItem = ({ icon: Icon, active, onClick, title, showBadge }: any) => (
  <div
    onClick={onClick}
    title={title}
    style={{
      padding: "4px 6px",
      cursor: "pointer",
      display: "flex",
      justifyContent: "center",
    }}
  >
    <div
      style={{
        position: "relative",
        display: "inline-flex",
        padding: "5px",
        borderRadius: "6px",
        color: active
          ? "var(--apinox-activityBar-foreground)"
          : "var(--apinox-activityBar-inactiveForeground)",
        backgroundColor: active
          ? "var(--apinox-list-activeSelectionBackground)"
          : "transparent",
        transition: "background-color 0.12s ease, color 0.12s ease",
      }}
    >
      <Icon size={20} strokeWidth={active ? 2.5 : 2} />
      {showBadge && (
        <div
          style={{
            position: "absolute",
            top: 2,
            right: 2,
            width: 7,
            height: 7,
            borderRadius: "50%",
            backgroundColor: "var(--apinox-badge-background, #e85b4a)",
            border: "1px solid var(--apinox-activityBar-background, #333)",
            pointerEvents: "none",
          }}
        />
      )}
    </div>
  </div>
);

const RailSeparator = () => (
  <div
    style={{
      margin: "6px 10px",
      borderTop: "1px solid currentColor",
      color: "var(--apinox-activityBar-foreground, #cccccc)",
      opacity: 0.25,
      flexShrink: 0,
    }}
  />
);

export const SidebarRail: React.FC<SidebarRailProps> = ({
  activeView,
  onChangeView,
  onOpenSettings,
  onOpenHelp,
  activeEnvironment,
  environments,
  onChangeEnvironment,
  onMobileClose,
  hasUpdate,
}) => {
  return (
    <div
      style={{
        width: 50,
        backgroundColor: "var(--apinox-activityBar-background)",
        borderRight: "1px solid var(--apinox-activityBar-border)",
        display: "flex",
        flexDirection: "column",
        paddingTop: 10,
        flexShrink: 0,
      }}
    >
      {/* The legacy PROJECTS/Workspace rail entry was removed — the unified
          explorer is the entry point. The PROJECTS view stays reachable
          programmatically (test-step hand-off, legacy deep links) but is no
          longer on the rail. */}
      <NavItem
        icon={Layers}
        active={activeView === SidebarView.UNIFIED_EXPLORER}
        onClick={() => onChangeView(SidebarView.UNIFIED_EXPLORER)}
        title="Unified Explorer"
      />
      <NavItem
        icon={FlaskConical}
        active={activeView === SidebarView.TESTS}
        onClick={() => onChangeView(SidebarView.TESTS)}
        title="Tests"
      />
      <NavItem
        icon={Workflow}
        active={activeView === SidebarView.WORKFLOWS}
        onClick={() => onChangeView(SidebarView.WORKFLOWS)}
        title="Workflows"
      />
      <NavItem
        icon={Activity}
        active={activeView === SidebarView.PERFORMANCE}
        onClick={() => onChangeView(SidebarView.PERFORMANCE)}
        title="Performance"
      />
      <NavItem
        icon={Clock}
        active={activeView === SidebarView.HISTORY}
        onClick={() => onChangeView(SidebarView.HISTORY)}
        title="History"
      />

      <RailSeparator />

      <NavItem
        icon={FileText}
        active={activeView === SidebarView.NOTES}
        onClick={() => onChangeView(SidebarView.NOTES)}
        title="Notes"
      />

      <RailSeparator />

      <NavItem
        icon={Shuffle}
        active={activeView === SidebarView.PROXY}
        onClick={() => onChangeView(SidebarView.PROXY)}
        title="Proxy &amp; Traffic"
      />
      <NavItem
        icon={Server}
        active={activeView === SidebarView.MOCK}
        onClick={() => onChangeView(SidebarView.MOCK)}
        title="Mock Server"
      />
      <NavItem
        icon={Eye}
        active={activeView === SidebarView.WATCHER}
        onClick={() => onChangeView(SidebarView.WATCHER)}
        title="File Watcher"
      />

      <div style={{ flex: 1 }}></div>

      <RailSeparator />

      <EnvironmentSelector
        activeEnvironment={activeEnvironment}
        environments={environments}
        onChangeEnvironment={onChangeEnvironment}
      />

      <div
        style={{
          paddingBottom: 10,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 10,
        }}
      >
        <NavItem
          icon={Home}
          active={activeView === SidebarView.HOME}
          onClick={() => onChangeView(SidebarView.HOME)}
          title="Home"
        />
        <NavItem icon={Settings} onClick={onOpenSettings} title="Settings" showBadge={hasUpdate} />
        <NavItem icon={HelpCircle} onClick={onOpenHelp} title="Help" />
        {onMobileClose && (
          <div
            onClick={onMobileClose}
            className="touch-compact"
            style={{
              cursor: "pointer",
              padding: "6px",
              display: "flex",
              justifyContent: "center",
              color: "var(--apinox-icon-foreground)",
            }}
            title="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
};

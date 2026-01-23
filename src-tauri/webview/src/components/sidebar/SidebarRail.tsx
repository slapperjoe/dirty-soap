import React from 'react';
import { Settings, HelpCircle, Eye, Compass, FolderOpen as FolderIcon, FlaskConical, Network, Activity, Home, Clock } from 'lucide-react';
import { SidebarView } from '@shared/models';
import { EnvironmentSelector } from './EnvironmentSelector';

interface SidebarRailProps {
    activeView: SidebarView;
    onChangeView: (view: SidebarView) => void;
    onOpenSettings?: () => void;
    onOpenHelp?: () => void;
    activeEnvironment?: string;
    environments?: Record<string, any>;
    onChangeEnvironment?: (env: string) => void;
}

const NavItem = ({ icon: Icon, active, onClick, title }: any) => (
    <div
        onClick={onClick}
        style={{
            padding: '10px 0',
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'center',
            color: active ? 'var(--vscode-activityBar-foreground)' : 'var(--vscode-activityBar-inactiveForeground)',
            borderLeft: active ? '2px solid var(--vscode-activityBar-activeBorder)' : '2px solid transparent',
            backgroundColor: active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent'
        }}
        title={title}
    >
        <Icon size={24} strokeWidth={active ? 2.5 : 2} />
    </div>
);

export const SidebarRail: React.FC<SidebarRailProps> = ({
    activeView,
    onChangeView,
    onOpenSettings,
    onOpenHelp,
    activeEnvironment,
    environments,
    onChangeEnvironment
}) => {
    return (
        <div style={{
            width: 50,
            backgroundColor: 'var(--vscode-activityBar-background)',
            borderRight: '1px solid var(--vscode-activityBar-border)',
            display: 'flex',
            flexDirection: 'column',
            paddingTop: 10,
            flexShrink: 0
        }}>
            <NavItem
                icon={Home}
                active={activeView === SidebarView.HOME}
                onClick={() => onChangeView(SidebarView.HOME)}
                title="Home"
            />
            <NavItem
                icon={FolderIcon}
                active={activeView === SidebarView.PROJECTS}
                onClick={() => onChangeView(SidebarView.PROJECTS)}
                title="Projects"
            />
            <NavItem
                icon={Compass}
                active={activeView === SidebarView.EXPLORER}
                onClick={() => onChangeView(SidebarView.EXPLORER)}
                title="WSDL Explorer"
            />
            <NavItem
                icon={Eye}
                active={activeView === SidebarView.WATCHER}
                onClick={() => onChangeView(SidebarView.WATCHER)}
                title="File Watcher"
            />
            <NavItem
                icon={Network}
                active={activeView === SidebarView.SERVER}
                onClick={() => onChangeView(SidebarView.SERVER)}
                title="Server"
            />
            <NavItem
                icon={FlaskConical}
                active={activeView === SidebarView.TESTS}
                onClick={() => onChangeView(SidebarView.TESTS)}
                title="Tests"
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

            <div style={{ flex: 1 }}></div>

            <EnvironmentSelector
                activeEnvironment={activeEnvironment}
                environments={environments}
                onChangeEnvironment={onChangeEnvironment}
            />

            <div style={{ paddingBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <NavItem icon={Settings} onClick={onOpenSettings} title="Settings" />
                <NavItem icon={HelpCircle} onClick={onOpenHelp} title="Help" />
            </div>
        </div>
    );
};

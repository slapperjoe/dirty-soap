import React, { createContext, useContext, useState, useEffect, startTransition, ReactNode } from 'react';
import { SidebarView } from '@shared/models';
import { BackendCommand } from '@shared/messages';

declare const __APP_VERSION__: string;

const LAST_OPENED_VERSION_KEY = 'apinox:lastOpenedVersion';

function shouldShowWelcomeOnStartup(): boolean {
    const current = __APP_VERSION__; // e.g. "0.17.122"
    const currentPatch = parseInt(current.split('.')[2] ?? '0', 10);
    const stored = localStorage.getItem(LAST_OPENED_VERSION_KEY) ?? '';
    const storedPatch = parseInt(stored.split('.')[2] ?? '0', 10);
    localStorage.setItem(LAST_OPENED_VERSION_KEY, current);
    return currentPatch > storedPatch;
}

interface NavigationContextType {
    activeView: SidebarView;
    setActiveView: React.Dispatch<React.SetStateAction<SidebarView>>;
    sidebarExpanded: boolean;
    setSidebarExpanded: (expanded: boolean) => void;
    toggleSidebar: () => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export const useNavigation = () => {
    const context = useContext(NavigationContext);
    if (!context) {
        throw new Error('useNavigation must be used within a NavigationProvider');
    }
    return context;
};

export const NavigationProvider = ({ children }: { children: ReactNode }) => {
    const [activeView, _setActiveView] = useState<SidebarView>(
        () => shouldShowWelcomeOnStartup() ? SidebarView.HOME : SidebarView.UNIFIED_EXPLORER
    );
    const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);

    const toggleSidebar = () => setSidebarExpanded(prev => !prev);

    // Wrap setActiveView in startTransition to handle lazy-loaded views
    // This prevents "component suspended while responding to synchronous input" errors
    // when switching to views that contain React.lazy components (NotesEditor, ProxyPanel, etc.)
    const setActiveView = (view: React.SetStateAction<SidebarView>) => {
        startTransition(() => {
            _setActiveView(view);
        });
    };

    // Message Handling
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = event.data;
            switch (message.command) {
                case BackendCommand.ToggleSidebar:
                    setSidebarExpanded(prev => !prev);
                    break;
                case BackendCommand.SwitchToView:
                    if (message.view) {
                        // Map string to SidebarView enum if necessary, or assume direct match
                        // The backend might send string 'explorer', 'tests', etc.
                        // Phase B (t_86c34d38): the legacy PROJECTS view is
                        // deleted. The 'projects' deep-link key is retained
                        // (backward compat) and now resolves to the unified
                        // explorer — the sole project surface.
                        const viewMap: Record<string, SidebarView> = {
                            'explorer': SidebarView.UNIFIED_EXPLORER,
                            'unified_explorer': SidebarView.UNIFIED_EXPLORER,
                            'home': SidebarView.HOME,
                            'projects': SidebarView.UNIFIED_EXPLORER,
                            'proxy': SidebarView.PROXY,
                            'mock': SidebarView.MOCK,
                            'watcher': SidebarView.WATCHER,
                            'tests': SidebarView.TESTS,
                            'performance': SidebarView.PERFORMANCE,
                            'history': SidebarView.HISTORY
                        };
                        const view = viewMap[message.view] || message.view as SidebarView;
                        setActiveView(view);
                        setSidebarExpanded(true); // Auto-expand when switching view
                    }
                    break;
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, []);

    return (
        <NavigationContext.Provider value={{
            activeView,
            setActiveView,
            sidebarExpanded,
            setSidebarExpanded,
            toggleSidebar
        }}>
            {children}
        </NavigationContext.Provider>
    );
};

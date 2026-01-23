import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { SidebarView } from '@shared/models';
import { BackendCommand } from '@shared/messages';

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
    const [activeView, setActiveView] = useState<SidebarView>(SidebarView.EXPLORER);
    const [sidebarExpanded, setSidebarExpanded] = useState<boolean>(true);

    const toggleSidebar = () => setSidebarExpanded(prev => !prev);

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
                        const viewMap: Record<string, SidebarView> = {
                            'explorer': SidebarView.EXPLORER,
                            'home': SidebarView.HOME,
                            'projects': SidebarView.PROJECTS,
                            'mock': SidebarView.SERVER, // Mapped to Server
                            'proxy': SidebarView.SERVER, // Mapped to Server
                            'debug': SidebarView.WATCHER, // Mapped to Watcher
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

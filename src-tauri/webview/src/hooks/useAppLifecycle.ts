import { useEffect } from 'react';
import { bridge, isTauri } from '../utils/bridge';
import { ApinoxProject } from '@shared/models';

interface UseAppLifecycleProps {
    projects: ApinoxProject[];
    selectedProjectName: string | null;
    saveProject: (project: ApinoxProject) => void;
    setSelectedProjectName: (name: string | null) => void;
    setRequestHistory: (history: any[]) => void;
}

export const useAppLifecycle = ({
    projects,
    selectedProjectName,
    saveProject,
    setSelectedProjectName,
    setRequestHistory
}: UseAppLifecycleProps) => {

    // Initial Load & Backend Sync
    useEffect(() => {
        const loadSettings = async () => {
            // Load settings from Rust backend
            try {
                const config = await bridge.invokeTauriCommand('get_settings', {});
                if (config) {
                    // Emit settings update event so ConfigContext can update
                    bridge.emit({ command: 'settingsUpdate', config } as any);
                }
            } catch (error) {
                console.error('[useAppLifecycle] Failed to load settings:', error);
            }
        };

        // Request settings on load
        loadSettings();
        
        // Load history from Rust
        bridge.invokeTauriCommand('get_history', {})
            .then(history => setRequestHistory(history))
            .catch(err => console.error('[useAppLifecycle] Failed to load history:', err));

        // Retrieve initial state from bridge
        const state = bridge.getState();
        if (state) {
            if (state.lastSelectedProject) setSelectedProjectName(state.lastSelectedProject);
        }
    }, []); // Run once on mount

    // Tauri window persistence (size/position)
    useEffect(() => {
        if (!isTauri()) return;

        let unlistenMoved: (() => void) | undefined;
        let unlistenResized: (() => void) | undefined;

        const setupWindowPersistence = async () => {
            const windowApi = await import('@tauri-apps/api/window');
            const { LogicalSize, LogicalPosition } = await import('@tauri-apps/api/dpi');
            const appWindow = (windowApi as any).getCurrentWindow
                ? (windowApi as any).getCurrentWindow()
                : (windowApi as any).appWindow;

            if (!appWindow) {
                console.error('[WindowState] Unable to access current window');
                return;
            }

            // Restore window state if available
            try {
                const saved = localStorage.getItem('apinox_window_state');
                if (saved) {
                    const parsed = JSON.parse(saved) as { x: number; y: number; width: number; height: number };
                    if (
                        typeof parsed.x === 'number' &&
                        typeof parsed.y === 'number' &&
                        typeof parsed.width === 'number' &&
                        typeof parsed.height === 'number'
                    ) {
                        const monitor = await appWindow.currentMonitor();
                        if (monitor) {
                            const monitorX = monitor.position.x;
                            const monitorY = monitor.position.y;
                            const monitorW = monitor.size.width;
                            const monitorH = monitor.size.height;

                            const width = Math.min(parsed.width, monitorW);
                            const height = Math.min(parsed.height, monitorH);
                            const maxX = monitorX + monitorW - width;
                            const maxY = monitorY + monitorH - height;
                            const x = Math.max(monitorX, Math.min(parsed.x, maxX));
                            const y = Math.max(monitorY, Math.min(parsed.y, maxY));

                            await appWindow.setSize(new LogicalSize(width, height));
                            await appWindow.setPosition(new LogicalPosition(x, y));
                        } else {
                            await appWindow.setSize(new LogicalSize(parsed.width, parsed.height));
                            await appWindow.setPosition(new LogicalPosition(parsed.x, parsed.y));
                        }
                    }
                }
            } catch (e) {
                console.error('[WindowState] Failed to restore window state', e);
            }

            const saveState = async () => {
                try {
                    const pos = await appWindow.innerPosition();
                    const size = await appWindow.innerSize();
                    const state = {
                        x: pos.x,
                        y: pos.y,
                        width: size.width,
                        height: size.height
                    };
                    localStorage.setItem('apinox_window_state', JSON.stringify(state));
                } catch (e) {
                    console.error('[WindowState] Failed to save window state', e);
                }
            };

            unlistenMoved = await appWindow.onMoved(() => {
                void saveState();
            });
            unlistenResized = await appWindow.onResized(() => {
                void saveState();
            });
        };

        void setupWindowPersistence();

        return () => {
            if (unlistenMoved) unlistenMoved();
            if (unlistenResized) unlistenResized();
        };
    }, []);

    // Save State & Autosave
    useEffect(() => {
        const state = {
            projects,
            lastSelectedProject: selectedProjectName
        };
        bridge.setState(state);
    }, [projects, selectedProjectName]);
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                // Save all dirty projects
                projects.forEach(p => {
                    if (p.dirty) {
                        saveProject(p);
                    }
                });
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [projects, saveProject]);

    // Warn about unsaved changes on close
    useEffect(() => {
        const hasDirtyProjects = projects.some(p => p.dirty);
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasDirtyProjects) {
                e.preventDefault();
                e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
                return e.returnValue;
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [projects]);
};

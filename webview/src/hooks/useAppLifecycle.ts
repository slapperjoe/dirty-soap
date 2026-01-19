import { useEffect } from 'react';
import { bridge, isTauri } from '../utils/bridge';
import { FrontendCommand } from '@shared/messages';
import { ApinoxProject, ApiInterface } from '@shared/models';

interface UseAppLifecycleProps {
    projects: ApinoxProject[];
    exploredInterfaces: ApiInterface[];
    explorerExpanded: boolean;
    wsdlUrl: string;
    selectedProjectName: string | null;
    saveProject: (project: ApinoxProject) => void;
    setProjects: (projects: ApinoxProject[]) => void;
    setExploredInterfaces: (interfaces: ApiInterface[]) => void;
    setExplorerExpanded: (expanded: boolean) => void;
    setWsdlUrl: (url: string) => void;
    setSelectedProjectName: (name: string | null) => void;
}

export const useAppLifecycle = ({
    projects,
    exploredInterfaces,
    explorerExpanded,
    wsdlUrl,
    selectedProjectName,
    saveProject,
    setProjects,
    setExploredInterfaces,
    setExplorerExpanded,
    setWsdlUrl,
    setSelectedProjectName
}: UseAppLifecycleProps) => {

    // Initial Load & Backend Sync
    useEffect(() => {
        const loadSettings = async () => {
            if (!isTauri()) {
                bridge.sendMessage({ command: 'getSettings' });
                return;
            }

            const { invoke } = await import('@tauri-apps/api/core');

            const waitForSidecar = async () => {
                const maxAttempts = 40;
                for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
                    try {
                        const ready = await invoke<boolean>('is_sidecar_ready');
                        if (ready) return true;
                    } catch (e) {
                        // ignore and retry
                    }
                    await new Promise(resolve => setTimeout(resolve, 250));
                }
                return false;
            };

            const ready = await waitForSidecar();
            if (!ready) return;

            try {
                const data: any = await bridge.sendMessageAsync({ command: FrontendCommand.GetSettings });
                bridge.emit({
                    command: 'settingsUpdate',
                    config: data?.config ?? data,
                    raw: data?.raw,
                    configDir: data?.configDir,
                    configPath: data?.configPath
                } as any);
            } catch (e) {
                // ignore; no settings available
            }
        };

        // Request settings on load
        loadSettings();
        bridge.sendMessage({ command: 'getAutosave' });
        bridge.sendMessage({ command: 'getWatcherHistory' });
        bridge.sendMessage({ command: FrontendCommand.GetHistory });

        // Retrieve initial state from bridge
        const state = bridge.getState();
        if (state) {
            setProjects(state.projects || []);
            setExploredInterfaces(state.exploredInterfaces || []);
            setExplorerExpanded(state.explorerExpanded ?? true);
            setWsdlUrl(state.wsdlUrl || '');
            if (state.lastSelectedProject) setSelectedProjectName(state.lastSelectedProject);

            // Force reload projects from disk to ensure fresh content
            if (state.projects) {
                state.projects.forEach((p: any) => {
                    if (p.fileName) {
                        bridge.sendMessage({ command: 'loadProject', path: p.fileName });
                    }
                });
            }
        }

        // Test Backend Connection (Keep-alive)
        bridge.sendMessage({ command: 'echo', message: 'ping' });
        // Retry every 60 seconds
        const interval = setInterval(() => {
            bridge.sendMessage({ command: 'echo', message: 'ping' });
        }, 60000);
        return () => clearInterval(interval);
    }, []); // Run once on mount

    // Tauri window persistence (size/position)
    useEffect(() => {
        if (!isTauri()) return;

        let unlistenMoved: (() => void) | undefined;
        let unlistenResized: (() => void) | undefined;

        const setupWindowPersistence = async () => {
            const windowApi = await import('@tauri-apps/api/window');
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

                            await appWindow.setSize(new windowApi.LogicalSize(width, height));
                            await appWindow.setPosition(new windowApi.LogicalPosition(x, y));
                        } else {
                            await appWindow.setSize(new windowApi.LogicalSize(parsed.width, parsed.height));
                            await appWindow.setPosition(new windowApi.LogicalPosition(parsed.x, parsed.y));
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
            exploredInterfaces,
            explorerExpanded,
            wsdlUrl,
            lastSelectedProject: selectedProjectName
        };
        bridge.setState(state);

        // Autosave to file (debounced)
        const timer = setTimeout(() => {
            bridge.sendMessage({ command: 'autoSaveWorkspace', content: JSON.stringify(state) });
        }, 2000);
        return () => clearTimeout(timer);
    }, [projects, exploredInterfaces, explorerExpanded, wsdlUrl, selectedProjectName]);

    // Ctrl+S keyboard shortcut to save all dirty projects
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

    // Auto-save Open Projects (Project Paths)
    useEffect(() => {
        // Collect file names of all open projects
        const paths = projects.map(p => p.fileName).filter(Boolean) as string[];
        // Debounce slightly to avoid excessive writes
        const timer = setTimeout(() => {
            bridge.sendMessage({ command: 'saveOpenProjects', paths });
        }, 1000);
        return () => clearTimeout(timer);
    }, [projects]);
};

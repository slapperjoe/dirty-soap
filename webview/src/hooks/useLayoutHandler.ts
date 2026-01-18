import { useState, useCallback, useEffect } from 'react';
import { SidebarView } from '@shared/models';

interface UseLayoutHandlerProps {
    config: any;
    setConfig: (config: any) => void;
    layoutMode: 'vertical' | 'horizontal';
    activeView: SidebarView;
    setActiveView: (view: SidebarView) => void;
    sidebarExpanded: boolean;
    setSidebarExpanded: (expanded: boolean) => void;
    selectedRequest: any;
    setSelectedInterface: (iface: any) => void;
    setSelectedOperation: (op: any) => void;
    setSelectedRequest: (req: any) => void;
    setSelectedTestCase: (tc: any) => void;
    selectedPerformanceSuiteId: string | null;
    setSelectedPerformanceSuiteId: (id: string | null) => void;
}

export const useLayoutHandler = ({
    config,

    setConfig,
    layoutMode,
    activeView,
    setActiveView,
    sidebarExpanded,
    setSidebarExpanded,
    selectedRequest,
    setSelectedInterface,
    setSelectedOperation,
    setSelectedRequest,
    setSelectedTestCase,
    selectedPerformanceSuiteId,
    setSelectedPerformanceSuiteId
}: UseLayoutHandlerProps) => {
    const [isResizing, setIsResizing] = useState(false);

    // Split Ratio (default 50%)
    const [splitRatio, setSplitRatioState] = useState(0.5);

    // Sync split ratio with config
    useEffect(() => {
        if (config?.ui?.splitRatio !== undefined) {
            const rawRatio = config.ui.splitRatio;
            const normalized = rawRatio > 1 ? rawRatio / 100 : rawRatio;
            setSplitRatioState(Math.min(0.8, Math.max(0.2, normalized)));
        }
    }, [config]);

    const setSplitRatio = useCallback((ratio: number) => {
        setSplitRatioState(ratio);
        // Debounce config update if needed, or update on stopResizing
    }, []);

    const startResizing = useCallback(() => setIsResizing(true), []);

    const stopResizing = useCallback(() => {
        setIsResizing(false);
        if (config) {
            const newConfig = { ...config, ui: { ...config?.ui, splitRatio } };
            setConfig(newConfig);
        }
    }, [config, splitRatio, setConfig]);

    const resize = useCallback(
        (e: MouseEvent) => {
            if (isResizing) {
                const base = layoutMode === 'horizontal' ? window.innerWidth : window.innerHeight;
                const position = layoutMode === 'horizontal' ? e.clientX : e.clientY;
                const ratio = base > 0 ? position / base : 0.5;
                const clamped = Math.min(0.8, Math.max(0.2, ratio));
                setSplitRatio(clamped);
            }
        },
        [isResizing, layoutMode, setSplitRatio]
    );

    useEffect(() => {
        if (isResizing) {
            window.addEventListener('mousemove', resize);
            window.addEventListener('mouseup', stopResizing);
            document.body.style.userSelect = 'none';
            document.body.style.cursor = layoutMode === 'horizontal' ? 'col-resize' : 'row-resize';
        }
        return () => {
            window.removeEventListener('mousemove', resize);
            window.removeEventListener('mouseup', stopResizing);
            document.body.style.userSelect = '';
            document.body.style.cursor = '';
        };
    }, [isResizing, layoutMode, resize, stopResizing]);

    // Auto-select logic when switching views
    const handleSetActiveViewWrapper = useCallback((view: SidebarView) => {
        if (view === activeView) {
            setSidebarExpanded(!sidebarExpanded);
            return;
        }

        setActiveView(view);
        setSidebarExpanded(true);

        // Always clear request to avoid leaking request editor across tabs
        if (selectedRequest) {
            setSelectedRequest(null);
        }

        if (view === SidebarView.HOME) {
            setSelectedOperation(null);
            setSelectedInterface(null);
            setSelectedTestCase(null);
            setSelectedPerformanceSuiteId(null);
            return;
        }

        if (view === SidebarView.PROJECTS || view === SidebarView.EXPLORER) {
            setSelectedTestCase(null);
            setSelectedPerformanceSuiteId(null);
            return;
        }

        if (view === SidebarView.TESTS) {
            setSelectedPerformanceSuiteId(null);
            return;
        }

        if (view === SidebarView.PERFORMANCE) {
            setSelectedTestCase(null);
        }
    }, [
        activeView,
        sidebarExpanded,
        setActiveView,
        selectedRequest,
        selectedPerformanceSuiteId,
        setSidebarExpanded,
        setSelectedInterface,
        setSelectedOperation,
        setSelectedRequest,
        setSelectedTestCase,
        setSelectedPerformanceSuiteId
    ]);

    return {
        isResizing,
        splitRatio,
        startResizing,
        stopResizing,
        resize,
        handleSetActiveViewWrapper,
        setSplitRatio
    };
};

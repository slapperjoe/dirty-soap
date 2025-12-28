
import React from 'react';
import { Settings, HelpCircle, Eye, Globe, Compass, FolderOpen as FolderIcon } from 'lucide-react';
import { SoapUIInterface, SoapUIOperation, SoapUIRequest, SoapUIProject, WatcherEvent, SidebarView } from '../models';

// Components
import { ProjectList } from './sidebar/ProjectList';
import { WsdlExplorer } from './sidebar/WsdlExplorer';
import { WatcherPanel } from './sidebar/WatcherPanel';
import { ProxyUi } from './sidebar/ProxyUi';

interface SidebarProps {
    savedProjects: Set<string>;
    explorerExpanded: boolean;
    toggleExplorerExpand: () => void;
    exploredInterfaces: SoapUIInterface[];
    projects: SoapUIProject[];
    inputType: 'url' | 'file';
    setInputType: (type: 'url' | 'file') => void;
    wsdlUrl: string;
    setWsdlUrl: (url: string) => void;
    selectedFile: string | null;
    loadWsdl: () => void;
    pickLocalWsdl: () => void;
    downloadStatus: string[] | null;

    // Actions
    addToProject: (iface: SoapUIInterface) => void;
    addAllToProject: () => void;
    clearExplorer: () => void;
    removeFromExplorer: (iface: SoapUIInterface) => void;

    toggleProjectExpand: (name: string) => void;
    toggleInterfaceExpand: (projName: string, ifaceName: string) => void;
    toggleOperationExpand: (projName: string, ifaceName: string, opName: string) => void;
    toggleExploredInterface: (iName: string) => void;
    toggleExploredOperation: (iName: string, oName: string) => void;

    loadProject: () => void;
    saveProject: (proj: SoapUIProject) => void;
    closeProject: (name: string) => void;
    onAddProject: () => void;

    // Selection State
    selectedProjectName: string | null;
    setSelectedProjectName: (name: string | null) => void;
    selectedInterface: SoapUIInterface | null;
    setSelectedInterface: (iface: SoapUIInterface | null) => void;
    selectedOperation: SoapUIOperation | null;
    setSelectedOperation: (op: SoapUIOperation | null) => void;
    selectedRequest: SoapUIRequest | null;
    setSelectedRequest: (req: SoapUIRequest | null) => void;
    setResponse: (res: any) => void;

    handleContextMenu: (e: React.MouseEvent, type: string, data: any, isExplorer?: boolean) => void;
    onAddRequest?: (op: SoapUIOperation) => void;
    onDeleteRequest?: (req: SoapUIRequest) => void;
    deleteConfirm: string | null;
    setDeleteConfirm: (id: string | null) => void;
    backendConnected: boolean;

    // Settings
    onOpenSettings?: () => void;
    onOpenHelp?: () => void;

    // Computed
    workspaceDirty?: boolean;
    showBackendStatus?: boolean;
    onSaveUiState?: () => void;

    // View State
    // Navigation
    activeView: SidebarView;
    onChangeView: (view: SidebarView) => void;

    // Test Runner
    onAddSuite: (projectName: string) => void;
    onDeleteSuite: (suiteId: string) => void;
    onRunSuite: (suiteId: string) => void;
    onAddTestCase: (suiteId: string) => void;
    onRunCase: (caseId: string) => void;
    onDeleteTestCase: (caseId: string) => void;
    onSelectSuite?: (suiteId: string) => void;
    onSelectTestCase?: (caseId: string) => void;
    onToggleSuiteExpand?: (suiteId: string) => void;
    onToggleCaseExpand?: (caseId: string) => void;

    // Watcher
    watcherHistory: WatcherEvent[];
    onSelectWatcherEvent: (event: WatcherEvent) => void;
    watcherRunning: boolean;
    onStartWatcher: () => void;
    onStopWatcher: () => void;
    onClearWatcher: () => void;

    // Proxy
    proxyRunning: boolean;
    onStartProxy: () => void;
    onStopProxy: () => void;
    proxyConfig: { port: number, target: string, systemProxyEnabled?: boolean };
    onUpdateProxyConfig: (config: { port: number, target: string, systemProxyEnabled?: boolean }) => void;
    proxyHistory: WatcherEvent[];
    onClearProxy: () => void;
    // Reporting
    onSaveProxyHistory: (content: string) => void;
    // Config Switcher
    configPath: string | null;
    onSelectConfigFile: () => void;
    onInjectProxy: () => void;
    onRestoreProxy: () => void;
    onOpenCertificate?: () => void;
    onDeleteInterface?: (iface: SoapUIInterface) => void;
    onDeleteOperation?: (op: SoapUIOperation, iface: SoapUIInterface) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    exploredInterfaces, projects,
    inputType, setInputType, wsdlUrl, setWsdlUrl, selectedFile, loadWsdl, pickLocalWsdl, downloadStatus,
    addToProject, addAllToProject, clearExplorer, removeFromExplorer,
    toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand,
    toggleExploredInterface, toggleExploredOperation,
    loadProject, saveProject, closeProject, onAddProject,
    onAddSuite, onDeleteSuite,
    onRunSuite,
    onAddTestCase, onRunCase, onDeleteTestCase,
    onSelectSuite, onSelectTestCase,
    setSelectedProjectName,
    selectedInterface, setSelectedInterface,
    selectedOperation, setSelectedOperation,
    selectedRequest, setSelectedRequest,
    setResponse,
    handleContextMenu, deleteConfirm, setDeleteConfirm, backendConnected,
    onOpenSettings, onOpenHelp, savedProjects, workspaceDirty,
    activeView, onChangeView, watcherHistory, onSelectWatcherEvent, watcherRunning,
    onStartWatcher, onStopWatcher, onClearWatcher,
    proxyRunning, onStartProxy, onStopProxy, proxyConfig, onUpdateProxyConfig, proxyHistory, onClearProxy,
    onSaveProxyHistory,
    configPath, onSelectConfigFile, onInjectProxy, onRestoreProxy, onOpenCertificate, onAddRequest, onDeleteRequest, onDeleteInterface, onDeleteOperation,
    onToggleSuiteExpand, onToggleCaseExpand
}) => {

    // Sidebar Navigation Rail Item
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
                backgroundColor: active ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent' // Subtle highlight
            }}
            title={title}
        >
            <Icon size={24} strokeWidth={active ? 2.5 : 2} />
        </div>
    );

    return (
        <div style={{ display: 'flex', height: '100%', flexDirection: 'row', minWidth: 300, flexShrink: 0 }}>
            {/* Left Rail */}
            <div style={{
                width: 50,
                backgroundColor: 'var(--vscode-activityBar-background)',
                borderRight: '1px solid var(--vscode-activityBar-border)',
                display: 'flex',
                flexDirection: 'column',
                paddingTop: 10
            }}>
                <NavItem
                    icon={FolderIcon}
                    active={activeView === SidebarView.PROJECTS}
                    onClick={() => onChangeView(SidebarView.PROJECTS)}
                    title="Project"
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
                    icon={Globe}
                    active={activeView === SidebarView.PROXY}
                    onClick={() => onChangeView(SidebarView.PROXY)}
                    title="Dirty Proxy"
                />

                <div style={{ flex: 1 }}></div>

                <div style={{ paddingBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <NavItem icon={Settings} onClick={onOpenSettings} title="Settings" />
                    <NavItem icon={HelpCircle} onClick={onOpenHelp} title="Help" />
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--vscode-sideBar-background)' }}>

                {activeView === SidebarView.PROXY && (
                    <ProxyUi
                        isRunning={proxyRunning}
                        config={proxyConfig}
                        history={proxyHistory}
                        onStart={onStartProxy}
                        onStop={onStopProxy}
                        onUpdateConfig={onUpdateProxyConfig}
                        onClear={onClearProxy}
                        onSelectEvent={onSelectWatcherEvent}
                        onSaveHistory={onSaveProxyHistory}
                        configPath={configPath}
                        onSelectConfigFile={onSelectConfigFile}
                        onInjectProxy={onInjectProxy}
                        onRestoreProxy={onRestoreProxy}
                        onOpenCertificate={onOpenCertificate}
                    />
                )}

                {activeView === SidebarView.WATCHER && (
                    <WatcherPanel
                        history={watcherHistory}
                        isRunning={watcherRunning}
                        onStart={onStartWatcher}
                        onStop={onStopWatcher}
                        onClear={onClearWatcher}
                        onSelectEvent={onSelectWatcherEvent}
                    />
                )}

                {activeView === SidebarView.EXPLORER && (
                    <WsdlExplorer
                        exploredInterfaces={exploredInterfaces}
                        backendConnected={backendConnected}
                        inputType={inputType}
                        setInputType={setInputType}
                        wsdlUrl={wsdlUrl}
                        setWsdlUrl={setWsdlUrl}
                        selectedFile={selectedFile}
                        loadWsdl={loadWsdl}
                        pickLocalWsdl={pickLocalWsdl}
                        downloadStatus={downloadStatus}

                        addToProject={addToProject}
                        addAllToProject={addAllToProject}
                        clearExplorer={clearExplorer}
                        removeFromExplorer={removeFromExplorer}
                        toggleExploredInterface={toggleExploredInterface}
                        toggleExploredOperation={toggleExploredOperation}

                        selectedInterface={selectedInterface}
                        setSelectedInterface={setSelectedInterface}
                        selectedOperation={selectedOperation}
                        setSelectedOperation={setSelectedOperation}
                        selectedRequest={selectedRequest}
                        setSelectedRequest={setSelectedRequest}
                        setResponse={setResponse}

                        handleContextMenu={handleContextMenu}
                    />
                )}

                {activeView === SidebarView.PROJECTS && (
                    <ProjectList
                        projects={projects}
                        savedProjects={savedProjects}
                        workspaceDirty={workspaceDirty}
                        onAddProject={onAddProject}
                        loadProject={loadProject}
                        saveProject={saveProject}
                        closeProject={closeProject}
                        toggleProjectExpand={toggleProjectExpand}
                        toggleInterfaceExpand={toggleInterfaceExpand}
                        toggleOperationExpand={toggleOperationExpand}

                        setSelectedProjectName={setSelectedProjectName}
                        selectedInterface={selectedInterface}
                        setSelectedInterface={setSelectedInterface}
                        selectedOperation={selectedOperation}
                        setSelectedOperation={setSelectedOperation}
                        selectedRequest={selectedRequest}
                        setSelectedRequest={setSelectedRequest}
                        setResponse={setResponse}

                        handleContextMenu={handleContextMenu}
                        onAddRequest={onAddRequest}
                        onDeleteInterface={onDeleteInterface}
                        onDeleteOperation={onDeleteOperation}
                        onDeleteRequest={onDeleteRequest}
                        deleteConfirm={deleteConfirm}
                        setDeleteConfirm={setDeleteConfirm}


                        onAddSuite={onAddSuite}
                        onDeleteSuite={onDeleteSuite}
                        onRunSuite={onRunSuite}
                        onAddTestCase={onAddTestCase}
                        onRunCase={onRunCase}
                        onDeleteTestCase={onDeleteTestCase}
                        onSelectSuite={onSelectSuite}
                        onSelectTestCase={onSelectTestCase}
                        onToggleSuiteExpand={onToggleSuiteExpand}
                        onToggleCaseExpand={onToggleCaseExpand}
                    />
                )}
            </div>
        </div>
    );
};

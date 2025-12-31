import React from 'react';
import { Settings, HelpCircle, Eye, Globe, Compass, FolderOpen as FolderIcon, FlaskConical } from 'lucide-react';
import { SidebarView } from '../models';

// Components
import { ProjectList } from './sidebar/ProjectList';
import { WsdlExplorer } from './sidebar/WsdlExplorer';
import { WatcherPanel } from './sidebar/WatcherPanel';
import { ProxyUi } from './sidebar/ProxyUi';
import { TestsUi } from './sidebar/TestsUi';

// Prop Groups
import {
    SidebarProjectProps,
    SidebarExplorerProps,
    SidebarWsdlProps,
    SidebarSelectionProps,
    SidebarTestRunnerProps,
    SidebarWatcherProps,
    SidebarProxyProps,
    SidebarTestsProps
} from '../types/props';

interface SidebarProps {
    projectProps: SidebarProjectProps;
    explorerProps: SidebarExplorerProps;
    wsdlProps: SidebarWsdlProps;
    selectionProps: SidebarSelectionProps;
    testRunnerProps: SidebarTestRunnerProps;
    watcherProps: SidebarWatcherProps;
    proxyProps: SidebarProxyProps;
    testsProps: SidebarTestsProps;

    // View State
    activeView: SidebarView;
    onChangeView: (view: SidebarView) => void;

    // Global/Computed
    backendConnected: boolean;
    workspaceDirty?: boolean;
    showBackendStatus?: boolean;
    onSaveUiState?: () => void;
    onOpenSettings?: () => void;
    onOpenHelp?: () => void;

    // Legacy/Unused or to be cleaned up
    savedProjects?: Set<string>; // Duplicate of projectProps.savedProjects
    explorerExpanded?: boolean; // Duplicate
}

export const Sidebar: React.FC<SidebarProps> = ({
    projectProps,
    explorerProps,
    wsdlProps,
    selectionProps,
    testRunnerProps: _testRunnerProps, // Legacy, tests now use testsProps
    watcherProps,
    proxyProps,
    testsProps,
    backendConnected,
    workspaceDirty,
    onOpenSettings,
    onOpenHelp,
    activeView,
    onChangeView
}) => {
    // Destructure for passing to legacy children (can be cleaned up later by moving groups down)
    const { projects, savedProjects, loadProject, saveProject, closeProject, onAddProject, toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand, onDeleteInterface, onDeleteOperation } = projectProps;
    const { exploredInterfaces, addToProject, addAllToProject, clearExplorer, removeFromExplorer, toggleExploredInterface, toggleExploredOperation } = explorerProps;
    const { inputType, setInputType, wsdlUrl, setWsdlUrl, selectedFile, loadWsdl, pickLocalWsdl, downloadStatus } = wsdlProps;
    const {
        selectedProjectName, setSelectedProjectName,
        selectedInterface, setSelectedInterface,
        selectedOperation, setSelectedOperation,
        selectedRequest, setSelectedRequest,
        setResponse, handleContextMenu, onAddRequest, onDeleteRequest,
        deleteConfirm, setDeleteConfirm
    } = selectionProps;
    const {
        history: watcherHistory, onSelectEvent: onSelectWatcherEvent, isRunning: watcherRunning,
        onStart: onStartWatcher, onStop: onStopWatcher, onClear: onClearWatcher
    } = watcherProps;
    const {
        history: proxyHistory, isRunning: proxyRunning, config: proxyConfig,
        onStart: onStartProxy, onStop: onStopProxy, onUpdateConfig: onUpdateProxyConfig, onClear: onClearProxy,
        onSaveHistory: onSaveProxyHistory, configPath, onSelectConfigFile, onInject: onInjectProxy, onRestore: onRestoreProxy, onOpenCertificate,
        breakpoints, onUpdateBreakpoints
    } = proxyProps;

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
                <NavItem
                    icon={FlaskConical}
                    active={activeView === SidebarView.TESTS}
                    onClick={() => onChangeView(SidebarView.TESTS)}
                    title="Tests"
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
                        breakpoints={breakpoints}
                        onUpdateBreakpoints={onUpdateBreakpoints}
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

                {activeView === SidebarView.TESTS && (
                    <TestsUi
                        projects={testsProps.projects}
                        onAddSuite={testsProps.onAddSuite}
                        onDeleteSuite={testsProps.onDeleteSuite}
                        onRunSuite={testsProps.onRunSuite}
                        onAddTestCase={testsProps.onAddTestCase}
                        onDeleteTestCase={testsProps.onDeleteTestCase}
                        onRunCase={testsProps.onRunCase}
                        onSelectSuite={testsProps.onSelectSuite}
                        onSelectTestCase={testsProps.onSelectTestCase}
                        onToggleSuiteExpand={testsProps.onToggleSuiteExpand}
                        onToggleCaseExpand={testsProps.onToggleCaseExpand}
                        deleteConfirm={testsProps.deleteConfirm}
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

                        selectedProjectName={selectedProjectName}
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
                    />
                )}
            </div>
        </div>
    );
};

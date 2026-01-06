import React from 'react';
import { Settings, HelpCircle, Eye, Compass, FolderOpen as FolderIcon, FlaskConical, Network, Activity, Home, Clock } from 'lucide-react';
import { SidebarView } from '../models';

// Components
import { ProjectList } from './sidebar/ProjectList';
import { WsdlExplorer } from './sidebar/WsdlExplorer';
import { WatcherPanel } from './sidebar/WatcherPanel';
import { TestsUi } from './sidebar/TestsUi';
import { ServerUi } from './sidebar/ServerUi';
import { PerformanceUi } from './sidebar/PerformanceUi';
import { HistorySidebar } from './sidebar/HistorySidebar';

// Prop Groups
import {
    SidebarProjectProps,
    SidebarExplorerProps,
    SidebarWsdlProps,
    SidebarSelectionProps,
    SidebarTestRunnerProps,
    SidebarWatcherProps,
    SidebarTestsProps,
    SidebarServerProps,
    SidebarPerformanceProps,
    SidebarHistoryProps
} from '../types/props';

interface SidebarProps {
    projectProps: SidebarProjectProps;
    explorerProps: SidebarExplorerProps;
    wsdlProps: SidebarWsdlProps;
    selectionProps: SidebarSelectionProps;
    testRunnerProps: SidebarTestRunnerProps;
    watcherProps: SidebarWatcherProps;
    testsProps: SidebarTestsProps;
    serverProps?: SidebarServerProps;
    performanceProps?: SidebarPerformanceProps;
    historyProps?: SidebarHistoryProps;

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

    // Environment indicator
    activeEnvironment?: string;
    environments?: Record<string, any>;
    onChangeEnvironment?: (env: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
    projectProps,
    explorerProps,
    wsdlProps,
    selectionProps,
    testRunnerProps: _testRunnerProps, // Legacy, tests now use testsProps
    watcherProps,
    testsProps,
    serverProps,
    performanceProps,
    historyProps,
    backendConnected,
    workspaceDirty,
    onOpenSettings,
    onOpenHelp,
    activeView,
    onChangeView,
    activeEnvironment,
    environments,
    onChangeEnvironment
}) => {
    const [showEnvMenu, setShowEnvMenu] = React.useState(false);

    const envColors = ['#58A6FF', '#7EE787', '#FF7B72', '#FFA657', '#D29922', '#F2CC60', '#3FB950', '#A371F7', '#79C0FF', '#FFA198', '#FFCB6B', '#C9D1D9'];
    const getEnvColor = (env: string) => {
        if (!environments) return 'var(--vscode-charts-green)';
        const envData = environments[env];
        if (envData?.color) return envData.color;
        const index = Object.keys(environments).indexOf(env);
        return index >= 0 ? envColors[index % envColors.length] : 'var(--vscode-charts-green)';
    };
    // Destructure for passing to legacy children (can be cleaned up later by moving groups down)
    const { projects, savedProjects, loadProject, saveProject, closeProject, onAddProject, toggleProjectExpand, toggleInterfaceExpand, toggleOperationExpand, onDeleteInterface, onDeleteOperation } = projectProps;
    const { exploredInterfaces, addToProject, addAllToProject, clearExplorer, removeFromExplorer, toggleExploredInterface, toggleExploredOperation } = explorerProps;
    const { inputType, setInputType, wsdlUrl, setWsdlUrl, wsdlUrlHistory, selectedFile, loadWsdl, pickLocalWsdl, downloadStatus, useProxy, setUseProxy } = wsdlProps;
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
                    icon={Home}
                    active={activeView === SidebarView.HOME}
                    onClick={() => onChangeView(SidebarView.HOME)}
                    title="Home"
                />
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

                {/* Environment Badge */}
                {activeEnvironment && (
                    <div style={{ position: 'relative' }}>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                padding: '8px 4px',
                                marginBottom: 5,
                                cursor: onChangeEnvironment ? 'pointer' : 'default',
                                opacity: showEnvMenu ? 0.7 : 1
                            }}
                            title={`Active Environment: ${activeEnvironment}`}
                            onClick={() => onChangeEnvironment && setShowEnvMenu(!showEnvMenu)}
                        >
                            <div style={{
                                fontSize: 9,
                                fontWeight: 600,
                                color: activeEnvironment ? getEnvColor(activeEnvironment) : 'var(--vscode-charts-green)',
                                textAlign: 'center',
                                textTransform: 'uppercase',
                                letterSpacing: '0.5px',
                                maxWidth: 45,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }}>
                                {activeEnvironment}
                            </div>
                            <div style={{
                                fontSize: 7,
                                color: 'var(--vscode-activityBar-inactiveForeground)',
                                marginTop: 2
                            }}>
                                ENV
                            </div>
                        </div>

                        {/* Environment Menu */}
                        {showEnvMenu && environments && (
                            <div style={{
                                position: 'absolute',
                                left: 50,
                                bottom: 0,
                                width: 200,
                                backgroundColor: 'var(--vscode-menu-background)',
                                border: '1px solid var(--vscode-menu-border)',
                                borderRadius: 4,
                                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                zIndex: 1000,
                                display: 'flex',
                                flexDirection: 'column',
                                padding: 4
                            }}>
                                <div style={{
                                    padding: '4px 8px',
                                    fontSize: 10,
                                    fontWeight: 'bold',
                                    borderBottom: '1px solid var(--vscode-menu-separatorBackground)',
                                    marginBottom: 4,
                                    color: 'var(--vscode-menu-foreground)',
                                    textTransform: 'uppercase'
                                }}>
                                    Switch Environment
                                </div>
                                {Object.keys(environments).map((env, index) => {
                                    // Use index directly for color assignment to avoid duplicates
                                    const fallbackColor = envColors[index % envColors.length];
                                    const color = environments[env].color || fallbackColor;

                                    return (
                                        <div
                                            key={env}
                                            onClick={() => {
                                                if (onChangeEnvironment) {
                                                    onChangeEnvironment(env);
                                                    setShowEnvMenu(false);
                                                }
                                            }}
                                            style={{
                                                padding: '6px 12px',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                                borderRadius: 3,
                                                backgroundColor: activeEnvironment === env ? 'var(--vscode-menu-selectionBackground)' : 'transparent',
                                                color: activeEnvironment === env ? 'var(--vscode-menu-selectionForeground)' : 'var(--vscode-menu-foreground)'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (activeEnvironment !== env) {
                                                    e.currentTarget.style.backgroundColor = 'var(--vscode-menu-selectionBackground)';
                                                    e.currentTarget.style.color = 'var(--vscode-menu-selectionForeground)';
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                if (activeEnvironment !== env) {
                                                    e.currentTarget.style.backgroundColor = 'transparent';
                                                    e.currentTarget.style.color = 'var(--vscode-menu-foreground)';
                                                }
                                            }}
                                        >
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color }}></div>
                                            <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{env}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}

                <div style={{ paddingBottom: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <NavItem icon={Settings} onClick={onOpenSettings} title="Settings" />
                    <NavItem icon={HelpCircle} onClick={onOpenHelp} title="Help" />
                </div>
            </div>

            {/* Content Area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', backgroundColor: 'var(--vscode-sideBar-background)' }}>

                {activeView === SidebarView.SERVER && serverProps && (
                    <ServerUi
                        {...serverProps}
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
                        onRenameTestCase={testsProps.onRenameTestCase}
                        onRunCase={testsProps.onRunCase}
                        onSelectSuite={testsProps.onSelectSuite}
                        onSelectTestCase={testsProps.onSelectTestCase}
                        onToggleSuiteExpand={testsProps.onToggleSuiteExpand}
                        onToggleCaseExpand={testsProps.onToggleCaseExpand}
                        deleteConfirm={testsProps.deleteConfirm}
                    />
                )}

                {activeView === SidebarView.PERFORMANCE && performanceProps && (
                    <PerformanceUi
                        {...performanceProps}
                    />
                )}

                {activeView === SidebarView.HISTORY && historyProps && (
                    <HistorySidebar
                        {...historyProps}
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
                        wsdlUrlHistory={wsdlUrlHistory}
                        selectedFile={selectedFile}
                        loadWsdl={loadWsdl}
                        pickLocalWsdl={pickLocalWsdl}
                        downloadStatus={downloadStatus}
                        useProxy={useProxy}
                        setUseProxy={setUseProxy}

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

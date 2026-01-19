import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { SoapClient } from '../soapClient';
import { SoapUIExporter } from '../SoapUIExporter';
import { SettingsManager } from '../utils/SettingsManager';

import { FileWatcherService } from '../services/FileWatcherService';
import { ProxyService } from '../services/ProxyService';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';
import { TestRunnerService } from '../services/TestRunnerService';
import { AzureDevOpsService } from '../services/AzureDevOpsService';
import { MockService } from '../services/MockService';
import { CoordinatorService } from '../services/CoordinatorService';
import { RefresherService } from '../services/RefresherService';
import { ApinoxProject } from '../../shared/src/models';
import { FolderProjectStorage } from '../FolderProjectStorage';

import { ICommand } from '../commands/ICommand';
import { ExecuteRequestCommand } from '../commands/ExecuteRequestCommand';
import { SaveProjectCommand } from '../commands/SaveProjectCommand';
import { UpdateTestStepCommand } from '../commands/UpdateTestStepCommand';
import { ExportNativeCommand } from '../commands/ExportNativeCommand';
import { LoadProjectCommand } from '../commands/LoadProjectCommand';
import { DownloadWsdlCommand } from '../commands/DownloadWsdlCommand';
import { LoadWsdlCommand } from '../commands/LoadWsdlCommand';
import { GetLocalWsdlsCommand } from '../commands/GetLocalWsdlsCommand';
import { SelectLocalWsdlCommand } from '../commands/SelectLocalWsdlCommand';
import { BackendCommand, FrontendCommand } from '../../shared/src/messages';
import {
    StartProxyCommand,
    StopProxyCommand,
    UpdateProxyConfigCommand,
    SaveProxyHistoryCommand,
    InjectProxyCommand,
    RestoreProxyCommand,
    OpenCertificateCommand,
    ResolveBreakpointCommand,
    SetServerModeCommand
} from '../commands/ProxyCommands';

import {
    RunTestSuiteCommand,
    RunTestCaseCommand,
    PickOperationForTestCaseCommand
} from '../commands/TestCommands';

import {
    StartMockServerCommand,
    StopMockServerCommand,
    UpdateMockConfigCommand,
    UpdateMockRulesCommand,
    AddMockRuleCommand,
    DeleteMockRuleCommand,
    ToggleMockRuleCommand,
    InjectMockConfigCommand,
    RestoreMockConfigCommand,
    GetMockStatusCommand
} from '../commands/MockCommands';

import {
    GetPerformanceSuitesCommand,
    AddPerformanceSuiteCommand,
    UpdatePerformanceSuiteCommand,
    DeletePerformanceSuiteCommand,
    AddPerformanceRequestCommand,
    PickOperationForPerformanceCommand,
    UpdatePerformanceRequestCommand,
    DeletePerformanceRequestCommand,
    RunPerformanceSuiteCommand,
    AbortPerformanceSuiteCommand,
    GetPerformanceHistoryCommand,
    ImportTestSuiteToPerformanceCommand,
    ExportPerformanceResultsCommand
} from '../commands/PerformanceCommands';
import {
    GetSchedulesCommand,
    AddScheduleCommand,
    UpdateScheduleCommand,
    DeleteScheduleCommand,
    ToggleScheduleCommand
} from '../commands/ScheduleCommands';
import { ScriptCommands } from '../commands/ScriptCommands';
import { PerformanceService } from '../services/PerformanceService';
import { ScheduleService } from '../services/ScheduleService';
import { RequestHistoryService } from '../services/RequestHistoryService';
import { DiagnosticService } from '../services/DiagnosticService';
import { HistoryCommand } from '../commands/HistoryCommand';
import { WebviewReadyCommand } from '../commands/WebviewReadyCommand';
import { SAMPLES_PROJECT } from '../data/DefaultSamples';

export class WebviewController {
    private _loadedProjects: Map<string, ApinoxProject> = new Map();
    private _commands: Map<string, ICommand> = new Map();
    private _diagnosticService = DiagnosticService.getInstance();
    private _coordinatorService: CoordinatorService = new CoordinatorService();
    private _refresherService: RefresherService;

    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _extensionUri: vscode.Uri,
        private readonly _soapClient: SoapClient,
        private readonly _folderStorage: FolderProjectStorage,
        private _soapUiExporter: SoapUIExporter,
        private _settingsManager: SettingsManager,
        private readonly _fileWatcherService: FileWatcherService,
        private readonly _proxyService: ProxyService,
        private readonly _configSwitcherService: ConfigSwitcherService,
        private readonly _testRunnerService: TestRunnerService,
        private readonly _azureDevOpsService: AzureDevOpsService,
        private readonly _mockService: MockService,
        private readonly _performanceService: PerformanceService,
        private readonly _scheduleService: ScheduleService,
        private readonly _historyService: RequestHistoryService
    ) {
        this._diagnosticService.log('BACKEND', 'WebviewController Initialized');

        this._refresherService = new RefresherService(this._soapClient);

        // Initialize Commands

        this._commands.set(FrontendCommand.ExecuteRequest, new ExecuteRequestCommand(this._panel, this._soapClient, this._settingsManager, this._historyService));
        this._commands.set('webviewReady', new WebviewReadyCommand(this));
        this._commands.set(FrontendCommand.SaveProject, new SaveProjectCommand(
            this._panel,
            this._folderStorage,
            this._loadedProjects
        ));
        this._commands.set(FrontendCommand.LoadProject, new LoadProjectCommand(
            this._panel,
            this._soapClient,
            this._folderStorage,
            this._soapUiExporter,
            this._loadedProjects
        ));
        this._commands.set('exportNative', new ExportNativeCommand(
            this._panel,
            this._folderStorage,
            this._loadedProjects
        ));
        this._commands.set(FrontendCommand.DownloadWsdl, new DownloadWsdlCommand(
            this._panel,
            this._soapClient,
            this._extensionUri.fsPath,
            this._settingsManager
        ));
        this._commands.set(FrontendCommand.LoadWsdl, new LoadWsdlCommand(this._panel, this._soapClient));
        this._commands.set(FrontendCommand.GetLocalWsdls, new GetLocalWsdlsCommand(this._panel, this._soapClient, this._extensionUri.fsPath));
        this._commands.set(FrontendCommand.SelectLocalWsdl, new SelectLocalWsdlCommand(this._panel, this._soapClient));
        this._commands.set(FrontendCommand.UpdateTestStep, new UpdateTestStepCommand(
            this._panel,
            this._loadedProjects,
            this._folderStorage
        ));

        // Proxy Commands
        this._commands.set(FrontendCommand.StartProxy, new StartProxyCommand(this._proxyService));
        this._commands.set(FrontendCommand.StopProxy, new StopProxyCommand(this._proxyService));
        this._commands.set(FrontendCommand.UpdateProxyConfig, new UpdateProxyConfigCommand(this._proxyService));
        this._commands.set(FrontendCommand.SaveProxyHistory, new SaveProxyHistoryCommand());
        this._commands.set(FrontendCommand.InjectProxy, new InjectProxyCommand(this._panel, this._configSwitcherService, this._settingsManager));
        this._commands.set(FrontendCommand.RestoreProxy, new RestoreProxyCommand(this._panel, this._configSwitcherService));
        this._commands.set(FrontendCommand.OpenCertificate, new OpenCertificateCommand(this._proxyService, this._soapClient));
        this._commands.set(FrontendCommand.ResolveBreakpoint, new ResolveBreakpointCommand(this._proxyService));
        this._commands.set(FrontendCommand.SetServerMode, new SetServerModeCommand(this._proxyService));

        this._commands.set(FrontendCommand.RunTestSuite, new RunTestSuiteCommand(this._testRunnerService, this._loadedProjects));
        this._commands.set(FrontendCommand.RunTestCase, new RunTestCaseCommand(this._testRunnerService, this._loadedProjects));
        this._commands.set(FrontendCommand.PickOperationForTestCase, new PickOperationForTestCaseCommand(this._panel, this._loadedProjects));

        // Mock Commands
        this._commands.set(FrontendCommand.StartMockServer, new StartMockServerCommand(this._mockService));
        this._commands.set(FrontendCommand.StopMockServer, new StopMockServerCommand(this._mockService));
        this._commands.set(FrontendCommand.UpdateMockConfig, new UpdateMockConfigCommand(this._mockService, this._settingsManager));
        this._commands.set(FrontendCommand.UpdateMockRules, new UpdateMockRulesCommand(this._mockService, this._settingsManager));
        this._commands.set(FrontendCommand.AddMockRule, new AddMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set(FrontendCommand.DeleteMockRule, new DeleteMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set(FrontendCommand.ToggleMockRule, new ToggleMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set(FrontendCommand.InjectMockConfig, new InjectMockConfigCommand(this._panel, this._configSwitcherService, this._mockService));
        this._commands.set(FrontendCommand.RestoreMockConfig, new RestoreMockConfigCommand(this._panel, this._configSwitcherService));
        this._commands.set(FrontendCommand.GetMockStatus, new GetMockStatusCommand(this._panel, this._mockService));

        // Wire MockService into ProxyService for middleware mode
        this._proxyService.setMockService(this._mockService);

        // Performance Commands
        this._commands.set(FrontendCommand.GetPerformanceSuites, new GetPerformanceSuitesCommand(this._performanceService));
        this._commands.set(FrontendCommand.AddPerformanceSuite, new AddPerformanceSuiteCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.UpdatePerformanceSuite, new UpdatePerformanceSuiteCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.DeletePerformanceSuite, new DeletePerformanceSuiteCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.AddPerformanceRequest, new AddPerformanceRequestCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.PickOperationForPerformance, new PickOperationForPerformanceCommand(this._panel, () => Array.from(this._loadedProjects.values())));
        this._commands.set(FrontendCommand.UpdatePerformanceRequest, new UpdatePerformanceRequestCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.DeletePerformanceRequest, new DeletePerformanceRequestCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.RunPerformanceSuite, new RunPerformanceSuiteCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.AbortPerformanceSuite, new AbortPerformanceSuiteCommand(this._performanceService));
        this._commands.set(FrontendCommand.GetPerformanceHistory, new GetPerformanceHistoryCommand(this._performanceService));
        this._commands.set(FrontendCommand.ImportTestSuiteToPerformance, new ImportTestSuiteToPerformanceCommand(this._performanceService, this._settingsManager));
        this._commands.set(FrontendCommand.ExportPerformanceResults, new ExportPerformanceResultsCommand());

        // Schedule Commands
        this._commands.set(FrontendCommand.GetSchedules, new GetSchedulesCommand(this._scheduleService));
        this._commands.set(FrontendCommand.AddSchedule, new AddScheduleCommand(this._scheduleService, this._settingsManager));
        this._commands.set(FrontendCommand.UpdateSchedule, new UpdateScheduleCommand(this._scheduleService, this._settingsManager));
        this._commands.set(FrontendCommand.DeleteSchedule, new DeleteScheduleCommand(this._scheduleService, this._settingsManager));
        this._commands.set(FrontendCommand.ToggleSchedule, new ToggleScheduleCommand(this._scheduleService, this._settingsManager));

        // Script Playground
        this._commands.set(FrontendCommand.ExecutePlaygroundScript, new ScriptCommands((msg) => this._soapClient.log(msg), this._panel));

        // Setup Update Callback
        this._fileWatcherService.setCallback((history) => {
            this._postMessage({ command: BackendCommand.WatcherUpdate, history });
        });

        // Proxy Callbacks
        this._proxyService.on('log', (event) => {
            this._postMessage({ command: BackendCommand.ProxyLog, event });
        });
        this._proxyService.on('status', (running) => {
            this._postMessage({ command: BackendCommand.ProxyStatus, running });
        });

        // Breakpoint events
        this._proxyService.on('breakpointHit', (data) => {
            this._postMessage({ command: BackendCommand.BreakpointHit, ...data });
        });
        this._proxyService.on('breakpointTimeout', (data) => {
            this._postMessage({ command: BackendCommand.BreakpointTimeout, ...data });
        });

        // Test Runner Callback
        this._testRunnerService.setCallback((data) => {
            this._postMessage({ command: BackendCommand.TestRunnerUpdate, data });
        });

        // Mock Server Callbacks
        this._mockService.on('log', (event) => {
            this._postMessage({ command: BackendCommand.MockLog, event });
        });
        this._mockService.on('status', (running) => {
            this._postMessage({ command: BackendCommand.MockStatus, running });
        });
        this._mockService.on('rulesUpdated', (rules) => {
            this._postMessage({ command: BackendCommand.MockRulesUpdated, rules });
        });

        // Performance Callbacks
        this._performanceService.on('runCompleted', (run) => {
            this._postMessage({ command: BackendCommand.PerformanceRunComplete, run });
            this._settingsManager.updatePerformanceHistory(run); // Ensure history is saved (redundant if service does it, but safer)
        });
        this._performanceService.on('iterationComplete', (data) => {
            this._postMessage({ command: BackendCommand.PerformanceIterationComplete, data });
        });
        this._performanceService.on('suitesUpdated', () => {
            // Note: Commands now handle settings sync explicitly after updating SettingsManager
            // This event is still emitted for other listeners but webview updates are handled by commands
            // to avoid race condition where we read stale data from SettingsManager
            console.log('[WebviewController] suitesUpdated event received (commands handle sync)');
        });
        this._mockService.on('mockHit', (data) => {
            this._postMessage({ command: BackendCommand.MockHit, ...data });
        });
        this._mockService.on('mockRecorded', (rule) => {
            this._postMessage({ command: BackendCommand.MockRecorded, rule });
        });

        // Coordinator Callbacks
        this._coordinatorService.on('statusUpdate', (status) => {
            this._postMessage({ command: BackendCommand.CoordinatorStatus, status });
        });
        this._coordinatorService.on('log', (msg) => {
            console.log(`[Coordinator] ${msg}`);
        });
    }

    private _postMessage(message: any) {
        this._diagnosticService.log('BRIDGE_OUT', message.command, message);
        this._panel.webview.postMessage(message);
    }

    public async handleMessage(message: any) {
        // Skip logging echo/ping commands to reduce noise
        if (message.command !== 'echo') {
            this._diagnosticService.log('BRIDGE_IN', message.command, message);
        }

        if (this._commands.has(message.command)) {
            await this._commands.get(message.command)?.execute(message);

            // After performance commands, explicitly sync settings to webview
            // Using logic to check command name string or partial match which matches enum values
            if (message.command.startsWith('addPerformance') ||
                message.command.startsWith('deletePerformance') ||
                message.command.startsWith('updatePerformance')) {
                console.log('[WebviewController] Performance command executed:', message.command);
                console.log('[WebviewController] Syncing settings to webview...');
                this.sendSettingsToWebview();
            }
            return;
        }

        if (message.command === FrontendCommand.ExecuteRequest) {
            // Redundant fallback if registry works, but helpful during transition
            console.log('[WebviewController] Received executeRequest message', message.url, message.operation);
        }

        switch (message.command) {
            // case 'saveProject': handled by registry
            case FrontendCommand.Log:
                this._soapClient.log('[Webview] ' + message.message);
                break;
            // case 'loadProject': handled by registry
            case FrontendCommand.SaveOpenProjects:
                // Filter out read-only sample projects (which don't have valid paths)
                const validPaths = (message.paths as string[]).filter(p => p !== 'Samples' && p !== 'samples-project-read-only');
                this._settingsManager.updateOpenProjects(validPaths);
                break;
            case FrontendCommand.SaveWorkspace:
                await this.handleSaveWorkspace(message);
                break;
            case FrontendCommand.OpenWorkspace:
                await this.handleOpenWorkspace();
                break;
            case FrontendCommand.GetSampleSchema:
                this.handleGetSampleSchema(message);
                break;
            case FrontendCommand.ClipboardAction:
                if (message.action === 'read') {
                    const text = await vscode.env.clipboard.readText();
                    this._postMessage({ command: BackendCommand.ClipboardText, text });
                } else if (message.action === 'write') {
                    await vscode.env.clipboard.writeText(message.text);
                }
                break;



            case FrontendCommand.CancelRequest:
                this._soapClient.cancelRequest();
                break;
            // case 'executeRequest': handled by command registry
            case FrontendCommand.SaveSettings:
                if (message.raw) {
                    this._settingsManager.saveRawConfig(message.content);
                } else if (message.config) {
                    this._settingsManager.updateConfigFromObject(message.config);
                }
                this.sendSettingsToWebview();
                this._fileWatcherService.reloadConfiguration();
                // Sync replace rules and breakpoints to proxy service
                const rules = this._settingsManager.getConfig().replaceRules || [];
                this._proxyService.setReplaceRules(rules);
                const breakpoints = this._settingsManager.getConfig().breakpoints || [];
                this._proxyService.setBreakpoints(breakpoints);
                const proxyRules = this._settingsManager.getConfig().network?.proxyRules || [];
                this._proxyService.setProxyRules(proxyRules);
                break;
            case FrontendCommand.GetSettings:
                console.log('[WebviewController] Received getSettings. Sending settings to webview.');
                this.sendSettingsToWebview();
                break;
            case FrontendCommand.SetActiveEnvironment:
                if (message.env) {
                    console.log('[WebviewController] Switching active environment to:', message.env);
                    this._settingsManager.updateActiveEnvironment(message.env);
                    this.sendSettingsToWebview();
                }
                break;
            case FrontendCommand.SaveUiState:
                this._settingsManager.updateUiState(message.ui);
                break;
            case FrontendCommand.UpdateActiveEnvironment:
                this._settingsManager.updateActiveEnvironment(message.envName);
                this.sendSettingsToWebview();
                break;
            case FrontendCommand.AutoSaveWorkspace:
                this._settingsManager.saveAutosave(message.content);
                break;

            case FrontendCommand.StartWatcher:
                this._fileWatcherService.start();
                break;
            case FrontendCommand.StopWatcher:
                this._fileWatcherService.stop();
                break;
            case FrontendCommand.GetAutosave:
                this.handleGetAutosave();
                break;
            case FrontendCommand.GetWatcherHistory:
                this._postMessage({ command: BackendCommand.WatcherUpdate, history: this._fileWatcherService.getHistory() });
                break;
            case FrontendCommand.ClearWatcherHistory:
                this._fileWatcherService.clearHistory();
                break;
            case FrontendCommand.SelectConfigFile:
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select Config File',
                    filters: {
                        'Config Files': ['config', 'xml'],
                        'All Files': ['*']
                    },
                    title: 'Select Web.config or App.config'
                };
                const fileUri = await vscode.window.showOpenDialog(options);
                if (fileUri && fileUri[0]) {
                    const configPath = fileUri[0].fsPath;
                    this._settingsManager.updateLastConfigPath(configPath);
                    this.sendSettingsToWebview();
                }
                break;
            case FrontendCommand.SelectWatcherRequestFile: {
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select Request XML',
                    filters: {
                        'XML Files': ['xml'],
                        'All Files': ['*']
                    },
                    title: 'Select Request XML File'
                };
                const fileUri = await vscode.window.showOpenDialog(options);
                if (fileUri && fileUri[0]) {
                    const current = this._settingsManager.getConfig().fileWatcher || {};
                    this._settingsManager.updateFileWatcherConfig({
                        ...current,
                        requestPath: fileUri[0].fsPath
                    });
                    this._fileWatcherService.reloadConfiguration();
                    this.sendSettingsToWebview();
                }
                break;
            }
            case FrontendCommand.SelectWatcherResponseFile: {
                const options: vscode.OpenDialogOptions = {
                    canSelectMany: false,
                    openLabel: 'Select Response XML',
                    filters: {
                        'XML Files': ['xml'],
                        'All Files': ['*']
                    },
                    title: 'Select Response XML File'
                };
                const fileUri = await vscode.window.showOpenDialog(options);
                if (fileUri && fileUri[0]) {
                    const current = this._settingsManager.getConfig().fileWatcher || {};
                    this._settingsManager.updateFileWatcherConfig({
                        ...current,
                        responsePath: fileUri[0].fsPath
                    });
                    this._fileWatcherService.reloadConfiguration();
                    this.sendSettingsToWebview();
                }
                break;
            }

            // Azure DevOps Integration
            case FrontendCommand.AdoStorePat:
                await this._azureDevOpsService.storePat(message.pat);
                this._postMessage({ command: BackendCommand.AdoPatStored, success: true });
                break;
            case FrontendCommand.AdoHasPat:
                const hasPat = await this._azureDevOpsService.hasPat();
                this._postMessage({ command: BackendCommand.AdoHasPatResult, hasPat });
                break;
            case FrontendCommand.AdoDeletePat:
                await this._azureDevOpsService.deletePat();
                this._postMessage({ command: BackendCommand.AdoPatDeleted, success: true });
                break;
            case FrontendCommand.AdoListProjects:
                try {
                    const projects = await this._azureDevOpsService.listProjects(message.orgUrl);
                    this._postMessage({ command: BackendCommand.AdoProjectsResult, projects, success: true });
                } catch (error: any) {
                    this._postMessage({ command: BackendCommand.AdoProjectsResult, projects: [], success: false, error: error.message });
                }
                break;
            case FrontendCommand.AdoTestConnection:
                const result = await this._azureDevOpsService.testConnection(message.orgUrl);
                this._postMessage({ command: BackendCommand.AdoTestConnectionResult, ...result });
                break;
            case FrontendCommand.CloseProject:
                if (message.name) {
                    // Try to find by name and remove
                    for (const [key, p] of this._loadedProjects.entries()) {
                        if (p.name === message.name) {
                            this._loadedProjects.delete(key);
                            console.log(`[WebviewController] Closed project: ${message.name}`);
                        }
                    }
                }
                break;
            case FrontendCommand.SyncProjects:
                if (message.projects && Array.isArray(message.projects)) {
                    // We don't want to wipe the map if we have local paths we want to keep,
                    // but we do want to ensure all frontend projects are present.
                    // For now, let's update/add from frontend.
                    message.projects.forEach((p: ApinoxProject) => {
                        const key = p.fileName || p.id || p.name;
                        this._loadedProjects.set(key, p);
                    });
                    console.log(`[WebviewController] Synced ${message.projects.length} projects from frontend`);
                }
                break;
            case FrontendCommand.AdoAddComment:
                const commentResult = await this._azureDevOpsService.addWorkItemComment(
                    message.orgUrl,
                    message.project,
                    message.workItemId,
                    message.text
                );
                this._postMessage({ command: BackendCommand.AdoAddCommentResult, ...commentResult });
                break;

            // Coordinator Commands
            case FrontendCommand.StartCoordinator:
                this._coordinatorService.start(message.port || 8765, message.expectedWorkers || 1);
                break;
            case FrontendCommand.StopCoordinator:
                this._coordinatorService.stop();
                break;
            case FrontendCommand.GetCoordinatorStatus:
                this._postMessage({ command: BackendCommand.CoordinatorStatus, status: this._coordinatorService.getStatus() });
                break;

            // History Commands
            case FrontendCommand.GetHistory:
                const historyCommand = new HistoryCommand(this._historyService);
                const entries = historyCommand.getHistory();
                this._postMessage({ command: BackendCommand.HistoryLoaded, entries });
                break;
            case FrontendCommand.ToggleStarHistory:
                new HistoryCommand(this._historyService).toggleStar(message.id);
                // Send updated history
                this._postMessage({ command: BackendCommand.HistoryLoaded, entries: this._historyService.getAll() });
                break;
            case FrontendCommand.DeleteHistoryEntry:
                new HistoryCommand(this._historyService).deleteEntry(message.id);
                // Send updated history
                this._postMessage({ command: BackendCommand.HistoryLoaded, entries: this._historyService.getAll() });
                break;
            case FrontendCommand.ClearHistory:
                new HistoryCommand(this._historyService).clearAll();
                this._postMessage({ command: BackendCommand.HistoryLoaded, entries: [] });
                break;
            case FrontendCommand.UpdateHistoryConfig:
                new HistoryCommand(this._historyService).updateConfig(message.config);
                break;

            // Attachment Commands
            case FrontendCommand.SelectAttachment:
                this.handleSelectAttachment();
                break;

            // Attachment Commands


            // WSDL Refresh Commands
            case FrontendCommand.RefreshWsdl:
                try {
                    const project = this._loadedProjects.get(message.projectId) || Array.from(this._loadedProjects.values()).find(p => p.id === message.projectId || p.name === message.projectId);
                    if (project) {
                        const diff = await this._refresherService.refreshWsdl(message.interfaceId, project);
                        this._postMessage({ command: BackendCommand.WsdlRefreshResult, diff });
                    } else {
                        this._soapClient.log(`Project not found for refresh: ${message.projectId}`);
                    }
                } catch (e: any) {
                    this._postMessage({ command: BackendCommand.Error, message: `Refresh failed: ${e.message}` });
                }
                break;

            case FrontendCommand.ApplyWsdlSync:
                try {
                    const project = this._loadedProjects.get(message.projectId) || Array.from(this._loadedProjects.values()).find(p => p.id === message.projectId || p.name === message.projectId);
                    if (project) {
                        const updatedProject = this._refresherService.applyDiff(message.diff, project);

                        // DEBUG: Verify removal in updatedProject
                        const debugIface = updatedProject.interfaces.find(i => i.id === message.diff.interfaceId || i.name === message.diff.interfaceId);
                        this._soapClient.log(`[ApplyWsdlSync] Interface op count: ${debugIface?.operations.length} (Original: ${project.interfaces.find(i => i.id === message.diff.interfaceId || i.name === message.diff.interfaceId)?.operations.length})`);

                        // Save and Update
                        // We need to update loadedProjects and send "projectLoaded" or similar to frontend
                        // Or just save it using ProjectStorage which usually triggers reload if watched?
                        // But we want immediate update.
                        // Use SaveProject command logic essentially.
                        this._loadedProjects.set(updatedProject.fileName || updatedProject.name, updatedProject);
                        this._soapClient.log(`[ApplyWsdlSync] Updated in-memory project map for key: ${updatedProject.fileName || updatedProject.name}`);
                        if (updatedProject.fileName) {
                            // Check if it's a folder project
                            let isFolder = false;
                            try {
                                if (fs.existsSync(updatedProject.fileName) && fs.statSync(updatedProject.fileName).isDirectory()) {
                                    isFolder = true;
                                }
                            } catch (ignore) { /* ignore */ }

                            if (isFolder) {
                                await this._folderStorage.saveProject(updatedProject, updatedProject.fileName);
                            } else {
                                await this._soapUiExporter.exportProject(updatedProject, updatedProject.fileName);
                            }
                        } else {
                            this._soapClient.log('Updated project in memory. Filename missing, skipping save to disk.');
                        }

                        // Notify Frontend
                        this._postMessage({
                            command: BackendCommand.ProjectLoaded,
                            project: updatedProject,
                            filename: updatedProject.fileName
                        });
                        this._soapClient.log('WSDL Sync applied successfully.');
                    }
                } catch (e: any) {
                    this._postMessage({ command: BackendCommand.Error, message: `Sync failed: ${e.message}` });
                }
                break;

        }
    }

    private handleGetAutosave() {
        const content = this._settingsManager.getAutosave();
        if (content) {
            this._postMessage({ command: BackendCommand.RestoreAutosave, content });
        }
    }

    private async handleSelectAttachment() {
        try {
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                canSelectFolders: false,
                canSelectFiles: true,
                openLabel: 'Select Attachment',
                title: 'Select File to Attach'
            });

            if (uris && uris.length > 0) {
                const filePath = uris[0].fsPath;
                const stat = fs.statSync(filePath);
                const fileName = path.basename(filePath);

                // Detect content type based on extension
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes: Record<string, string> = {
                    '.pdf': 'application/pdf',
                    '.xml': 'application/xml',
                    '.json': 'application/json',
                    '.txt': 'text/plain',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.png': 'image/png',
                    '.gif': 'image/gif',
                    '.doc': 'application/msword',
                    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    '.xls': 'application/vnd.ms-excel',
                    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                };
                const contentType = mimeTypes[ext] || 'application/octet-stream';

                // Generate a unique ID and default content ID
                const id = `att-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const contentId = fileName.replace(/[^a-zA-Z0-9]/g, '_');

                this._postMessage({
                    command: BackendCommand.AttachmentSelected,
                    attachment: {
                        id,
                        name: fileName,
                        fsPath: filePath,
                        contentId,
                        contentType,
                        type: 'Base64', // Default to Base64
                        size: stat.size
                    }
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to select attachment: ${e.message}`);
        }
    }



    private async handleSaveWorkspace(message: any) {
        try {
            const uri = await vscode.window.showSaveDialog({
                filters: { 'SoapUI Workspace': ['xml'] },
                saveLabel: 'Save Workspace'
            });
            if (uri) {
                await this._soapUiExporter.exportWorkspace(message.projects, uri.fsPath);
                vscode.window.showInformationMessage(`Workspace saved to ${uri.fsPath}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to save workspace: ${e.message}`);
        }
    }



    private async handleOpenWorkspace() {
        try {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { 'SoapUI Workspace': ['xml'] },
                openLabel: 'Open Workspace'
            });
            if (uris && uris.length > 0) {
                const projects = await this._soapUiExporter.importWorkspace(uris[0].fsPath);

                // Clear existing projects to prevent stale entries
                this._loadedProjects.clear();

                // We need to associate projects with their paths? 
                // loadWorkspace returns array of projects, but doesn't necessarily set fileName on them if not saved?
                // ProjectStorage.loadWorkspace likely sets fileName if loaded from disk.
                projects.forEach(p => {
                    if (p.fileName) this._loadedProjects.set(p.fileName, p);
                });

                this._postMessage({
                    command: BackendCommand.WorkspaceLoaded,
                    projects: projects
                });
                vscode.window.showInformationMessage(`Workspace loaded from ${uris[0].fsPath}`);
            }
        } catch (e: any) {
            this._soapClient.log(`Error loading workspace: ${e.message}`);
            if (e.stack) this._soapClient.log(e.stack);
            vscode.window.showErrorMessage(`Failed to load workspace: ${e.message}`);
        }
    }

    private handleGetSampleSchema(message: any) {
        const schema = this._soapClient.getOperationSchema(message.operationName);
        this._postMessage({ command: BackendCommand.SampleSchema, schema, operationName: message.operationName });
    }




    public loadSamples() {
        if (SAMPLES_PROJECT.id) {
            this._loadedProjects.set(SAMPLES_PROJECT.id, SAMPLES_PROJECT);
            this._panel.webview.postMessage({
                command: BackendCommand.ProjectLoaded,
                project: SAMPLES_PROJECT,
                filename: 'Samples',
                isReadOnly: true
            });
            this._diagnosticService.log('BACKEND', 'Samples project loaded');
        }
    }

    public sendSettingsToWebview() {
        if (this._panel) {
            const config = this._settingsManager.getConfig();
            const raw = this._settingsManager.getRawConfig();
            const configDir = this._settingsManager.getConfigDir();
            const configPath = this._settingsManager.getConfigPath();
            this.sendChangelogToWebview(); // Piggyback changelog
            this._postMessage({ command: BackendCommand.SettingsUpdate, config, raw, configDir, configPath });
            // Sync replace rules and breakpoints to proxy service on config load
            this._proxyService.setReplaceRules(config.replaceRules || []);
            this._proxyService.setBreakpoints(config.breakpoints || []);
            this._proxyService.setProxyRules(config.network?.proxyRules || []);
            // Sync last proxy target to proxy service so it has the correct backend URL
            if (config.lastProxyTarget) {
                this._proxyService.updateConfig({ targetUrl: config.lastProxyTarget });
            }
            // Sync saved mock rules to mock service
            if (config.mockServer?.rules) {
                this._mockService.setRules(config.mockServer.rules);
            }
        }
    }






    private sendChangelogToWebview() {
        try {
            const changelogPath = path.join(this._extensionUri.fsPath, 'CHANGELOG.md');
            if (fs.existsSync(changelogPath)) {
                const content = fs.readFileSync(changelogPath, 'utf8');
                this._postMessage({ command: BackendCommand.Changelog, content });
            }
        } catch (e) {
            console.error('Failed to read changelog', e);
        }
    }

    public async exportToSoapUI() {
        if (this._loadedProjects.size === 0) {
            vscode.window.showInformationMessage('No projects loaded to export.');
            return;
        }

        let selectedProject: ApinoxProject | undefined;

        if (this._loadedProjects.size === 1) {
            selectedProject = this._loadedProjects.values().next().value;
        } else {
            const items = Array.from(this._loadedProjects.values()).map(p => ({
                label: p.name,
                description: p.fileName,
                project: p
            }));

            const selection = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select project to export to SoapUI XML'
            });

            if (selection) {
                selectedProject = selection.project;
            }
        }

        if (selectedProject) {
            const uri = await vscode.window.showSaveDialog({
                filters: { 'SoapUI Project': ['xml'] },
                saveLabel: 'Export to SoapUI XML',
                defaultUri: selectedProject.fileName ? vscode.Uri.file(selectedProject.fileName.replace(/\.xml$/, '') + '-exported.xml') : undefined
            });

            if (uri) {
                try {
                    await this._soapUiExporter.exportProject(selectedProject, uri.fsPath);
                    vscode.window.showInformationMessage(`Project '${selectedProject.name}' exported to ${uri.fsPath}`);
                } catch (e: any) {
                    vscode.window.showErrorMessage(`Failed to export project: ${e.message}`);
                    this._soapClient.log(`Error exporting project: ${e.message}`);
                }
            }
        }
    }


}


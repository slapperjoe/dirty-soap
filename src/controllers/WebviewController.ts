import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { SoapClient } from '../soapClient';
import { ProjectStorage } from '../ProjectStorage';
import { SettingsManager } from '../utils/SettingsManager';
import { WildcardProcessor } from '../utils/WildcardProcessor';
import { AssertionRunner } from '../utils/AssertionRunner';

import { FileWatcherService } from '../services/FileWatcherService';
import { ProxyService } from '../services/ProxyService';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';
import { TestRunnerService } from '../services/TestRunnerService';
import { AzureDevOpsService } from '../services/AzureDevOpsService';
import { MockService } from '../services/MockService';
import { SoapUIProject, SoapTestSuite, SoapTestCase } from '../models';
import { FolderProjectStorage } from '../FolderProjectStorage';

import { ICommand } from '../commands/ICommand';
import { ExecuteRequestCommand } from '../commands/ExecuteRequestCommand';
import { SaveProjectCommand } from '../commands/SaveProjectCommand';
import { LoadProjectCommand } from '../commands/LoadProjectCommand';
import { DownloadWsdlCommand } from '../commands/DownloadWsdlCommand';
import { LoadWsdlCommand } from '../commands/LoadWsdlCommand';
import { GetLocalWsdlsCommand } from '../commands/GetLocalWsdlsCommand';
import { SelectLocalWsdlCommand } from '../commands/SelectLocalWsdlCommand';
import {
    StartProxyCommand,
    StopProxyCommand,
    UpdateProxyConfigCommand,
    SaveProxyHistoryCommand,
    InjectProxyCommand,
    RestoreProxyCommand,
    OpenCertificateCommand,
    ResolveBreakpointCommand
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

export class WebviewController {
    private _loadedProjects: Map<string, SoapUIProject> = new Map();
    private _commands: Map<string, ICommand> = new Map();

    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _extensionUri: vscode.Uri,
        private readonly _soapClient: SoapClient,
        private readonly _folderStorage: FolderProjectStorage,
        private _projectStorage: ProjectStorage,
        private _settingsManager: SettingsManager,
        private readonly _wildcardProcessor: WildcardProcessor,
        private readonly _fileWatcherService: FileWatcherService,
        private readonly _proxyService: ProxyService,
        private readonly _configSwitcherService: ConfigSwitcherService,
        private readonly _testRunnerService: TestRunnerService,
        private readonly _azureDevOpsService: AzureDevOpsService,
        private readonly _mockService: MockService
    ) {
        // Initialize Commands
        this._commands.set('executeRequest', new ExecuteRequestCommand(this._panel, this._soapClient, this._settingsManager));
        this._commands.set('saveProject', new SaveProjectCommand(
            this._panel,
            this._folderStorage,
            this._projectStorage,
            this._loadedProjects
        ));
        this._commands.set('loadProject', new LoadProjectCommand(
            this._panel,
            this._soapClient,
            this._folderStorage,
            this._projectStorage,
            this._loadedProjects
        ));
        this._commands.set('downloadWsdl', new DownloadWsdlCommand(
            this._panel,
            this._soapClient,
            this._extensionUri.fsPath
        ));
        this._commands.set('loadWsdl', new LoadWsdlCommand(this._panel, this._soapClient));
        this._commands.set('getLocalWsdls', new GetLocalWsdlsCommand(this._panel, this._soapClient, this._extensionUri.fsPath));
        this._commands.set('selectLocalWsdl', new SelectLocalWsdlCommand(this._panel, this._soapClient));

        // Proxy Commands
        this._commands.set('startProxy', new StartProxyCommand(this._proxyService));
        this._commands.set('stopProxy', new StopProxyCommand(this._proxyService));
        this._commands.set('updateProxyConfig', new UpdateProxyConfigCommand(this._proxyService, this._settingsManager));
        this._commands.set('saveProxyHistory', new SaveProxyHistoryCommand());
        this._commands.set('injectProxy', new InjectProxyCommand(this._panel, this._configSwitcherService, this._proxyService, this._soapClient));
        this._commands.set('restoreProxy', new RestoreProxyCommand(this._panel, this._configSwitcherService));
        this._commands.set('openCertificate', new OpenCertificateCommand(this._proxyService, this._soapClient));
        this._commands.set('resolveBreakpoint', new ResolveBreakpointCommand(this._proxyService));

        this._commands.set('runTestSuite', new RunTestSuiteCommand(this._testRunnerService, this._loadedProjects));
        this._commands.set('runTestCase', new RunTestCaseCommand(this._testRunnerService, this._loadedProjects));
        this._commands.set('pickOperationForTestCase', new PickOperationForTestCaseCommand(this._panel, this._loadedProjects));

        // Mock Commands
        this._commands.set('startMockServer', new StartMockServerCommand(this._mockService));
        this._commands.set('stopMockServer', new StopMockServerCommand(this._mockService));
        this._commands.set('updateMockConfig', new UpdateMockConfigCommand(this._mockService, this._settingsManager));
        this._commands.set('updateMockRules', new UpdateMockRulesCommand(this._mockService, this._settingsManager));
        this._commands.set('addMockRule', new AddMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set('deleteMockRule', new DeleteMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set('toggleMockRule', new ToggleMockRuleCommand(this._mockService, this._settingsManager));
        this._commands.set('injectMockConfig', new InjectMockConfigCommand(this._panel, this._configSwitcherService, this._mockService));
        this._commands.set('restoreMockConfig', new RestoreMockConfigCommand(this._panel, this._configSwitcherService));
        this._commands.set('getMockStatus', new GetMockStatusCommand(this._panel, this._mockService));

        // Setup Update Callback
        this._fileWatcherService.setCallback((history) => {
            this._panel.webview.postMessage({ command: 'watcherUpdate', history });
        });

        // Proxy Callbacks
        this._proxyService.on('log', (event) => {
            this._panel.webview.postMessage({ command: 'proxyLog', event });
        });
        this._proxyService.on('status', (running) => {
            this._panel.webview.postMessage({ command: 'proxyStatus', running });
        });

        // Breakpoint events
        this._proxyService.on('breakpointHit', (data) => {
            this._panel.webview.postMessage({ command: 'breakpointHit', ...data });
        });
        this._proxyService.on('breakpointTimeout', (data) => {
            this._panel.webview.postMessage({ command: 'breakpointTimeout', ...data });
        });

        // Test Runner Callback
        this._testRunnerService.setCallback((data) => {
            this._panel.webview.postMessage({ command: 'testRunnerUpdate', data });
        });

        // Mock Server Callbacks
        this._mockService.on('log', (event) => {
            this._panel.webview.postMessage({ command: 'mockLog', event });
        });
        this._mockService.on('status', (running) => {
            this._panel.webview.postMessage({ command: 'mockStatus', running });
        });
        this._mockService.on('rulesUpdated', (rules) => {
            this._panel.webview.postMessage({ command: 'mockRulesUpdated', rules });
        });
        this._mockService.on('mockHit', (data) => {
            this._panel.webview.postMessage({ command: 'mockHit', ...data });
        });
        this._mockService.on('mockRecorded', (rule) => {
            this._panel.webview.postMessage({ command: 'mockRecorded', rule });
        });
    }

    public async handleMessage(message: any) {
        if (this._commands.has(message.command)) {
            await this._commands.get(message.command)?.execute(message);
            return;
        }

        if (message.command === 'executeRequest') {
            // Redundant fallback if registry works, but helpful during transition
            console.log('[WebviewController] Received executeRequest message', message.url, message.operation);
        }

        switch (message.command) {
            // case 'saveProject': handled by registry
            case 'log':
                this._soapClient.log('[Webview] ' + message.message);
                break;
            // case 'loadProject': handled by registry
            case 'saveOpenProjects':
                this._settingsManager.updateOpenProjects(message.paths);
                break;
            case 'saveWorkspace':
                await this.handleSaveWorkspace(message);
                break;
            case 'openWorkspace':
                await this.handleOpenWorkspace();
                break;
            case 'getSampleSchema':
                this.handleGetSampleSchema(message);
                break;
            case 'clipboardAction':
                if (message.action === 'read') {
                    const text = await vscode.env.clipboard.readText();
                    this._panel.webview.postMessage({ command: 'clipboardText', text });
                } else if (message.action === 'write') {
                    await vscode.env.clipboard.writeText(message.text);
                }
                break;



            case 'cancelRequest':
                this._soapClient.cancelRequest();
                break;
            // case 'executeRequest': handled by command registry
            case 'saveSettings':
                if (message.raw) {
                    this._settingsManager.saveRawConfig(message.content);
                } else if (message.config) {
                    this._settingsManager.updateConfigFromObject(message.config);
                }
                this.sendSettingsToWebview();
                // Sync replace rules and breakpoints to proxy service
                const rules = this._settingsManager.getConfig().replaceRules || [];
                this._proxyService.setReplaceRules(rules);
                const breakpoints = this._settingsManager.getConfig().breakpoints || [];
                this._proxyService.setBreakpoints(breakpoints);
                break;
            case 'getSettings':
                console.log('[WebviewController] Received getSettings. Sending settings to webview.');
                this.sendSettingsToWebview();
                break;
            case 'saveUiState':
                this._settingsManager.updateUiState(message.ui);
                break;
            case 'updateActiveEnvironment':
                this._settingsManager.updateActiveEnvironment(message.envName);
                this.sendSettingsToWebview();
                break;
            case 'autoSaveWorkspace':
                this._settingsManager.saveAutosave(message.content);
                break;

            case 'startWatcher':
                this._fileWatcherService.start();
                break;
            case 'stopWatcher':
                this._fileWatcherService.stop();
                break;
            case 'getAutosave':
                this.handleGetAutosave();
                break;
            case 'getWatcherHistory':
                this._panel.webview.postMessage({ command: 'watcherUpdate', history: this._fileWatcherService.getHistory() });
                break;
            case 'clearWatcherHistory':
                this._fileWatcherService.clearHistory();
                break;

            // Azure DevOps Integration
            case 'adoStorePat':
                await this._azureDevOpsService.storePat(message.pat);
                this._panel.webview.postMessage({ command: 'adoPatStored', success: true });
                break;
            case 'adoHasPat':
                const hasPat = await this._azureDevOpsService.hasPat();
                this._panel.webview.postMessage({ command: 'adoHasPatResult', hasPat });
                break;
            case 'adoDeletePat':
                await this._azureDevOpsService.deletePat();
                this._panel.webview.postMessage({ command: 'adoPatDeleted', success: true });
                break;
            case 'adoListProjects':
                try {
                    const projects = await this._azureDevOpsService.listProjects(message.orgUrl);
                    this._panel.webview.postMessage({ command: 'adoProjectsResult', projects, success: true });
                } catch (error: any) {
                    this._panel.webview.postMessage({ command: 'adoProjectsResult', projects: [], success: false, error: error.message });
                }
                break;
            case 'adoTestConnection':
                const result = await this._azureDevOpsService.testConnection(message.orgUrl);
                this._panel.webview.postMessage({ command: 'adoTestConnectionResult', ...result });
                break;
            case 'adoAddComment':
                const commentResult = await this._azureDevOpsService.addWorkItemComment(
                    message.orgUrl,
                    message.project,
                    message.workItemId,
                    message.text
                );
                this._panel.webview.postMessage({ command: 'adoAddCommentResult', ...commentResult });
                break;

        }
    }

    private handleGetAutosave() {
        const content = this._settingsManager.getAutosave();
        if (content) {
            this._panel.webview.postMessage({ command: 'restoreAutosave', content });
        }
    }





    private async handleSaveWorkspace(message: any) {
        try {
            const uri = await vscode.window.showSaveDialog({
                filters: { 'SoapUI Workspace': ['xml'] },
                saveLabel: 'Save Workspace'
            });
            if (uri) {
                await this._projectStorage.saveWorkspace(message.projects, uri.fsPath);
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
                const projects = await this._projectStorage.loadWorkspace(uris[0].fsPath);
                // We need to associate projects with their paths? 
                // loadWorkspace returns array of projects, but doesn't necessarily set fileName on them if not saved?
                // ProjectStorage.loadWorkspace likely sets fileName if loaded from disk.
                projects.forEach(p => {
                    if (p.fileName) this._loadedProjects.set(p.fileName, p);
                });

                this._panel.webview.postMessage({
                    command: 'workspaceLoaded',
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
        this._panel?.webview.postMessage({ command: 'sampleSchema', schema, operationName: message.operationName });
    }











    private handleSaveSettings(message: any) {
        if (message.raw) {
            this._settingsManager.saveRawConfig(message.content);
        }
        this.sendSettingsToWebview();
    }

    public sendSettingsToWebview() {
        if (this._panel) {
            const config = this._settingsManager.getConfig();
            const raw = this._settingsManager.getRawConfig();
            this.sendChangelogToWebview(); // Piggyback changelog
            this._panel.webview.postMessage({ command: 'settingsUpdate', config, raw });
            // Sync replace rules and breakpoints to proxy service on config load
            this._proxyService.setReplaceRules(config.replaceRules || []);
            this._proxyService.setBreakpoints(config.breakpoints || []);
        }
    }






    private sendChangelogToWebview() {
        try {
            const changelogPath = path.join(this._extensionUri.fsPath, 'CHANGELOG.md');
            if (fs.existsSync(changelogPath)) {
                const content = fs.readFileSync(changelogPath, 'utf8');
                this._panel.webview.postMessage({ command: 'changelog', content });
            }
        } catch (e) {
            console.error('Failed to read changelog', e);
        }
    }


}

import * as vscode from 'vscode';
import { SoapClient } from '../soapClient';
import { DiagnosticService } from '../services/DiagnosticService';
import { SoapUIExporter } from '../SoapUIExporter';
import { FolderProjectStorage } from '../FolderProjectStorage';
import { SettingsManager } from '../utils/SettingsManager';
import { WebviewController } from '../controllers/WebviewController';
import { FileWatcherService } from '../services/FileWatcherService';
import { ProxyService } from '../services/ProxyService';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';
import { TestRunnerService } from '../services/TestRunnerService';
import { AzureDevOpsService } from '../services/AzureDevOpsService';
import { MockService } from '../services/MockService';
import { PerformanceService } from '../services/PerformanceService';
import { ScheduleService } from '../services/ScheduleService';
import { RequestHistoryService } from '../services/RequestHistoryService';
import { createVSCodeServices } from '../adapters/vscode';
import { IPlatformServices } from '../interfaces';

export class WebviewPanel {
    public static currentPanel: WebviewPanel | undefined;
    public static readonly viewType = 'apinox';
    private static _extensionContext: vscode.ExtensionContext;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private readonly _soapClient: SoapClient;
    private readonly _soapUiExporter: SoapUIExporter;
    private readonly _folderStorage: FolderProjectStorage;
    private readonly _settingsManager: SettingsManager;
    private readonly _fileWatcherService: FileWatcherService;
    private _proxyService: ProxyService;
    private _configSwitcherService: ConfigSwitcherService;
    private _testRunnerService: TestRunnerService;
    private _azureDevOpsService: AzureDevOpsService;
    private _mockService: MockService;
    private _performanceService: PerformanceService;
    private _historyService: RequestHistoryService;
    private _controller: WebviewController;
    private _platformServices: IPlatformServices;

    public get controller(): WebviewController {
        return this._controller;
    }

    private _disposables: vscode.Disposable[] = [];
    private _autosaveTimeout: NodeJS.Timeout | undefined;
    private _outputChannel: vscode.OutputChannel;
    private _diagnosticService: DiagnosticService;

    public static setContext(context: vscode.ExtensionContext) {
        WebviewPanel._extensionContext = context;
    }

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (WebviewPanel.currentPanel) {
            WebviewPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            WebviewPanel.viewType,
            'APInox',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview-build')
                ]
            }
        );

        WebviewPanel.currentPanel = new WebviewPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._outputChannel = vscode.window.createOutputChannel('APInox');
        this._diagnosticService = DiagnosticService.getInstance();
        this._diagnosticService.log('BACKEND', 'WebviewPanel Initialized');

        // Create platform-agnostic services (VS Code implementations)
        this._platformServices = createVSCodeServices(WebviewPanel._extensionContext);

        this._settingsManager = new SettingsManager();
        this._soapClient = new SoapClient(this._settingsManager, this._outputChannel, this._platformServices.config);
        this._soapUiExporter = new SoapUIExporter(this._outputChannel);
        this._folderStorage = new FolderProjectStorage(this._outputChannel);

        this._fileWatcherService = new FileWatcherService(this._outputChannel, this._settingsManager);
        this._proxyService = new ProxyService(
            { port: 9000, targetUrl: 'http://localhost:8080', systemProxyEnabled: true },
            this._platformServices.notifications,
            this._platformServices.config
        );
        this._proxyService.setLogger(msg => this._outputChannel.appendLine(msg));
        this._proxyService.on('log', (event: any) => {
            if (event.type === 'request') {
                this._outputChannel.appendLine(`[Proxy] Request: ${event.method} ${event.url} `);
            } else {
                this._outputChannel.appendLine(`[Proxy] Response: ${event.method} ${event.url} -> ${event.status} (${event.duration}s)`);
                if (!event.success && event.responseBody) {
                    this._outputChannel.appendLine(`[Proxy] Response Body: ${event.responseBody} `);
                }
                if (event.error) {
                    this._outputChannel.appendLine(`[Proxy] Error: ${event.error} `);
                }
            }
        });

        this._configSwitcherService = new ConfigSwitcherService();
        this._testRunnerService = new TestRunnerService(this._soapClient, this._outputChannel);
        this._azureDevOpsService = new AzureDevOpsService(this._platformServices.secrets);

        // Mock Service
        this._mockService = new MockService({}, this._platformServices.notifications);
        this._mockService.setLogger(msg => this._outputChannel.appendLine(msg));
        this._mockService.setProxyPort(this._proxyService.getConfig().port);

        // Mock Service Events
        this._mockService.on('log', (event: any) => {
            if (event.type === 'request') {
                this._outputChannel.appendLine(`[Mock] Request: ${event.method} ${event.url}`);
            } else {
                const status = event.matchedRule ? `MOCK (${event.matchedRule})` : event.passthrough ? 'PASSTHROUGH' : 'NO_MATCH';
                this._outputChannel.appendLine(`[Mock] Response: ${event.method} ${event.url} -> ${event.status} [${status}] (${event.duration}s)`);
            }
        });

        // Initialize Config
        const config = this._settingsManager.getConfig();

        // Performance Service
        this._performanceService = new PerformanceService(this._soapClient);
        this._performanceService.setLogger(msg => this._outputChannel.appendLine(msg));

        // Initialize with saved data
        if (config.performanceSuites) {
            this._performanceService.setSuites(config.performanceSuites);
        }
        if (config.performanceHistory) {
            this._performanceService.setHistory(config.performanceHistory);
        }

        // Performance Service Events - Wire to webview for UI updates
        this._performanceService.on('runStarted', (data: any) => {
            this._diagnosticService.log('BACKEND', 'Performance run started', data);
            this._panel.webview.postMessage({ command: 'performanceRunStarted', data });
        });
        this._performanceService.on('iterationComplete', (data: any) => {
            this._diagnosticService.log('BACKEND', `Performance iteration ${data.iteration + 1}/${data.total}`);
            this._panel.webview.postMessage({ command: 'performanceIterationComplete', data });
        });
        this._performanceService.on('runCompleted', (run: any) => {
            this._diagnosticService.log('BACKEND', 'Performance run completed', { runId: run.id, status: run.status, resultCount: run.results?.length });
            this._panel.webview.postMessage({ command: 'performanceRunComplete', run });
        });

        // Request History Service
        const configDir = this._settingsManager.getConfigDir();
        this._historyService = new RequestHistoryService(configDir);

        // Schedule Service
        const scheduleService = new ScheduleService(this._performanceService);

        // Load saved schedules
        if (config.performanceSchedules) {
            scheduleService.loadSchedules(config.performanceSchedules);
        }

        this._controller = new WebviewController(
            this._panel,
            this._extensionUri,
            this._soapClient,
            this._folderStorage,
            this._soapUiExporter,
            this._settingsManager,
            this._fileWatcherService,
            this._proxyService,
            this._configSwitcherService,
            this._testRunnerService,
            this._azureDevOpsService,
            this._mockService,
            this._performanceService,
            scheduleService,
            this._historyService
        );

        // Watcher starts stopped by default.


        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        // Initial Settings Send
        this._controller.sendSettingsToWebview();
        this._controller.loadSamples();

        // Autosave check
        this.checkAutosave();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                await this._controller.handleMessage(message);
            },
            null,
            this._disposables
        );
    }

    private async checkAutosave() {
        const autosave = this._settingsManager.getAutosave();
        if (autosave) {
            this._autosaveTimeout = setTimeout(() => {
                this._panel.webview.postMessage({ command: 'restoreAutosave', content: autosave });
            }, 1000);
        }
    }

    private _isDisposed = false;

    public dispose() {
        if (this._isDisposed) {
            return;
        }
        this._isDisposed = true;

        WebviewPanel.currentPanel = undefined;

        // Clear timeouts
        if (this._autosaveTimeout) {
            clearTimeout(this._autosaveTimeout);
        }

        // Cancel any pending requests
        if (this._soapClient) {
            this._soapClient.cancelRequest();
        }

        // Dispose Output Channel
        if (this._outputChannel) {
            this._outputChannel.dispose();
        }

        // Dispose File Watcher
        if (this._fileWatcherService) {
            this._fileWatcherService.stop();
        }

        // Dispose Proxy Service
        if (this._proxyService) {
            this._proxyService.stop();
        }

        // Dispose Mock Service
        if (this._mockService) {
            this._mockService.stop();
        }

        // Dispose panel
        // If we are here because of onDidDispose, this is redundant but safe.
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri) {
        const scriptPathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview-build', 'assets', 'index.js');
        const stylePathOnDisk = vscode.Uri.joinPath(extensionUri, 'webview-build', 'assets', 'index.css');

        const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
        const styleUri = webview.asWebviewUri(stylePathOnDisk);
        const baseUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'webview-build', '/'));

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <base href="${baseUri}">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; connect-src https:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-randomNonce' ${webview.cspSource} 'unsafe-eval'; worker-src blob:; font-src ${webview.cspSource} data:; img-src ${webview.cspSource} data:;">
    <title>APInox</title>
    <link rel="stylesheet" type="text/css" href="${styleUri}">
</head>
<body>
    <div id="root"></div>
    <script nonce="randomNonce">
        // Monaco Environment Polyfill to avoid SecurityError with Workers in Webview
        window.MonacoEnvironment = {
            getWorker: function(moduleId, label) {
                // Return a dummy worker or main thread fallback if possible?
                // Monaco doesn't support main thread fallback easily for standard workers.
                // We create a Blob worker that does nothing to prevent crash, OR we try to load the actual worker code if we can access it.
                // Since we can't easily access the worker file due to CSP, we treat it as no-op or basic.
                // BUT better yet, let's try to construct a worker from a Blob that contains the code if we could read it.
                // For now, to stop the crash, we provide a dummy worker. Functional features (validation) might suffer.
                const blob = new Blob(['self.onmessage = () => {};'], { type: 'application/javascript' });
                return new Worker(URL.createObjectURL(blob));
            }
        };
    </script>
    <script type="module" nonce="randomNonce" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

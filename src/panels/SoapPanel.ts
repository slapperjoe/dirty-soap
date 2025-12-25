import * as vscode from 'vscode';
import { SoapClient } from '../soapClient';
import { ProjectStorage } from '../ProjectStorage';
import { SettingsManager } from '../utils/SettingsManager';
import { WebviewController } from '../controllers/WebviewController';
import { FileWatcherService } from '../services/FileWatcherService';
import { ProxyService } from '../services/ProxyService';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';

export class SoapPanel {
    public static currentPanel: SoapPanel | undefined;
    public static readonly viewType = 'dirtySoap';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _soapClient: SoapClient;
    private _projectStorage: ProjectStorage;
    private _settingsManager: SettingsManager;
    private _fileWatcherService: FileWatcherService;
    private _proxyService: ProxyService;
    private _configSwitcherService: ConfigSwitcherService;
    private _controller: WebviewController;
    private _disposables: vscode.Disposable[] = [];
    private _autosaveTimeout: NodeJS.Timeout | undefined;
    private _outputChannel: vscode.OutputChannel;

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (SoapPanel.currentPanel) {
            SoapPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            SoapPanel.viewType,
            'Dirty SOAP',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(extensionUri, 'webview-build')
                ]
            }
        );

        SoapPanel.currentPanel = new SoapPanel(panel, extensionUri);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._outputChannel = vscode.window.createOutputChannel('Dirty SOAP');
        this._soapClient = new SoapClient(this._outputChannel);
        this._projectStorage = new ProjectStorage(this._outputChannel);
        this._settingsManager = new SettingsManager();

        this._fileWatcherService = new FileWatcherService(this._outputChannel);
        this._proxyService = new ProxyService();
        this._proxyService.setLogger(msg => this._outputChannel.appendLine(msg));
        this._proxyService.on('log', (event: any) => {
            const statusFn = (s: number) => s >= 200 && s < 300 ? 'SUCCESS' : 'FAIL';
            if (event.type === 'request') {
                this._outputChannel.appendLine(`[Proxy] Request: ${event.method} ${event.url}`);
            } else {
                this._outputChannel.appendLine(`[Proxy] Response: ${event.method} ${event.url} -> ${event.status} (${event.duration}s)`);
                if (event.error) {
                    this._outputChannel.appendLine(`[Proxy] Error: ${event.error}`);
                }
            }
        });
        this._configSwitcherService = new ConfigSwitcherService();

        this._controller = new WebviewController(
            this._panel,
            this._extensionUri,
            this._soapClient,
            this._projectStorage,
            this._settingsManager,
            this._fileWatcherService,
            this._proxyService,
            this._configSwitcherService
        );

        // Watcher starts stopped by default.


        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);

        // Initial Settings Send
        this._controller.sendSettingsToWebview();

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

        SoapPanel.currentPanel = undefined;

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

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-randomNonce' ${webview.cspSource} 'unsafe-eval'; worker-src blob:; font-src ${webview.cspSource} data:;">
            <title>Dirty SOAP</title>
            <link rel="stylesheet" type="text/css" href="${styleUri}">
        </head>
        <body>
            <div id="root"></div>
            <script type="module" nonce="randomNonce" src="${scriptUri}"></script>
        </body>
        </html>`;
    }
}

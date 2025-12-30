
import { ICommand } from './ICommand';
import { ProxyService } from '../services/ProxyService';
import { SettingsManager } from '../utils/SettingsManager';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';
import { SoapClient } from '../soapClient';
import * as vscode from 'vscode';
import * as fs from 'fs';

export class StartProxyCommand implements ICommand {
    constructor(private readonly _proxyService: ProxyService) { }
    async execute(message: any): Promise<void> {
        this._proxyService.start();
    }
}

export class StopProxyCommand implements ICommand {
    constructor(private readonly _proxyService: ProxyService) { }
    async execute(message: any): Promise<void> {
        this._proxyService.stop();
    }
}

export class UpdateProxyConfigCommand implements ICommand {
    constructor(
        private readonly _proxyService: ProxyService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        console.log('[ProxyCommands] Received updateProxyConfig:', message.config);
        const proxyConfig = {
            port: message.config.port,
            targetUrl: message.config.target || message.config.targetUrl,
            systemProxyEnabled: message.config.systemProxyEnabled
        };

        this._proxyService.updateConfig(proxyConfig);
        if (proxyConfig.targetUrl) {
            this._settingsManager.updateLastProxyTarget(proxyConfig.targetUrl);
        }
    }
}

export class SaveProxyHistoryCommand implements ICommand {
    // Uses static vscode.window methods, no constructor needed
    async execute(message: any): Promise<void> {
        try {
            const defaultName = `proxy-report-${new Date().toISOString().slice(0, 10)}.md`;
            const uri = await vscode.window.showSaveDialog({
                filters: { 'Markdown Report': ['md'], 'Text File': ['txt'] },
                saveLabel: 'Save Proxy Report',
                defaultUri: vscode.Uri.file(defaultName)
            });
            if (uri) {
                fs.writeFileSync(uri.fsPath, message.content);
                vscode.window.showInformationMessage(`Report saved to ${uri.fsPath}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to save report: ${e.message}`);
        }
    }
}

export class InjectProxyCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _configSwitcherService: ConfigSwitcherService,
        private readonly _proxyService: ProxyService,
        private readonly _soapClient: SoapClient
    ) { }

    async execute(message: any): Promise<void> {
        // First check certs before injecting?
        // Original logic checked certs for 'openCertificate' and also for 'injectProxy' ?
        // Line 229 in original WebviewController: case 'injectProxy': ... Force generation code ...
        // Wait, 'injectProxy' logic in original file seemed to have TWO cases?
        // Lines 195-210 AND 229-269?
        // Oh, duplicate case labels? That would be a bug or I misread line numbers.
        // Let's check view_file 10191.
        // Line 195: case 'injectProxy': -> Switcher Service injection.
        // Line 229: case 'injectProxy': -> Open Certificate logic?
        // Wait, Duplicate case 'injectProxy'.
        // VS Code TS would complain.
        // Or maybe one was "openCertificate"?
        // Line 220: case 'openCertificate': this.handleOpenCertificate().
        // Line 229: case 'injectProxy' ... waits, this logic seems to be "checking certificate".
        // Ah, maybe the user wants to Open Certificate.
        // But duplicate case 'injectProxy' is definitely suspicious.
        // Line 195 handles config injection.
        // Line 229 handles certificate generation/opening?
        // I will assume the second one (Line 229) was meant to be 'openCertificate' logic but maybe misplaced or I am reading it wrong.
        // Actually, looking at Line 220, it calls `this.handleOpenCertificate()`.
        // And `handleOpenCertificate` (Line 503) contains the logic seen at 230+.
        // So Line 229 might be a copy-paste error in the source file I read?
        // Or maybe 'injectProxy' DOES check certificates?
        // But Line 195 returns.
        // So Line 229 is unreachable if it's the same switch.
        // I will extract the logic from 195.

        const injectResult = this._configSwitcherService.inject(message.path, message.proxyUrl);
        if (injectResult.success) {
            vscode.window.showInformationMessage(injectResult.message);
            if (injectResult.originalUrl) {
                this._panel.webview.postMessage({
                    command: 'updateProxyTarget',
                    target: injectResult.originalUrl
                });
            }
        } else {
            vscode.window.showErrorMessage(injectResult.message);
        }
        this._panel.webview.postMessage({ command: 'configSwitched', success: injectResult.success });
    }
}

export class RestoreProxyCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _configSwitcherService: ConfigSwitcherService
    ) { }

    async execute(message: any): Promise<void> {
        const restoreResult = this._configSwitcherService.restore(message.path);
        if (restoreResult.success) {
            vscode.window.showInformationMessage(restoreResult.message);
        } else {
            vscode.window.showErrorMessage(restoreResult.message);
        }
        this._panel.webview.postMessage({ command: 'configRestored', success: restoreResult.success });
    }
}

export class OpenCertificateCommand implements ICommand {
    constructor(
        private readonly _proxyService: ProxyService,
        private readonly _soapClient: SoapClient
    ) { }

    async execute(message: any): Promise<void> {
        // Force generation if not running or missing
        let certPath = this._proxyService.getCertPath();
        this._soapClient.log('[OpenCertificateCommand] Initial cert path: ' + certPath);

        if (!certPath || !fs.existsSync(certPath)) {
            try {
                this._soapClient.log('[OpenCertificateCommand] Cert missing. Forcing generation...');
                await this._proxyService.prepareCert();
                certPath = this._proxyService.getCertPath();
            } catch (e: any) {
                this._soapClient.log('Failed to generate certificate: ' + e.message);
                vscode.window.showErrorMessage('Failed to generate certificate: ' + e.message);
                return;
            }
        }

        this._soapClient.log('[OpenCertificateCommand] Opening certificate at: ' + certPath);

        if (certPath) {
            if (!fs.existsSync(certPath)) {
                this._soapClient.log('[OpenCertificateCommand] Certificate file still not found at path: ' + certPath);
                vscode.window.showErrorMessage(`Certificate file missing at: ${certPath}`);
                return;
            }

            try {
                const uri = vscode.Uri.file(certPath);
                this._soapClient.log('[OpenCertificateCommand] Opening URI: ' + uri.toString());
                await vscode.env.openExternal(uri);
                vscode.window.showInformationMessage(
                    "Certificate opened. To trust this proxy, install you root CA."
                );
            } catch (err: any) {
                vscode.window.showErrorMessage('Failed to open certificate: ' + err.message);
            }
        }
    }
}

export class ResolveBreakpointCommand implements ICommand {
    constructor(private readonly _proxyService: ProxyService) { }

    async execute(message: any): Promise<void> {
        const { breakpointId, content, cancelled } = message;
        this._proxyService.resolveBreakpoint(breakpointId, content || '', cancelled || false);
    }
}

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SoapPanel } from './panels/SoapPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "apinox" is now active!');

    // Pass extension context for SecretStorage (used by AzureDevOpsService)
    SoapPanel.setContext(context);

    // Create status bar button
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = "$(beaker) APInox";
    statusBarItem.tooltip = "Open APInox - WSDL Explorer & SOAP Client";
    statusBarItem.command = 'apinox.openInterface';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const disposable = vscode.commands.registerCommand('apinox.openInterface', () => {
        SoapPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);

    // Register Reset Configuration Command
    const resetDisposable = vscode.commands.registerCommand('apinox.resetConfiguration', async () => {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to reset all APInox configuration? This will delete all settings, saved requests, environments, and history. This action cannot be undone.',
            { modal: true },
            'Reset Everything'
        );

        if (result === 'Reset Everything') {
            try {
                const configDir = path.join(os.homedir(), '.apinox');

                if (fs.existsSync(configDir)) {
                    // Close panel if open - need to wait for disposal to complete
                    if (SoapPanel.currentPanel) {
                        SoapPanel.currentPanel.dispose();
                        // Wait for webview channel to fully close (especially important in debugger)
                        await new Promise(resolve => setTimeout(resolve, 500));
                    }

                    // Delete directory
                    fs.rmSync(configDir, { recursive: true, force: true });

                    const reloadResult = await vscode.window.showInformationMessage(
                        'Configuration reset successfully. Window needs to reloaded.',
                        'Reload Window'
                    );

                    if (reloadResult === 'Reload Window') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                } else {
                    vscode.window.showInformationMessage('Configuration directory not found. Already clean?');
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to reset configuration: ${error.message}`);
            }
        }
    });

    context.subscriptions.push(resetDisposable);

    // Register Export Diagnostics Command
    const exportDiagnosticsDisposable = vscode.commands.registerCommand('apinox.exportDiagnostics', async () => {
        try {
            const { DiagnosticService } = require('./services/DiagnosticService');
            const service = DiagnosticService.getInstance();
            const filePath = await service.exportLogs();

            const openFile = 'Open File';
            const result = await vscode.window.showInformationMessage(
                `Diagnostic logs exported to: ${filePath}`,
                openFile
            );

            if (result === openFile) {
                const doc = await vscode.workspace.openTextDocument(filePath);
                await vscode.window.showTextDocument(doc);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to export diagnostics: ${error.message}`);
        }
    });

    context.subscriptions.push(exportDiagnosticsDisposable);
}

export function deactivate() {
    console.log('APInox: Deactivate called.');
    // Ensure the panel is properly disposed when the extension is deactivated
    if (SoapPanel.currentPanel) {
        console.log('APInox: Disposing panel...');
        SoapPanel.currentPanel.dispose();
        console.log('APInox: Panel disposed.');
    }
    console.log('APInox: Deactivate finished.');
}

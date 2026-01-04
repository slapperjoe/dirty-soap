import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SoapPanel } from './panels/SoapPanel';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "dirty-soap" is now active!');

    // Pass extension context for SecretStorage (used by AzureDevOpsService)
    SoapPanel.setContext(context);

    // Create status bar button
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = "$(beaker) Dirty SOAP";
    statusBarItem.tooltip = "Open Dirty SOAP - WSDL Explorer & SOAP Client";
    statusBarItem.command = 'dirty-soap.openInterface';
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    const disposable = vscode.commands.registerCommand('dirty-soap.openInterface', () => {
        SoapPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);

    // Register Reset Configuration Command
    const resetDisposable = vscode.commands.registerCommand('dirty-soap.resetConfiguration', async () => {
        const result = await vscode.window.showWarningMessage(
            'Are you sure you want to reset all Dirty Soap configuration? This will delete all settings, saved requests, environments, and history. This action cannot be undone.',
            { modal: true },
            'Reset Everything'
        );

        if (result === 'Reset Everything') {
            try {
                const configDir = path.join(os.homedir(), '.dirty-soap');

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
}

export function deactivate() {
    console.log('Dirty Soap: Deactivate called.');
    // Ensure the panel is properly disposed when the extension is deactivated
    if (SoapPanel.currentPanel) {
        console.log('Dirty Soap: Disposing panel...');
        SoapPanel.currentPanel.dispose();
        console.log('Dirty Soap: Panel disposed.');
    }
    console.log('Dirty Soap: Deactivate finished.');
}

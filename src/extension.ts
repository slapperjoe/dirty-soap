import * as vscode from 'vscode';
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

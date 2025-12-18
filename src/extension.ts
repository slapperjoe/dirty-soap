import * as vscode from 'vscode';
import { SoapClient } from './soapClient';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "dirty-soap" is now active!');

    let disposable = vscode.commands.registerCommand('dirty-soap.openInterface', () => {
        SoapPanel.createOrShow(context.extensionUri);
    });

    context.subscriptions.push(disposable);
}

class SoapPanel {
    public static currentPanel: SoapPanel | undefined;
    public static readonly viewType = 'dirtySoap';
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _soapClient: SoapClient;

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

        const outputChannel = vscode.window.createOutputChannel('Dirty SOAP');
        this._soapClient = new SoapClient(outputChannel);

        this._panel.webview.html = this._getWebviewContent(this._panel.webview, extensionUri);
        this._panel.onDidDispose(() => {
            this.dispose();
            outputChannel.dispose();
        }, null, []);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'getLocalWsdls':
                        try {
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            this._soapClient['log']('Getting local WSDLs. Workspace folders:', workspaceFolders);

                            let wsdlDir = '';
                            if (workspaceFolders) {
                                wsdlDir = path.join(workspaceFolders[0].uri.fsPath, 'wsdl_files');
                                this._soapClient['log']('Using workspace directory:', wsdlDir);
                            } else {
                                // Fallback: Use extension's installed directory (robust for packaged extensions)
                                wsdlDir = path.join(this._extensionUri.fsPath, 'wsdl_files');
                                this._soapClient['log']('No workspace folders found. Using extension directory:', wsdlDir);
                            }

                            if (fs.existsSync(wsdlDir)) {
                                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                                this._soapClient['log']('Files found:', files);
                                this._panel.webview.postMessage({ command: 'localWsdls', files });
                            } else {
                                this._soapClient['log']('Directory does not exist:', wsdlDir);
                                this._panel.webview.postMessage({ command: 'localWsdls', files: [] });
                            }
                        } catch (error: any) {
                            console.error('Error getting local wsdls:', error); // Keep console error for devtools
                            this._soapClient['log']('Error getting local wsdls:', error);
                            this._panel.webview.postMessage({ command: 'localWsdls', files: [] });
                        }
                        return;
                    case 'loadWsdl':
                        try {
                            let urlToLoad = message.url;
                            let localWsdlDir: string | undefined;

                            if (message.isLocal) {
                                const workspaceFolders = vscode.workspace.workspaceFolders;
                                if (workspaceFolders) {
                                    urlToLoad = path.join(workspaceFolders[0].uri.fsPath, 'wsdl_files', message.url);
                                } else {
                                    urlToLoad = path.join(this._extensionUri.fsPath, 'wsdl_files', message.url);
                                }
                                // If local, enable local import resolution from the same directory
                                localWsdlDir = path.dirname(urlToLoad);
                            }

                            this._soapClient['log']('Loading WSDL from:', urlToLoad);
                            const services = await this._soapClient.parseWsdl(urlToLoad, localWsdlDir);
                            this._panel.webview.postMessage({ command: 'wsdlParsed', services });
                        } catch (error: any) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this._panel.webview.postMessage({ command: 'error', message: errorMessage });
                        }
                        return;
                    case 'downloadWsdl':
                        try {
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            let wsdlDir = '';
                            if (workspaceFolders) {
                                wsdlDir = path.join(workspaceFolders[0].uri.fsPath, 'wsdl_files');
                            } else {
                                wsdlDir = path.join(this._extensionUri.fsPath, 'wsdl_files');
                            }

                            if (!fs.existsSync(wsdlDir)) {
                                fs.mkdirSync(wsdlDir, { recursive: true });
                            }

                            this._soapClient['log']('Starting download for:', message.url);

                            // Helper to download recursively
                            const visited = new Set<string>();
                            const downloadRecursive = async (url: string, destDir: string) => {
                                if (visited.has(url)) return;
                                visited.add(url);

                                try {
                                    this._soapClient['log'](`Downloading: ${url}`);
                                    const response = await axios.get(url, { responseType: 'text' });
                                    const content = response.data;

                                    // Extract filename
                                    let filename = url.split('/').pop()?.split('?')[0];
                                    if (!filename) filename = 'downloaded.wsdl';

                                    const filePath = path.join(destDir, filename);
                                    fs.writeFileSync(filePath, content);
                                    this._soapClient['log'](`Saved to: ${filePath}`);

                                    // Find imports (naive regex for WSDL/XSD imports)
                                    // Matches schemaLocation="http..." or location="http..."
                                    const regex = /(?:schemaLocation|location)\s*=\s*["'](http[^"']+)["']/g;
                                    let match;

                                    while ((match = regex.exec(content)) !== null) {
                                        const importUrl = match[2];
                                        // Save imports to 'imports' subdirectory to keep main list clean
                                        const importsDir = path.join(wsdlDir, 'imports'); // Always relative to root wsdlDir
                                        if (!fs.existsSync(importsDir)) {
                                            fs.mkdirSync(importsDir);
                                        }
                                        await downloadRecursive(importUrl, importsDir);
                                    }
                                } catch (e: any) {
                                    this._soapClient['log'](`Error downloading ${url}: ${e.message}`);
                                    // Don't fail the whole process, just log
                                }
                            };

                            await downloadRecursive(message.url, wsdlDir);

                            this._soapClient['log']('Download complete.');
                            // Refresh local files list
                            // Wait a bit or reused logic?
                            // Call logic for 'getLocalWsdls' essentially
                            if (fs.existsSync(wsdlDir)) {
                                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                                this._panel.webview.postMessage({ command: 'localWsdls', files });
                            }

                        } catch (error: any) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this._panel.webview.postMessage({ command: 'error', message: `Download failed: ${errorMessage}` });
                        }
                        return;

                    case 'cancelRequest':
                        this._soapClient.cancelRequest();
                        return;
                    case 'executeRequest':
                        try {
                            const result = await this._soapClient.executeRequest(message.url, message.operation, message.xml);
                            this._panel.webview.postMessage({ command: 'response', result });
                        } catch (error: any) {
                            const errorMessage = error instanceof Error ? error.message : String(error);
                            this._panel.webview.postMessage({ command: 'error', message: errorMessage });
                        }
                        return;
                }
            },
            null,
            []
        );
    }

    public dispose() {
        SoapPanel.currentPanel = undefined;
        this._panel.dispose();
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
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-randomNonce' ${webview.cspSource};">
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

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import axios from 'axios';
import { SoapClient } from '../soapClient';
import { ProjectStorage } from '../ProjectStorage';
import { SettingsManager } from '../utils/SettingsManager';
import { WildcardProcessor } from '../utils/WildcardProcessor';

export class WebviewController {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _extensionUri: vscode.Uri,
        private readonly _soapClient: SoapClient,
        private readonly _projectStorage: ProjectStorage,
        private readonly _settingsManager: SettingsManager
    ) { }

    public async handleMessage(message: any) {
        switch (message.command) {
            case 'saveProject':
                await this.handleSaveProject(message);
                break;
            case 'loadProject':
                await this.handleLoadProject();
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
            case 'selectLocalWsdl':
                await this.handleSelectLocalWsdl();
                break;
            case 'getLocalWsdls':
                this.handleGetLocalWsdls();
                break;
            case 'loadWsdl':
                await this.handleLoadWsdl(message);
                break;
            case 'downloadWsdl':
                await this.handleDownloadWsdl(message);
                break;
            case 'cancelRequest':
                this._soapClient.cancelRequest();
                break;
            case 'executeRequest':
                await this.handleExecuteRequest(message);
                break;
            case 'saveSettings':
                this.handleSaveSettings(message);
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
            case 'getSettings':
                this.sendSettingsToWebview();
                break;
        }
    }

    private async handleSaveProject(message: any) {
        try {
            const uri = await vscode.window.showSaveDialog({
                filters: { 'SoapUI Project': ['xml'] },
                saveLabel: 'Save Workspace'
            });
            if (uri) {
                await this._projectStorage.saveProject(message.project, uri.fsPath);
                vscode.window.showInformationMessage(`Workspace saved to ${uri.fsPath}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to save project: ${e.message}`);
        }
    }

    private async handleLoadProject() {
        try {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { 'SoapUI Project': ['xml'] },
                openLabel: 'Open Workspace'
            });
            if (uris && uris.length > 0) {
                const project = await this._projectStorage.loadProject(uris[0].fsPath);
                this._panel.webview.postMessage({
                    command: 'projectLoaded',
                    project,
                    filename: path.basename(uris[0].fsPath)
                });
                vscode.window.showInformationMessage(`Workspace loaded from ${uris[0].fsPath}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load project: ${e.message}`);
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
                this._panel.webview.postMessage({
                    command: 'workspaceLoaded',
                    projects: projects
                });
                vscode.window.showInformationMessage(`Workspace loaded from ${uris[0].fsPath}`);
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to load workspace: ${e.message}`);
        }
    }

    private handleGetSampleSchema(message: any) {
        const schema = this._soapClient.getOperationSchema(message.operationName);
        this._panel?.webview.postMessage({ command: 'sampleSchema', schema, operationName: message.operationName });
    }

    private async handleSelectLocalWsdl() {
        try {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                filters: { 'WSDL Files': ['wsdl', 'xml'] },
                openLabel: 'Select WSDL'
            });
            if (uris && uris.length > 0) {
                this._panel.webview.postMessage({
                    command: 'wsdlSelected',
                    path: uris[0].fsPath
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to select WSDL: ${e.message}`);
        }
    }

    private handleGetLocalWsdls() {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            this._soapClient.log('Getting local WSDLs. Workspace folders:', workspaceFolders);

            let wsdlDir = '';
            if (workspaceFolders) {
                wsdlDir = path.join(workspaceFolders[0].uri.fsPath, 'wsdl_files');
                this._soapClient.log('Using workspace directory:', wsdlDir);
            } else {
                wsdlDir = path.join(this._extensionUri.fsPath, 'wsdl_files');
                this._soapClient.log('No workspace folders found. Using extension directory:', wsdlDir);
            }

            if (fs.existsSync(wsdlDir)) {
                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                this._soapClient.log('Files found:', files);
                this._panel.webview.postMessage({ command: 'localWsdls', files });
            } else {
                this._soapClient.log('Directory does not exist:', wsdlDir);
                this._panel.webview.postMessage({ command: 'localWsdls', files: [] });
            }
        } catch (error: any) {
            console.error('Error getting local wsdls:', error);
            this._soapClient.log('Error getting local wsdls:', error);
            this._panel.webview.postMessage({ command: 'localWsdls', files: [] });
        }
    }

    private async handleLoadWsdl(message: any) {
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
                localWsdlDir = path.dirname(urlToLoad);
            }

            this._soapClient.log('Loading WSDL from:', urlToLoad);
            const services = await this._soapClient.parseWsdl(urlToLoad, localWsdlDir);
            this._panel.webview.postMessage({ command: 'wsdlParsed', services });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({ command: 'error', message: errorMessage });
        }
    }

    private async handleDownloadWsdl(message: any) {
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

            this._soapClient.log('Starting download for:', message.url);
            const visited = new Set<string>();
            const downloadedFiles: string[] = [];

            const downloadRecursive = async (url: string, destDir: string, forcedFilename?: string) => {
                if (visited.has(url)) return;
                visited.add(url);

                try {
                    this._soapClient.log(`Downloading: ${url}`);
                    const response = await axios.get(url, { responseType: 'text' });
                    const content = response.data;

                    let filename: string;
                    if (forcedFilename) {
                        filename = forcedFilename;
                    } else {
                        filename = url.split('/').pop()?.split('?')[0] || 'downloaded.wsdl';
                    }

                    const filePath = path.join(destDir, filename);
                    fs.writeFileSync(filePath, content);
                    this._soapClient.log(`Saved to: ${filePath}`);

                    const relativePath = path.relative(wsdlDir, filePath);
                    downloadedFiles.push(relativePath || filename);

                    const regex = /(?:schemaLocation|location)\s*=\s*["'](http[^"']+)["']/g;
                    let match;

                    while ((match = regex.exec(content)) !== null) {
                        const importUrl = match[2];
                        const importsDir = path.join(wsdlDir, 'imports');
                        if (!fs.existsSync(importsDir)) {
                            fs.mkdirSync(importsDir);
                        }
                        await downloadRecursive(importUrl, importsDir);
                    }
                } catch (e: any) {
                    this._soapClient.log(`Error downloading ${url}: ${e.message}`);
                }
            };

            let rootFilename = message.url.split('/').pop()?.split('?')[0] || 'service.wsdl';
            const lastDotIndex = rootFilename.lastIndexOf('.');
            if (lastDotIndex > 0) {
                rootFilename = rootFilename.substring(0, lastDotIndex) + '.wsdl';
            } else {
                rootFilename += '.wsdl';
            }

            await downloadRecursive(message.url, wsdlDir, rootFilename);

            this._soapClient.log('Download complete.');

            if (fs.existsSync(wsdlDir)) {
                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                this._panel.webview.postMessage({ command: 'localWsdls', files });
            }

            this._panel.webview.postMessage({ command: 'downloadComplete', files: downloadedFiles });

        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({ command: 'error', message: `Download failed: ${errorMessage}` });
        }
    }

    private async handleExecuteRequest(message: any) {
        try {
            const config = this._settingsManager.getConfig();
            const activeEnvName = config.activeEnvironment || 'Build';
            const activeEnv = config.environments ? config.environments[activeEnvName] : {};

            const envVars = activeEnv as Record<string, string>;
            const globals = config.globals as Record<string, string> || {};
            const scriptsDir = this._settingsManager.scriptsDir;

            const processedUrl = WildcardProcessor.process(message.url, envVars, globals, scriptsDir);
            const processedXml = WildcardProcessor.process(message.xml, envVars, globals, scriptsDir);

            this._soapClient.log('--- Executing Request ---');
            this._soapClient.log('Original URL:', message.url);
            this._soapClient.log('Substituted URL:', processedUrl);
            this._soapClient.log('Substituted Payload:', processedXml);
            this._soapClient.log('-----------------------');

            // Pass headers if needed, currently wildcard processor only handles primitives
            const result = await this._soapClient.executeRequest(processedUrl, message.operation, processedXml);
            this._panel.webview.postMessage({ command: 'response', result });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._panel.webview.postMessage({ command: 'error', message: errorMessage });
        }
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

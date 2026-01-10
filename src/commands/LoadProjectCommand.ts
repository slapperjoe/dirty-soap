
import { ICommand } from './ICommand';
import { ProjectStorage } from '../ProjectStorage';
import { FolderProjectStorage } from '../FolderProjectStorage';
import { SoapClient } from '../soapClient';
import { SoapUIProject } from '../../shared/src/models';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class LoadProjectCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient, // For logging
        private readonly _folderStorage: FolderProjectStorage,
        private readonly _projectStorage: ProjectStorage,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        try {
            let targetPath = message.path;

            if (!targetPath) {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: true, // Allow both!
                    filters: { 'SoapUI Project': ['xml', 'json'] },
                    openLabel: 'Open Project'
                });
                if (uris && uris.length > 0) {
                    targetPath = uris[0].fsPath;
                }
            }

            if (targetPath) {
                // Ignore internal sample project requests to prevent ENOENT
                if (targetPath === 'Samples' || targetPath === 'samples-project-read-only') {
                    return;
                }

                let project: SoapUIProject;

                // Check if directory or file
                const stats = fs.statSync(targetPath);

                if (stats.isDirectory()) {
                    // Check if valid Dirty Project
                    if (!fs.existsSync(path.join(targetPath, 'properties.json'))) {
                        throw new Error("Selected folder is not a valid DirtySoap project (missing properties.json).");
                    }
                    project = await this._folderStorage.loadProject(targetPath);
                } else {
                    // Assume XML
                    project = await this._projectStorage.loadProject(targetPath);
                }

                if (project && project.testSuites) {
                    project.testSuites.forEach(ts => {
                        ts.testCases.forEach(tc => {
                            tc.steps.forEach(step => {
                                if (step.type === 'script') {
                                    this._soapClient.log(`[LoadProjectCommand] Sending step ${step.name} with scriptContent length: ${step.config.scriptContent?.length || 0}`);
                                    if (step.config.scriptContent) {
                                        this._soapClient.log(`[LoadProjectCommand] Content: ${step.config.scriptContent.substring(0, 50)}...`);
                                    }
                                }
                            });
                        });
                    });
                }

                this._loadedProjects.set(targetPath, project);
                this._panel.webview.postMessage({
                    command: 'projectLoaded',
                    project,
                    filename: targetPath // Send full path (dir or file)
                });
                vscode.window.showInformationMessage(`Project loaded from ${targetPath}`);
            }
        } catch (e: any) {
            this._soapClient.log(`Error loading project: ${e.message}`);
            if (e.stack) this._soapClient.log(e.stack);
            vscode.window.showErrorMessage(`Failed to load project: ${e.message}`);
        }
    }
}

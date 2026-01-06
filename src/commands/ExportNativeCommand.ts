
import { ICommand } from './ICommand';
import { FolderProjectStorage } from '../FolderProjectStorage';
import { SoapUIProject } from '@shared/models';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class ExportNativeCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _folderStorage: FolderProjectStorage,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const project = message.project;
            if (!project) throw new Error("No project provided for export.");

            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Export Project to Folder'
            });

            if (uris && uris.length > 0) {
                const parentDir = uris[0].fsPath;
                const safeName = project.name.replace(/[^a-z0-9\-_]/gi, '_');
                const projectDir = path.join(parentDir, safeName);

                if (fs.existsSync(projectDir)) {
                    const overwrite = await vscode.window.showWarningMessage(
                        `Folder '${safeName}' already exists. Overwrite?`, 'Yes', 'No'
                    );
                    if (overwrite !== 'Yes') return;
                }

                const exportedProject = { ...project, fileName: projectDir };
                await this._folderStorage.saveProject(exportedProject, projectDir);

                // Update cache if the project was already loaded
                if (project.fileName) {
                    this._loadedProjects.delete(project.fileName);
                }
                this._loadedProjects.set(projectDir, exportedProject);

                vscode.window.showInformationMessage(`Project exported to ${projectDir}`);

                // Notify webview that the project has a new filename and is no longer dirty relative to its new home
                this._panel.webview.postMessage({
                    command: 'projectSaved',
                    projectName: exportedProject.name,
                    fileName: projectDir
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to export project: ${e.message}`);
        }
    }
}

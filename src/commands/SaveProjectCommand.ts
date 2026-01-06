
import { ICommand } from './ICommand';

import { ProjectStorage } from '../ProjectStorage';
import { FolderProjectStorage } from '../FolderProjectStorage';
import { SoapUIProject } from '@shared/models';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SaveProjectCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _folderStorage: FolderProjectStorage,
        private readonly _projectStorage: ProjectStorage,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const fileName = message.project.fileName;

            // 1. Existing file/folder?
            if (fileName && fs.existsSync(fileName)) {
                const stats = fs.statSync(fileName);
                if (stats.isDirectory()) {
                    await this._folderStorage.saveProject(message.project, fileName);
                } else {
                    await this._projectStorage.saveProject(message.project, fileName);
                }

                // Update cache & Notify
                // Deduplicate: Remove any existing entries with same path (case-insensitive) to prevent stale duplicates
                for (const key of this._loadedProjects.keys()) {
                    if (key.toLowerCase() === fileName.toLowerCase()) {
                        this._loadedProjects.delete(key);
                    }
                }
                this._loadedProjects.set(fileName, message.project);
                vscode.window.setStatusBarMessage(`Project saved to ${fileName}`, 2000);
                this._panel.webview.postMessage({ command: 'projectSaved', projectName: message.project.name, fileName: fileName });
                return;
            }

            // 2. New Save - Ask for Format
            const saveType = await vscode.window.showQuickPick(
                [
                    { label: 'Save as Folder Project (Recommended)', detail: 'New folder-based format. Git-friendly.', picked: true, id: 'folder' },
                    { label: 'Save as Legacy SoapUI XML', detail: 'Single .xml file compatible with SoapUI 5.x', id: 'xml' }
                ],
                { placeHolder: 'Select Project Format' }
            );

            if (!saveType) return; // User cancelled

            if (saveType.id === 'folder') {
                const uris = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Save Project Here'
                });

                if (uris && uris.length > 0) {
                    const parentDir = uris[0].fsPath;
                    const safeName = message.project.name.replace(/[^a-z0-9\-_]/gi, '_');
                    const projectDir = path.join(parentDir, safeName);

                    if (fs.existsSync(projectDir)) {
                        const overwrite = await vscode.window.showWarningMessage(
                            `Folder '${safeName}' already exists. Overwrite?`, 'Yes', 'No'
                        );
                        if (overwrite !== 'Yes') return;
                    }

                    const savedProject = { ...message.project, fileName: projectDir };
                    await this._folderStorage.saveProject(savedProject, projectDir);

                    this._loadedProjects.set(projectDir, savedProject);
                    vscode.window.showInformationMessage(`Project saved to ${projectDir}`);
                    this._panel.webview.postMessage({ command: 'projectSaved', projectName: savedProject.name, fileName: projectDir });
                }

            } else {
                // Legacy XML
                const uri = await vscode.window.showSaveDialog({
                    filters: { 'SoapUI Project': ['xml'] },
                    saveLabel: 'Save Project XML'
                });
                if (uri) {
                    const savedProject = { ...message.project, fileName: uri.fsPath };
                    await this._projectStorage.saveProject(savedProject, uri.fsPath);
                    // Update cache
                    this._loadedProjects.set(uri.fsPath, savedProject);
                    vscode.window.showInformationMessage(`Project saved to ${uri.fsPath}`);
                    this._panel.webview.postMessage({ command: 'projectSaved', projectName: savedProject.name, fileName: uri.fsPath });
                }
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to save project: ${e.message}`);
        }
    }
}

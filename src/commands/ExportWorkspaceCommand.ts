import { ICommand } from './ICommand';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

export class ExportWorkspaceCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const projectPaths: string[] = message.projectPaths;

            if (!projectPaths || projectPaths.length === 0) {
                vscode.window.showWarningMessage('No projects selected for export');
                return;
            }

            // Validate all paths exist and are valid project folders
            const validPaths: string[] = [];
            for (const projectPath of projectPaths) {
                if (!fs.existsSync(projectPath)) {
                    vscode.window.showWarningMessage(`Project path does not exist: ${projectPath}`);
                    continue;
                }

                const stats = fs.statSync(projectPath);
                if (!stats.isDirectory()) {
                    vscode.window.showWarningMessage(`Project path is not a folder: ${projectPath}`);
                    continue;
                }

                const propertiesPath = path.join(projectPath, 'properties.json');
                if (!fs.existsSync(propertiesPath)) {
                    vscode.window.showWarningMessage(`Not a valid project folder (missing properties.json): ${projectPath}`);
                    continue;
                }

                validPaths.push(projectPath);
            }

            if (validPaths.length === 0) {
                vscode.window.showErrorMessage('No valid projects to export');
                return;
            }

            // Create zip archive
            const zip = new JSZip();

            for (const projectPath of validPaths) {
                const projectName = path.basename(projectPath);
                await this.addFolderToZip(zip, projectPath, projectName);
            }

            // Generate zip content as Uint8Array
            const zipContent = await zip.generateAsync({ type: 'uint8array' });

            // Show save dialog
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file('workspace.apxworkspace'),
                filters: {
                    'APInox Workspace': ['apxworkspace'],
                    'All Files': ['*']
                },
                saveLabel: 'Export Workspace'
            });

            if (!uri) {
                return; // User cancelled
            }

            // Write zip file
            fs.writeFileSync(uri.fsPath, zipContent);

            vscode.window.showInformationMessage(
                `Workspace exported successfully: ${validPaths.length} project(s) saved to ${uri.fsPath}`
            );

        } catch (e: any) {
            vscode.window.showErrorMessage(`Failed to export workspace: ${e.message}`);
        }
    }

    /**
     * Recursively adds all files from a folder to the zip archive
     */
    private async addFolderToZip(zip: JSZip, folderPath: string, zipPath: string): Promise<void> {
        const entries = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(folderPath, entry.name);
            const entryZipPath = `${zipPath}/${entry.name}`;

            if (entry.isDirectory()) {
                // Recursively add subdirectory
                await this.addFolderToZip(zip, fullPath, entryZipPath);
            } else if (entry.isFile()) {
                // Add file to zip
                const fileContent = fs.readFileSync(fullPath);
                zip.file(entryZipPath, fileContent as any);
            }
        }
    }
}


import { ICommand } from './ICommand';
import { SoapUIProject, SoapTestStep } from '@shared/models';
import { ProjectStorage } from '../ProjectStorage';
import { FolderProjectStorage } from '../FolderProjectStorage';
import { DiagnosticService } from '../services/DiagnosticService';
import * as fs from 'fs';
import * as vscode from 'vscode';

export class UpdateTestStepCommand implements ICommand {
    private readonly _diagnosticService = DiagnosticService.getInstance();

    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _loadedProjects: Map<string, SoapUIProject>,
        private readonly _projectStorage: ProjectStorage,
        private readonly _folderStorage: FolderProjectStorage
    ) { }

    async execute(message: any): Promise<void> {
        const step = message.step as SoapTestStep;
        if (!step) {
            this._diagnosticService.log('ERROR', 'UpdateTestStepCommand: Received empty step');
            return;
        }

        // 1. LOGGING FOR VERIFICATION
        if (step.type === 'script' && step.config.scriptContent) {
            this._diagnosticService.log('BACKEND', `Received updateTestStep with content: ${step.config.scriptContent}`);
            console.log(`[UpdateTestStepCommand] Received content: ${step.config.scriptContent}`); // Double logging for visibility
        } else {
            this._diagnosticService.log('BACKEND', `Received updateTestStep for step: ${step.name}`);
        }

        // 2. Find and Update the Step in Memory
        let projectToSave: SoapUIProject | null = null;

        for (const project of this._loadedProjects.values()) {
            if (project.testSuites) {
                for (const suite of project.testSuites) {
                    if (suite.testCases) {
                        for (const testCase of suite.testCases) {
                            const stepIndex = testCase.steps.findIndex(s => s.id === step.id);
                            if (stepIndex !== -1) {
                                // Found it! Update in memory
                                testCase.steps[stepIndex] = step;
                                projectToSave = project;
                                break;
                            }
                        }
                    }
                    if (projectToSave) break;
                }
            }
            if (projectToSave) break;
        }

        if (!projectToSave) {
            this._diagnosticService.log('ERROR', `UpdateTestStepCommand: Could not find project for step ${step.id}`);
            return;
        }

        // 3. Save the Project
        try {
            const fileName = projectToSave.fileName;
            if (fileName && fs.existsSync(fileName)) {
                const stats = fs.statSync(fileName);
                if (stats.isDirectory()) {
                    await this._folderStorage.saveProject(projectToSave, fileName);
                    this._diagnosticService.log('BACKEND', `Saved folder project ${projectToSave.name}`);
                } else {
                    await this._projectStorage.saveProject(projectToSave, fileName);
                    this._diagnosticService.log('BACKEND', `Saved XML project ${projectToSave.name}`);
                }

                // Update cache to ensure it stays fresh
                this._loadedProjects.set(fileName, projectToSave);

                // 4. IMPORTANT: Send updated project back to webview to sync state
                this._panel.webview.postMessage({
                    command: 'projectLoaded',
                    project: projectToSave,
                    filename: fileName
                });
                this._diagnosticService.log('BACKEND', `Sent updated project ${projectToSave.name} to webview for sync`);
            } else {
                this._diagnosticService.log('ERROR', `Project ${projectToSave.name} has no valid filename, cannot save.`);
            }
        } catch (e: any) {
            this._diagnosticService.log('ERROR', `Failed to save project after step update: ${e.message}`);
        }
    }
}

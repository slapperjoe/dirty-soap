
import { ICommand } from './ICommand';
import { TestRunnerService } from '../services/TestRunnerService';
import { SoapUIProject, SoapTestSuite, SoapTestCase } from '../models';
import * as vscode from 'vscode';

// Helper to find Test Suite/Case
function findTestSuite(loadedProjects: Map<string, SoapUIProject>, suiteId: string): { suite: SoapTestSuite, project: SoapUIProject } | undefined {
    for (const project of loadedProjects.values()) {
        if (project.testSuites) {
            const suite = project.testSuites.find(s => s.id === suiteId);
            if (suite) return { suite, project };
        }
    }
    return undefined;
}

function findTestCase(loadedProjects: Map<string, SoapUIProject>, caseId: string): { testCase: SoapTestCase, project: SoapUIProject } | undefined {
    for (const project of loadedProjects.values()) {
        if (project.testSuites) {
            for (const suite of project.testSuites) {
                const testCase = suite.testCases?.find(c => c.id === caseId);
                if (testCase) return { testCase, project };
            }
        }
    }
    return undefined;
}

export class RunTestSuiteCommand implements ICommand {
    constructor(
        private readonly _testRunnerService: TestRunnerService,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        const suiteId = message.suiteId;
        const found = findTestSuite(this._loadedProjects, suiteId);
        if (!found) {
            vscode.window.showErrorMessage(`Test Suite not found: ${suiteId}`);
            return;
        }

        console.log(`[RunTestSuiteCommand] Run Suite: ${found.suite.name}`);
        if (found.suite.testCases && found.suite.testCases.length > 0) {
            for (const testCase of found.suite.testCases) {
                await this._testRunnerService.runTestCase(testCase);
            }
        } else {
            vscode.window.showInformationMessage(`Test Suite ${found.suite.name} has no test cases.`);
        }
    }
}

export class RunTestCaseCommand implements ICommand {
    constructor(
        private readonly _testRunnerService: TestRunnerService,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        const caseId = message.caseId;
        const fallbackEndpoint = message.fallbackEndpoint;
        const testCase = message.testCase ? message.testCase : undefined;

        let tcToRun = testCase;
        if (!tcToRun) {
            const found = findTestCase(this._loadedProjects, caseId);
            if (!found) {
                vscode.window.showErrorMessage(`Test Case not found: ${caseId}`);
                return;
            }
            tcToRun = found.testCase;
        }

        console.log(`[RunTestCaseCommand] Run Case: ${tcToRun.name} (fallback: ${fallbackEndpoint})`);
        await this._testRunnerService.runTestCase(tcToRun, fallbackEndpoint);
    }
}

export class PickOperationForTestCaseCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _loadedProjects: Map<string, SoapUIProject>
    ) { }

    async execute(message: any): Promise<void> {
        const caseId = message.caseId;
        const items: vscode.QuickPickItem[] = [];
        const operations: any[] = [];

        for (const project of this._loadedProjects.values()) {
            if (project.interfaces) {
                for (const iface of project.interfaces) {
                    if (iface.operations) {
                        for (const op of iface.operations) {
                            items.push({
                                label: op.name,
                                description: `${project.name} > ${iface.name}`,
                                detail: (op as any).originalEndpoint || ''
                            });
                            operations.push(op);
                        }
                    }
                }
            }
        }

        const selected = await vscode.window.showQuickPick(items, { placeHolder: 'Select Operation to Add' });
        if (selected) {
            const index = items.indexOf(selected);
            const op = operations[index];
            if (op) {
                this._panel.webview.postMessage({
                    command: 'addStepToCase',
                    caseId,
                    operation: op
                });
            }
        }
    }
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateTestStepCommand } from '../commands/UpdateTestStepCommand';
import { SoapUIProject, SoapTestStep } from '@shared/models';
import * as vscode from 'vscode';

// Mock vscode
vi.mock('vscode', () => ({
    WebviewPanel: vi.fn()
}));

describe('UpdateTestStepCommand', () => {
    let mockPanel: any;
    let loadedProjects: Map<string, SoapUIProject>;
    let mockProjectStorage: any;
    let mockFolderStorage: any;
    let command: UpdateTestStepCommand;

    const createMockProject = (): SoapUIProject => ({
        name: 'Test Project',
        id: 'proj-1',
        fileName: 'c:\\Users\\Test\\project',
        interfaces: [],
        testSuites: [{
            id: 'suite-1',
            name: 'Test Suite',
            testCases: [{
                id: 'case-1',
                name: 'Test Case',
                steps: [{
                    id: 'step-1',
                    name: 'Script Step',
                    type: 'script',
                    config: {
                        scriptContent: '// Original content'
                    }
                }]
            }]
        }]
    });

    beforeEach(() => {
        // Create mock panel with webview
        mockPanel = {
            webview: {
                postMessage: vi.fn()
            }
        };

        loadedProjects = new Map();
        loadedProjects.set('c:\\Users\\Test\\project', createMockProject());

        mockProjectStorage = {
            saveProject: vi.fn()
        };

        mockFolderStorage = {
            saveProject: vi.fn().mockResolvedValue(undefined)
        };

        // Mock fs
        vi.mock('fs', () => ({
            existsSync: vi.fn().mockReturnValue(true),
            statSync: vi.fn().mockReturnValue({ isDirectory: () => true })
        }));

        command = new UpdateTestStepCommand(
            mockPanel,
            loadedProjects,
            mockProjectStorage,
            mockFolderStorage
        );
    });

    it('should update step in memory', async () => {
        const updatedStep: SoapTestStep = {
            id: 'step-1',
            name: 'Script Step',
            type: 'script',
            config: {
                scriptContent: '// Updated content\nlog("test");'
            }
        };

        await command.execute({ step: updatedStep });

        const project = loadedProjects.get('c:\\Users\\Test\\project');
        const actualStep = project?.testSuites?.[0]?.testCases?.[0]?.steps?.[0];

        expect(actualStep?.config.scriptContent).toBe('// Updated content\nlog("test");');
    });

    it('should save project to disk after updating step', async () => {
        const updatedStep: SoapTestStep = {
            id: 'step-1',
            name: 'Script Step',
            type: 'script',
            config: {
                scriptContent: '// Updated content'
            }
        };

        await command.execute({ step: updatedStep });

        expect(mockFolderStorage.saveProject).toHaveBeenCalled();
    });

    it('should send projectLoaded message to webview after save', async () => {
        const updatedStep: SoapTestStep = {
            id: 'step-1',
            name: 'Script Step',
            type: 'script',
            config: {
                scriptContent: '// Updated content'
            }
        };

        await command.execute({ step: updatedStep });

        expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'projectLoaded'
            })
        );
    });

    it('should include updated project in projectLoaded message', async () => {
        const updatedStep: SoapTestStep = {
            id: 'step-1',
            name: 'Script Step',
            type: 'script',
            config: {
                scriptContent: '// New content'
            }
        };

        await command.execute({ step: updatedStep });

        const postMessageCall = mockPanel.webview.postMessage.mock.calls[0][0];
        expect(postMessageCall.project).toBeDefined();
        expect(postMessageCall.project.testSuites[0].testCases[0].steps[0].config.scriptContent).toBe('// New content');
    });

    it('should handle non-existent step gracefully', async () => {
        const nonExistentStep: SoapTestStep = {
            id: 'step-999',
            name: 'Non-existent',
            type: 'script',
            config: { scriptContent: 'test' }
        };

        await command.execute({ step: nonExistentStep });

        // Should not save or send message if step not found
        expect(mockFolderStorage.saveProject).not.toHaveBeenCalled();
        expect(mockPanel.webview.postMessage).not.toHaveBeenCalled();
    });
});

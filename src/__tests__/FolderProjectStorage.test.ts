import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { FolderProjectStorage } from '../FolderProjectStorage';
import { SoapUIProject } from '../models';

describe('FolderProjectStorage', () => {
    let storage: FolderProjectStorage;
    let tempDir: string;

    beforeEach(() => {
        storage = new FolderProjectStorage();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dirty-soap-test-'));
    });

    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true });
        }
    });

    const createTestProject = (): SoapUIProject => ({
        name: 'Test Project',
        description: 'A test project',
        interfaces: [],
        testSuites: [
            {
                id: 'suite-1',
                name: 'TestSuite 1',
                testCases: [
                    {
                        id: 'case-1',
                        name: 'TestCase 1',
                        steps: [
                            {
                                id: 'step-1',
                                name: 'Request Step',
                                type: 'request',
                                config: {
                                    request: {
                                        id: 'req-1',
                                        name: 'Test Request',
                                        method: 'POST',
                                        endpoint: 'http://example.com',
                                        request: '<soap:Envelope/>'
                                    }
                                }
                            },
                            {
                                id: 'step-2',
                                name: 'Script Step',
                                type: 'script',
                                config: {
                                    scriptContent: 'log("Hello World");'
                                }
                            }
                        ]
                    }
                ]
            }
        ]
    });

    describe('saveProject', () => {
        it('should create project directory structure', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            await storage.saveProject(project, projectDir);

            // Verify directory structure
            expect(fs.existsSync(path.join(projectDir, 'properties.json'))).toBe(true);
            expect(fs.existsSync(path.join(projectDir, 'tests'))).toBe(true);
            expect(fs.existsSync(path.join(projectDir, 'tests', 'TestSuite_1'))).toBe(true);
            expect(fs.existsSync(path.join(projectDir, 'tests', 'TestSuite_1', 'suite.json'))).toBe(true);
            expect(fs.existsSync(path.join(projectDir, 'tests', 'TestSuite_1', 'TestCase_1'))).toBe(true);
        });

        it('should save scriptContent correctly', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            await storage.saveProject(project, projectDir);

            // Find and verify script step
            const caseDir = path.join(projectDir, 'tests', 'TestSuite_1', 'TestCase_1');
            const stepFiles = fs.readdirSync(caseDir).filter(f => f.endsWith('.json') && f !== 'case.json');
            const scriptStepFile = stepFiles.find(f => f.includes('Script'));

            expect(scriptStepFile).toBeDefined();
            if (scriptStepFile) {
                const stepData = JSON.parse(fs.readFileSync(path.join(caseDir, scriptStepFile), 'utf8'));
                expect(stepData.config.scriptContent).toBe('log("Hello World");');
            }
        });

        it('should delete orphaned step files when steps are removed', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            // Save with 2 steps
            await storage.saveProject(project, projectDir);

            const caseDir = path.join(projectDir, 'tests', 'TestSuite_1', 'TestCase_1');
            let stepFiles = fs.readdirSync(caseDir).filter(f => f.endsWith('.json') && f !== 'case.json');
            expect(stepFiles.length).toBe(2);

            // Remove one step and save again
            if (project.testSuites && project.testSuites[0] && project.testSuites[0].testCases[0]) {
                const steps = project.testSuites[0].testCases[0].steps;
                if (steps) {
                    project.testSuites[0].testCases[0].steps = [steps[0]];
                    await storage.saveProject(project, projectDir);

                    stepFiles = fs.readdirSync(caseDir).filter(f => f.endsWith('.json') && f !== 'case.json');
                    expect(stepFiles.length).toBe(1);
                }
            }
        });

        it('should delete orphaned test case directories', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            // Add second test case
            if (project.testSuites && project.testSuites[0]) {
                project.testSuites[0].testCases.push({
                    id: 'case-2',
                    name: 'TestCase 2',
                    steps: []
                });
            }
            await storage.saveProject(project, projectDir);

            const suiteDir = path.join(projectDir, 'tests', 'TestSuite_1');
            let caseDirs = fs.readdirSync(suiteDir).filter(f => fs.statSync(path.join(suiteDir, f)).isDirectory());
            expect(caseDirs.length).toBe(2);

            // Remove one test case and save
            if (project.testSuites && project.testSuites[0]) {
                project.testSuites[0].testCases = [project.testSuites[0].testCases[0]];
                await storage.saveProject(project, projectDir);

                caseDirs = fs.readdirSync(suiteDir).filter(f => fs.statSync(path.join(suiteDir, f)).isDirectory());
                expect(caseDirs.length).toBe(1);
            }
        });
    });

    describe('loadProject', () => {
        it('should load project with all data', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            await storage.saveProject(project, projectDir);
            const loadedProject = await storage.loadProject(projectDir);

            expect(loadedProject.name).toBe('Test Project');
            expect(loadedProject.testSuites).toHaveLength(1);
            const suite = loadedProject.testSuites?.[0];
            expect(suite?.testCases).toHaveLength(1);
            expect(suite?.testCases[0].steps).toHaveLength(2);
        });

        it('should preserve scriptContent through save/load cycle', async () => {
            const project = createTestProject();
            const projectDir = path.join(tempDir, 'TestProject');
            fs.mkdirSync(projectDir);

            await storage.saveProject(project, projectDir);
            const loadedProject = await storage.loadProject(projectDir);

            const scriptStep = loadedProject.testSuites?.[0].testCases[0].steps.find(s => s.type === 'script');
            expect(scriptStep).toBeDefined();
            expect(scriptStep?.config.scriptContent).toBe('log("Hello World");');
        });

        it('should throw error for invalid project folder', async () => {
            const invalidDir = path.join(tempDir, 'invalid');
            fs.mkdirSync(invalidDir);

            await expect(storage.loadProject(invalidDir)).rejects.toThrow('Invalid project folder');
        });
    });
});

import * as fs from 'fs';
import * as path from 'path';
import { SoapUIProject, SoapUIInterface, SoapUIOperation, SoapUIRequest, SoapTestSuite, SoapTestCase } from '@shared/models';

export class FolderProjectStorage {
    private outputChannel: any = null;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[FolderStorage] ${message}`);
        }
    }

    /**
     * Saves the project to a directory structure.
     * @param project The project to save
     * @param dirPath The absolute path to the directory (e.g., C:/Projects/MyDirtyProject)
     */
    public async saveProject(project: SoapUIProject, dirPath: string) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 1. Save properties.json
        const props = {
            name: project.name,
            description: project.description,
            id: project.id,
            format: "dirty-soap-v1"
        };
        fs.writeFileSync(path.join(dirPath, 'properties.json'), JSON.stringify(props, null, 2));

        // 2. Save Interfaces
        const interfacesDir = path.join(dirPath, 'interfaces');
        if (fs.existsSync(interfacesDir)) {
            // Clean up? Ideally yes, to remove deleted stuff. But risky.
            // For now, simpler to overwrite. Real syncing is harder.
            // Let's assume we own this folder. To be safe, maybe don't delete yet.
        } else {
            fs.mkdirSync(interfacesDir);
        }

        for (const iface of project.interfaces) {
            const safeInterfaceName = this.sanitizeName(iface.name);
            const ifaceDir = path.join(interfacesDir, safeInterfaceName);
            if (!fs.existsSync(ifaceDir)) fs.mkdirSync(ifaceDir);

            // Interface Metadata
            const ifaceMeta = {
                name: iface.name,
                type: iface.type,
                bindingName: iface.bindingName,
                soapVersion: iface.soapVersion,
                definition: iface.definition // WSDL URL
            };
            fs.writeFileSync(path.join(ifaceDir, 'interface.json'), JSON.stringify(ifaceMeta, null, 2));

            // Operations
            // Handle multiple ops with same name? SOAP allows overload? Usually unique by name+input.

            for (const op of iface.operations) {
                const safeOpName = this.sanitizeName(op.name);
                const opDir = path.join(ifaceDir, safeOpName);
                if (!fs.existsSync(opDir)) fs.mkdirSync(opDir);

                // Operation Metadata (if needed, Action etc)
                const opMeta = {
                    name: op.name,
                    action: op.action
                };
                fs.writeFileSync(path.join(opDir, 'operation.json'), JSON.stringify(opMeta, null, 2));

                // Requests
                for (const req of op.requests) {
                    const reqName = this.sanitizeName(req.name);
                    // Request Metadata
                    const reqMeta = {
                        name: req.name, // Display name
                        endpoint: req.endpoint,
                        method: req.method,
                        contentType: req.contentType,
                        headers: req.headers,
                        assertions: req.assertions,
                        id: req.id
                    };

                    // Use ID for verification if possible, but folder name is readable.
                    // Let's use name.
                    const reqFileBase = path.join(opDir, reqName);

                    // Save Body as .xml
                    fs.writeFileSync(`${reqFileBase}.xml`, req.request || '');
                    // Save Metadata as .json
                    fs.writeFileSync(`${reqFileBase}.json`, JSON.stringify(reqMeta, null, 2));
                }
            }
        }

        // 3. Save Test Suites
        const testsDir = path.join(dirPath, 'tests');
        if (!fs.existsSync(testsDir)) fs.mkdirSync(testsDir);

        // Cleanup: Delete orphan test suite directories
        const currentSuiteNames = new Set((project.testSuites || []).map(s => this.sanitizeName(s.name)));
        const existingSuiteDirs = fs.readdirSync(testsDir).filter(f =>
            fs.statSync(path.join(testsDir, f)).isDirectory()
        );
        existingSuiteDirs.forEach(dir => {
            if (!currentSuiteNames.has(dir)) {
                fs.rmSync(path.join(testsDir, dir), { recursive: true });
            }
        });

        if (project.testSuites) {
            for (const suite of project.testSuites) {
                const safeSuiteName = this.sanitizeName(suite.name);
                const suiteDir = path.join(testsDir, safeSuiteName);
                if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir);

                // Suite Metadata
                const suiteMeta = {
                    id: suite.id,
                    name: suite.name
                };
                fs.writeFileSync(path.join(suiteDir, 'suite.json'), JSON.stringify(suiteMeta, null, 2));

                // Cleanup: Delete orphan test case directories
                const currentCaseNames = new Set((suite.testCases || []).map(tc => this.sanitizeName(tc.name)));
                const existingCaseDirs = fs.readdirSync(suiteDir).filter(f =>
                    f !== 'suite.json' && fs.statSync(path.join(suiteDir, f)).isDirectory()
                );
                existingCaseDirs.forEach(dir => {
                    if (!currentCaseNames.has(dir)) {
                        fs.rmSync(path.join(suiteDir, dir), { recursive: true });
                    }
                });

                // Test Cases
                if (suite.testCases) {
                    for (const tc of suite.testCases) {
                        const safeCaseName = this.sanitizeName(tc.name);
                        const caseDir = path.join(suiteDir, safeCaseName);
                        if (!fs.existsSync(caseDir)) fs.mkdirSync(caseDir);

                        // Case Metadata
                        const caseMeta = {
                            id: tc.id,
                            name: tc.name
                        };
                        fs.writeFileSync(path.join(caseDir, 'case.json'), JSON.stringify(caseMeta, null, 2));

                        // Steps
                        // Steps are ordered. Saving as 01_stepname.json feels good.
                        // First, delete any existing step files to remove orphaned steps
                        const existingFiles = fs.readdirSync(caseDir);
                        existingFiles.forEach(f => {
                            if (f.endsWith('.json') && f !== 'case.json') {
                                fs.unlinkSync(path.join(caseDir, f));
                            }
                        });

                        // Now write current steps
                        if (tc.steps) {
                            tc.steps.forEach((step, index) => {
                                const indexStr = (index + 1).toString().padStart(2, '0');
                                const safeStepName = this.sanitizeName(step.name);
                                const filename = `${indexStr}_${safeStepName}.json`;

                                fs.writeFileSync(path.join(caseDir, filename), JSON.stringify(step, null, 2));
                            });
                        }
                    }
                }
            }
        }

        this.log(`Project saved to folder: ${dirPath}`);
    }

    public async loadProject(dirPath: string): Promise<SoapUIProject> {
        this.log(`Loading project from folder: ${dirPath}`);

        const propsPath = path.join(dirPath, 'properties.json');
        if (!fs.existsSync(propsPath)) {
            throw new Error(`Invalid project folder: properties.json missing in ${dirPath}`);
        }

        const props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));

        const project: SoapUIProject = {
            name: props.name,
            description: props.description,
            id: props.id,
            interfaces: [],
            testSuites: [],
            fileName: dirPath // Essential for persistence!
        };

        // Load Interface
        const interfacesDir = path.join(dirPath, 'interfaces');
        if (fs.existsSync(interfacesDir)) {
            const ifaceDirs = fs.readdirSync(interfacesDir).filter(f => fs.statSync(path.join(interfacesDir, f)).isDirectory());

            for (const ifName of ifaceDirs) {
                const ifDir = path.join(interfacesDir, ifName);
                const ifMetaPath = path.join(ifDir, 'interface.json');
                const ifMeta = fs.existsSync(ifMetaPath) ? JSON.parse(fs.readFileSync(ifMetaPath, 'utf8')) : { name: ifName };

                const iface: SoapUIInterface = {
                    ...ifMeta,
                    operations: []
                };

                // Operations
                const opDirs = fs.readdirSync(ifDir).filter(f => fs.statSync(path.join(ifDir, f)).isDirectory());
                for (const opNameSafe of opDirs) {
                    const opDir = path.join(ifDir, opNameSafe);
                    const opMetaPath = path.join(opDir, 'operation.json');
                    const opMeta = fs.existsSync(opMetaPath) ? JSON.parse(fs.readFileSync(opMetaPath, 'utf8')) : { name: opNameSafe };

                    const op: SoapUIOperation = {
                        ...opMeta,
                        requests: []
                    };

                    // Requests (Files inside opDir)
                    const files = fs.readdirSync(opDir);
                    // Find pair of .xml and .json
                    // Assuming requestname.xml and requestname.json
                    const requestsMap = new Map<string, any>();

                    files.forEach(f => {
                        if (f === 'operation.json') return;
                        const base = path.basename(f, path.extname(f));
                        const ext = path.extname(f).toLowerCase();

                        if (!requestsMap.has(base)) requestsMap.set(base, {});
                        const entry = requestsMap.get(base);

                        if (ext === '.xml') entry.body = fs.readFileSync(path.join(opDir, f), 'utf8');
                        if (ext === '.json') entry.meta = JSON.parse(fs.readFileSync(path.join(opDir, f), 'utf8'));
                    });

                    for (const [, data] of requestsMap.entries()) {
                        if (data.body !== undefined && data.meta) { // Must have both? Or allow implied?
                            // Merge
                            const req: SoapUIRequest = {
                                ...data.meta,
                                request: data.body
                            };
                            op.requests.push(req);
                        }
                    }

                    iface.operations.push(op);
                }
                project.interfaces.push(iface);
            }
        }

        // Load Tests
        const testsDir = path.join(dirPath, 'tests');
        if (fs.existsSync(testsDir)) {
            const suiteDirs = fs.readdirSync(testsDir).filter(f => fs.statSync(path.join(testsDir, f)).isDirectory());

            for (const suiteNameSafe of suiteDirs) {
                const suiteDir = path.join(testsDir, suiteNameSafe);
                const sMetaPath = path.join(suiteDir, 'suite.json');
                const sMeta = fs.existsSync(sMetaPath) ? JSON.parse(fs.readFileSync(sMetaPath, 'utf8')) : { name: suiteNameSafe, id: `suite-${Math.random().toString(36).substring(2, 9)}-${Date.now()}` };

                const suite: SoapTestSuite = {
                    ...sMeta,
                    testCases: []
                };

                const caseDirs = fs.readdirSync(suiteDir).filter(f => fs.statSync(path.join(suiteDir, f)).isDirectory());
                for (const caseNameSafe of caseDirs) {
                    const caseDir = path.join(suiteDir, caseNameSafe);
                    const cMetaPath = path.join(caseDir, 'case.json');
                    const cMeta = fs.existsSync(cMetaPath) ? JSON.parse(fs.readFileSync(cMetaPath, 'utf8')) : { name: caseNameSafe, id: `tc-${Math.random().toString(36).substring(2, 9)}-${Date.now()}` };

                    const testCase: SoapTestCase = {
                        ...cMeta,
                        steps: []
                    };

                    // Steps
                    const stepFiles = fs.readdirSync(caseDir).filter(f => f.endsWith('.json') && f !== 'case.json');
                    // Sort by index (prefix)
                    stepFiles.sort(); // 01_..., 02_...

                    for (const sf of stepFiles) {
                        const stepData = JSON.parse(fs.readFileSync(path.join(caseDir, sf), 'utf8'));
                        testCase.steps.push(stepData);
                    }

                    suite.testCases.push(testCase);
                }
                if (project.testSuites) {
                    project.testSuites.push(suite);
                }
            }
        }

        return project;
    }

    private sanitizeName(name: string): string {
        return name.replace(/[^a-z0-9\-_]/gi, '_');
    }
}

import * as fs from 'fs';
import * as path from 'path';
import { ApinoxProject, ApiInterface, ApiOperation, ApiRequest, TestSuite, TestCase } from '../shared/src/models';

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
    public async saveProject(project: ApinoxProject, dirPath: string) {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }

        // 1. Save properties.json
        const props = {
            name: project.name,
            description: project.description,
            id: project.id,
            format: "APInox-v1"
        };
        fs.writeFileSync(path.join(dirPath, 'properties.json'), JSON.stringify(props, null, 2));

        // 2. Save Interfaces
        const interfacesDir = path.join(dirPath, 'interfaces');
        if (!fs.existsSync(interfacesDir)) {
            fs.mkdirSync(interfacesDir);
        }

        // Cleanup: Delete orphan interface directories
        const currentInterfaceNames = new Set(project.interfaces.map(iface => this.sanitizeName(iface.name)));
        const existingInterfaceDirs = fs.readdirSync(interfacesDir).filter(f =>
            fs.statSync(path.join(interfacesDir, f)).isDirectory()
        );
        existingInterfaceDirs.forEach(dir => {
            if (!currentInterfaceNames.has(dir)) {
                this.log(`Removing orphaned interface: ${dir}`);
                fs.rmSync(path.join(interfacesDir, dir), { recursive: true });
            }
        });

        for (const iface of project.interfaces) {
            const safeInterfaceName = this.sanitizeName(iface.name);
            const ifaceDir = path.join(interfacesDir, safeInterfaceName);
            if (!fs.existsSync(ifaceDir)) fs.mkdirSync(ifaceDir);

            const ifaceMeta = {
                name: iface.name,
                type: iface.type,
                bindingName: iface.bindingName,
                soapVersion: iface.soapVersion,
                definition: iface.definition // WSDL URL
            };
            fs.writeFileSync(path.join(ifaceDir, 'interface.json'), JSON.stringify(ifaceMeta, null, 2));

            // Cleanup: Delete orphan operation directories
            const currentOpNames = new Set(iface.operations.map(op => this.sanitizeName(op.name)));
            const existingOpDirs = fs.readdirSync(ifaceDir).filter(f =>
                f !== 'interface.json' && fs.statSync(path.join(ifaceDir, f)).isDirectory()
            );
            existingOpDirs.forEach(dir => {
                if (!currentOpNames.has(dir)) {
                    this.log(`Removing orphaned operation: ${dir}`);
                    fs.rmSync(path.join(ifaceDir, dir), { recursive: true });
                }
            });

            // Operations
            // Handle multiple ops with same name? SOAP allows overload? Usually unique by name+input.

            for (const op of iface.operations) {
                const safeOpName = this.sanitizeName(op.name);
                const opDir = path.join(ifaceDir, safeOpName);
                if (!fs.existsSync(opDir)) fs.mkdirSync(opDir);

                // Operations
                const opMeta = {
                    name: op.name,
                    action: op.action,
                    input: op.input, // Save input schema
                    targetNamespace: op.targetNamespace // Save persistence logic
                };
                fs.writeFileSync(path.join(opDir, 'operation.json'), JSON.stringify(opMeta, null, 2));

                // Cleanup: Delete orphan request files (from renamed/deleted requests)
                const currentRequestNames = new Set(op.requests.map(r => this.sanitizeName(r.name)));
                const existingFiles = fs.readdirSync(opDir).filter(f => f !== 'operation.json');
                const existingRequestBases = new Set<string>();
                
                existingFiles.forEach(f => {
                    const ext = path.extname(f).toLowerCase();
                    if (ext === '.xml' || ext === '.json') {
                        const base = path.basename(f, ext);
                        existingRequestBases.add(base);
                    }
                });
                
                existingRequestBases.forEach(base => {
                    if (!currentRequestNames.has(base)) {
                        this.log(`Removing orphaned request files: ${base}`);
                        const xmlFile = path.join(opDir, `${base}.xml`);
                        const jsonFile = path.join(opDir, `${base}.json`);
                        if (fs.existsSync(xmlFile)) fs.unlinkSync(xmlFile);
                        if (fs.existsSync(jsonFile)) fs.unlinkSync(jsonFile);
                    }
                });

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
                        id: req.id,
                        // REST/GraphQL Support - preserve these critical fields
                        requestType: req.requestType,
                        bodyType: req.bodyType,
                        restConfig: req.restConfig,
                        graphqlConfig: req.graphqlConfig,
                        extractors: req.extractors,
                        wsSecurity: req.wsSecurity,
                        attachments: req.attachments
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

        // 4. Save Folders (user-created organizational structure)
        const foldersDir = path.join(dirPath, 'folders');
        if (!fs.existsSync(foldersDir)) fs.mkdirSync(foldersDir);

        // Cleanup: Delete all existing folder files (we'll rewrite)
        if (fs.existsSync(foldersDir)) {
            const existing = fs.readdirSync(foldersDir);
            existing.forEach(f => {
                fs.unlinkSync(path.join(foldersDir, f));
            });
        }

        // Save each top-level folder
        if (project.folders) {
            project.folders.forEach((folder, index) => {
                const indexStr = (index + 1).toString().padStart(2, '0');
                const safeName = this.sanitizeName(folder.name);
                const filename = `${indexStr}_${safeName}.json`;
                fs.writeFileSync(path.join(foldersDir, filename), JSON.stringify(folder, null, 2));
            });
        }

        this.log(`Project saved to folder: ${dirPath}`);
    }

    public async loadProject(dirPath: string): Promise<ApinoxProject> {
        this.log(`Loading project from folder: ${dirPath}`);

        const propsPath = path.join(dirPath, 'properties.json');
        if (!fs.existsSync(propsPath)) {
            throw new Error(`Invalid project folder: properties.json missing in ${dirPath}`);
        }

        const props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));

        const project: ApinoxProject = {
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

                const iface: ApiInterface = {
                    ...ifMeta,
                    operations: []
                };

                // Operations
                const opDirs = fs.readdirSync(ifDir).filter(f => fs.statSync(path.join(ifDir, f)).isDirectory());
                for (const opNameSafe of opDirs) {
                    const opDir = path.join(ifDir, opNameSafe);
                    const opMetaPath = path.join(opDir, 'operation.json');
                    const opMeta = fs.existsSync(opMetaPath) ? JSON.parse(fs.readFileSync(opMetaPath, 'utf8')) : { name: opNameSafe };

                    const op: ApiOperation = {
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
                            const req: ApiRequest = {
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

                const suite: TestSuite = {
                    ...sMeta,
                    testCases: []
                };

                const caseDirs = fs.readdirSync(suiteDir).filter(f => fs.statSync(path.join(suiteDir, f)).isDirectory());
                for (const caseNameSafe of caseDirs) {
                    const caseDir = path.join(suiteDir, caseNameSafe);
                    const cMetaPath = path.join(caseDir, 'case.json');
                    const cMeta = fs.existsSync(cMetaPath) ? JSON.parse(fs.readFileSync(cMetaPath, 'utf8')) : { name: caseNameSafe, id: `tc-${Math.random().toString(36).substring(2, 9)}-${Date.now()}` };

                    const testCase: TestCase = {
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

        // Load Folders
        const foldersDir = path.join(dirPath, 'folders');
        if (fs.existsSync(foldersDir)) {
            const folderFiles = fs.readdirSync(foldersDir).filter(f => f.endsWith('.json'));
            folderFiles.sort(); // 01_..., 02_...

            project.folders = [];
            for (const ff of folderFiles) {
                const folderData = JSON.parse(fs.readFileSync(path.join(foldersDir, ff), 'utf8'));
                project.folders.push(folderData);
            }
        }

        return project;
    }

    private sanitizeName(name: string): string {
        return name.replace(/[^a-z0-9\-_]/gi, '_');
    }
}

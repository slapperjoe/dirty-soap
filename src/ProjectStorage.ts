import * as fs from 'fs';
import * as path from 'path';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import { SoapUIProject } from './models';

export class ProjectStorage {
    private outputChannel: any = null;

    constructor(outputChannel?: any) {
        this.outputChannel = outputChannel;
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
        }
    }

    public async saveProject(project: SoapUIProject, filePath: string) {
        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            format: true
        });

        // Map internal structure to SoapUI XML structure
        const soapUiObj = {
            "con:soapui-project": {
                "@_name": project.name,
                "@_soapui-version": "5.7.0",
                "@_xmlns:con": "http://eviware.com/soapui/config",
                "con:interface": project.interfaces.map(iface => ({
                    "@_name": iface.name,
                    "@_type": iface.type || "wsdl",
                    "@_bindingName": iface.bindingName,
                    "@_soapVersion": iface.soapVersion,
                    "@_definition": iface.definition,
                    "con:operation": iface.operations.map(op => ({
                        "@_isOneWay": "false",
                        "@_action": op.action,
                        "@_name": op.name,
                        "@_bindingOperationName": op.name,
                        "@_type": "Request-Response",
                        "@_inputName": "",
                        "@_receiveAuthProfile": "",
                        "@_sendsAttachments": "false",
                        "@_anonymous": "optional",
                        "con:call": op.requests.map(req => ({
                            "@_name": req.name,
                            "con:request": {
                                "@_mediaType": req.contentType || "text/xml",
                                "@_method": req.method || "POST",
                                "#text": req.request
                            }
                        }))
                    }))
                }))
            }
        };

        const xmlContent = builder.build(soapUiObj);
        fs.writeFileSync(filePath, xmlContent);
        this.log(`Project saved to ${filePath}`);
    }

    public async loadProject(filePath: string): Promise<SoapUIProject> {
        this.log(`Loading project from: ${filePath}`);
        let xmlContent = '';
        try {
            xmlContent = fs.readFileSync(filePath, 'utf8');
        } catch (e: any) {
            this.log(`Failed to read file ${filePath}: ${e.message}`);
            throw e;
        }

        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            isArray: (name, jpath, isLeafNode, isAttribute) => {
                return ["con:interface", "con:operation", "con:call", "con:request"].indexOf(name) !== -1;
            }
        });
        const result = parser.parse(xmlContent);
        const projectRoot = result["con:soapui-project"];

        if (!projectRoot) {
            this.log(`Invalid SoapUI project structure. Root 'con:soapui-project' not found in ${filePath}`);
            // Check what WAS parsed?
            this.log(`Parsed keys: ${Object.keys(result).join(', ')}`);
            throw new Error("Invalid SoapUI project file");
        }

        let name = projectRoot["@_name"];
        // If name looks like a path (contains slashes) or is empty, use filename
        if (!name || name.includes('/') || name.includes('\\')) {
            name = path.basename(filePath, path.extname(filePath));
        }

        const project: SoapUIProject = {
            name: name,
            interfaces: []
        };

        if (projectRoot["con:interface"]) {
            const interfaces = Array.isArray(projectRoot["con:interface"]) ? projectRoot["con:interface"] : [projectRoot["con:interface"]];

            project.interfaces = interfaces.map((iface: any) => ({
                name: iface["@_name"],
                type: iface["@_type"],
                bindingName: iface["@_bindingName"],
                soapVersion: iface["@_soapui-version"],
                definition: iface["@_definition"],
                operations: iface["con:operation"] ? (Array.isArray(iface["con:operation"]) ? iface["con:operation"] : [iface["con:operation"]]).map((op: any) => ({
                    name: op["@_name"],
                    action: op["@_action"],
                    requests: op["con:call"] ? (Array.isArray(op["con:call"]) ? op["con:call"] : [op["con:call"]]).map((req: any) => ({
                        name: req["@_name"],
                        contentType: req["con:request"] && req["con:request"]["@_mediaType"],
                        method: req["con:request"] && req["con:request"]["@_method"],
                        request: (() => {
                            if (!r) return "";
                            let content = "";
                            if (Array.isArray(r)) {
                                content = r[0]["#text"] || r[0];
                            } else if (typeof r === 'object' && r["#text"]) {
                                content = r["#text"];
                            } else if (typeof r === 'string') {
                                content = r;
                            }
                            // Strip \r (and potentially literal '\r' if user sees them as text)
                            return content ? content.replace(/\\r/g, '').replace(/\r/g, '') : "";
                        })()
                    })) : []
                })) : []
            }));
        }

        return project;
    }

    public async saveWorkspace(projects: any[], filePath: string) {
        const workspaceDir = path.dirname(filePath);

        // 1. Ensure all projects are saved
        const projectRefs: { name: string, path: string }[] = [];

        for (const p of projects) {
            let pPath = p.fileName;
            if (!pPath) {
                // Auto-save unsaved projects alongside workspace
                const safeName = p.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
                pPath = path.join(workspaceDir, `${safeName}.xml`);
                await this.saveProject(p, pPath);
            }
            let refPath = path.relative(workspaceDir, pPath);
            projectRefs.push({ name: p.name, path: refPath });
        }

        const builder = new XMLBuilder({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            format: true
        });

        const workspaceObj = {
            "con:soapui-workspace": {
                "@_name": path.basename(filePath, '.xml'),
                "@_soapui-version": "5.7.0",
                "@_xmlns:con": "http://eviware.com/soapui/config",
                "con:project": projectRefs.map(ref => ({
                    "@_ref": ref.path
                }))
            }
        };

        const xmlContent = builder.build(workspaceObj);
        fs.writeFileSync(filePath, xmlContent);
    }

    public async loadWorkspace(filePath: string): Promise<SoapUIProject[]> {
        const xmlContent = fs.readFileSync(filePath, 'utf8');
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
            isArray: (name) => name === "con:project"
        });
        const result = parser.parse(xmlContent);
        const wsRoot = result["con:soapui-workspace"];
        if (!wsRoot) throw new Error("Invalid SoapUI workspace file");

        const projects: SoapUIProject[] = [];
        const workspaceDir = path.dirname(filePath);

        if (wsRoot["con:project"]) {
            const projectRefs = Array.isArray(wsRoot["con:project"]) ? wsRoot["con:project"] : [wsRoot["con:project"]];

            for (const ref of projectRefs) {
                // SoapUI 5.8.0+ style: <con:project name="X">path</con:project> -> path is in #text
                // Older/Other style: <con:project ref="path" /> ? (Unconfirmed, keeps backward compat if possible)
                let refPath = ref["#text"];
                if (!refPath) refPath = ref["@_ref"]; // Fallback or alternative format

                if (!refPath && typeof ref === 'string') {
                    refPath = ref; // Handle case where it might be just a string without attributes
                }

                if (!refPath) {
                    this.log(`Skipping project reference: Unable to determine path from ${JSON.stringify(ref)}`);
                    continue;
                }

                const projectPath = path.resolve(workspaceDir, refPath);

                if (fs.existsSync(projectPath)) {
                    try {
                        const project = await this.loadProject(projectPath);
                        (project as any).fileName = projectPath;
                        projects.push(project);
                    } catch (e: any) {
                        this.log(`Error loading project from ${projectPath}: ${e.message}`);
                        if (e.stack) this.log(e.stack);
                    }
                }
            }
        }
        return projects;
    }
}

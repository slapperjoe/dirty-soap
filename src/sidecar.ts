import { SoapClient } from './soapClient';

// Mock Output Channel
class ConsoleOutputChannel {
    appendLine(value: string) {
        // We might want to forward logs to frontend?
        // For now, log to stderr so it doesn't pollute stdout (which is for responses)
        console.error(`[LOG] ${value}`);
    }
}

const soapClient = new SoapClient(new ConsoleOutputChannel());

// Simple JSON-Line Protocol
// Input: {"id": 1, "command": "parseWsdl", "args": ["url..."]}
// Output: {"id": 1, "result": ...} or {"id": 1, "error": ...}

process.stdin.setEncoding('utf8');

let buffer = '';

process.stdin.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
        if (line.trim()) {
            handleRequest(line);
        }
    }
});

async function handleRequest(line: string) {
    let req: any;
    try {
        req = JSON.parse(line);
    } catch (e) {
        console.error("Failed to parse request JSON", line);
        return;
    }

    const { command } = req;

    try {
        switch (command) {
            case 'parseWsdl':
            case 'loadWsdl':
                // payload: { url }
                if (req.url) {
                    const services = await soapClient.parseWsdl(req.url);
                    // If it was loadWsdl, we might want to behave same as parseWsdl
                    // The App expects 'wsdlParsed' response for both?
                    // App.tsx: case 'wsdlParsed'.
                    send({ command: 'wsdlParsed', services });
                }
                break;
            case 'executeRequest':
                // payload: { url, operation, xml }
                if (req.url && req.operation && req.xml) {
                    // SoapClient.executeRequest expects (url, operation, xml)
                    // Does it return the full result object?
                    const result = await soapClient.executeRequest(req.url, req.operation, req.xml);
                    send({ command: 'response', result });
                }
                break;
            case 'getSampleSchema':
                // payload: { operationName }
                if (req.operationName) {
                    const schema = soapClient.getOperationSchema(req.operationName);
                    send({ command: 'sampleSchema', schema, operationName: req.operationName });
                }
                break;
            case 'downloadWsdl':
                // payload: { url }
                // Implement basic download
                if (req.url) {
                    const fs = require('fs');
                    const path = require('path');
                    const os = require('os');
                    const axios = require('axios');

                    const tmpDir = os.tmpdir();
                    const filename = `wsdl_${Date.now()}.wsdl`;
                    const filePath = path.join(tmpDir, filename);

                    const response = await axios.get(req.url);
                    fs.writeFileSync(filePath, typeof response.data === 'string' ? response.data : JSON.stringify(response.data));

                    send({ command: 'downloadComplete', files: [filePath] });
                    // Also auto-select? App.tsx handles downloadComplete.
                }
                break;
            case 'cancelRequest':
                // Not implemented in SoapClient yet?
                break;
            case 'echo':
                send({ command: 'echoResponse', message: req.message });
                break;
            case 'saveWorkspace':
                // { path, projects }
                if (req.path && req.projects) {
                    require('fs').writeFileSync(req.path, JSON.stringify({ projects: req.projects }, null, 2));
                    // No specific response needed? Or confirmation?
                }
                break;
            case 'openWorkspace':
                // { path }
                if (req.path) {
                    const content = require('fs').readFileSync(req.path, 'utf8');
                    const data = JSON.parse(content);
                    send({ command: 'workspaceLoaded', projects: data.projects });
                }
                break;
            case 'saveProject':
                // { path, project }
                if (req.path && req.project) {
                    require('fs').writeFileSync(req.path, JSON.stringify(req.project, null, 2));
                }
                break;
            case 'loadProject':
                // { path }
                if (req.path) {
                    const content = require('fs').readFileSync(req.path, 'utf8');
                    const project = JSON.parse(content);
                    send({ command: 'projectLoaded', project, filename: req.path }); // naming logic might use filename
                }
                break;
            default:
                console.error(`Unknown command: ${command}`);
        }

    } catch (error: any) {
        send({ command: 'error', message: error.message || String(error) });
    }
}

function send(msg: any) {
    console.log(JSON.stringify(msg));
}

console.error("Sidecar started. Waiting for input...");


import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class GetLocalWsdlsCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient,
        private readonly _storagePath: string
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            // Legacy priority: Workspace folder 'wsdl_files' > Extension storage 'wsdl_files'
            // But usually we just check one or merge?
            // Logic in controller was: If workspace, use workspace/wsdl_files, else extension/wsdl_files.

            let wsdlDir = '';
            // We should stick to extension storage for "Managed WSDLs" by DirtySoap?
            // Or allow project-specific?
            // Controller logic:
            if (workspaceFolders) {
                wsdlDir = path.join(workspaceFolders[0].uri.fsPath, 'wsdl_files');
            } else {
                wsdlDir = path.join(this._storagePath, 'wsdl_files');
            }

            if (fs.existsSync(wsdlDir)) {
                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                this._panel.webview.postMessage({ command: 'localWsdls', files });
            } else {
                this._panel.webview.postMessage({ command: 'localWsdls', files: [] });
            }
        } catch (error: any) {
            this._soapClient.log(`Error listing local WSDLs: ${error.message}`);
        }
    }
}

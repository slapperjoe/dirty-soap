
import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import { LoadWsdlCommand } from './LoadWsdlCommand';
import * as vscode from 'vscode';

export class SelectLocalWsdlCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient
    ) { }

    async execute(_message: any): Promise<void> {
        const uris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            filters: { 'WSDL Files': ['wsdl', 'xml'] }
        });

        if (uris && uris.length > 0) {
            // Delegate to LoadWsdlCommand
            const loadCmd = new LoadWsdlCommand(this._panel, this._soapClient);
            await loadCmd.execute({ path: uris[0].fsPath });
        }
    }
}

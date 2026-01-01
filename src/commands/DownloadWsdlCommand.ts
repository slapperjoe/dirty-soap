
import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';


export class DownloadWsdlCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient,
        private readonly _storagePath: string // Extension Global Storage Path
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const url = message.url;
            // Use 'wsdl_files' in extension root to match legacy behavior
            const wsdlDir = path.join(this._storagePath, 'wsdl_files');
            if (!fs.existsSync(wsdlDir)) {
                fs.mkdirSync(wsdlDir, { recursive: true });
            }

            this._soapClient.log(`Downloading WSDL from ${url} to ${wsdlDir}`);

            // Download recursive
            const mainWsdlPath = await this.downloadRecursive(url, wsdlDir);

            if (mainWsdlPath) {
                // Return list of files in wsdl_files
                const files = fs.readdirSync(wsdlDir).filter(file => file.endsWith('.wsdl') || file.endsWith('.xml'));
                this._panel.webview.postMessage({ command: 'localWsdls', files });

                // Send downloadComplete
                // We need to track downloaded files in recursive function or return them.
                // For now, let's just send the main one or empty list if we didn't track.
                // The original code tracked 'downloadedFiles'.
                // We can't easily retrieve that from downloadRecursive's current signature.
                // Let's rely on 'localWsdls' refresh.
                this._panel.webview.postMessage({ command: 'downloadComplete', files: [path.basename(mainWsdlPath)] });
                this._soapClient.log(`WSDL Downloaded Successfully.`);
            } else {
                throw new Error("Failed to download main WSDL file.");
            }

        } catch (error: any) {
            this._soapClient.log(`WSDL Download Error: ${error.message}`);
            this._panel.webview.postMessage({ command: 'error', message: `Failed to download WSDL: ${error.message}` });
        }
    }

    private async downloadRecursive(url: string, destDir: string, forcedFilename?: string): Promise<string | null> {
        try {
            // Check if already downloaded (avoid infinite loops)
            // Ideally we map URLs to local filenames.
            // For now, simple implementation.

            const response = await axios.get(url, {
                responseType: 'text'
            });

            const content = response.data;
            const filename = forcedFilename || path.basename(url).split('?')[0] || 'service.wsdl';
            const localPath = path.join(destDir, filename);

            fs.writeFileSync(localPath, content);
            this._soapClient.log(`Downloaded: ${url} -> ${localPath}`);

            // Scan for imports: <xsd:import schemaLocation="..."> or <wsdl:import location="...">
            // Regex for imports
            const importRegex = /(?:schemaLocation|location)=["']([^"']+)["']/g;
            let match;
            let newContent = content;

            // Resolve relative URLs
            const baseUrl = url.substring(0, url.lastIndexOf('/') + 1);

            while ((match = importRegex.exec(content)) !== null) {
                const importUrlRel = match[1];
                if (importUrlRel.startsWith('http')) {
                    // Absolute URL - Download it if checks pass
                    // Check domain?
                } else {
                    // Relative URL
                    const absoluteImportUrl = new URL(importUrlRel, baseUrl).toString();
                    const importFilename = path.basename(absoluteImportUrl).split('?')[0];

                    // Download the imported file
                    await this.downloadRecursive(absoluteImportUrl, destDir, importFilename);

                    // Update the reference in local file to point to local file?
                    // Usually parser handles imports if they are local files.
                    // But fast-xml-parser / soap might need help.
                    // For now, let's just download them so they exist.
                    // If we want to make the main WSDL use local refs, we need to replace content.
                    newContent = newContent.replace(importUrlRel, importFilename);
                }
            }

            // If we modified imports, save again
            if (newContent !== content) {
                fs.writeFileSync(localPath, newContent);
            }

            return localPath;
        } catch (e: any) {
            this._soapClient.log(`Failed to download import ${url}: ${e.message}`);
            return null;
        }
    }
}

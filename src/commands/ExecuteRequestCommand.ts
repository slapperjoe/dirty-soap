
import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import { SettingsManager } from '../utils/SettingsManager';
import { WildcardProcessor } from '../utils/WildcardProcessor';
import { AssertionRunner } from '../utils/AssertionRunner';
import * as vscode from 'vscode';

export class ExecuteRequestCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        try {
            const config = this._settingsManager.getConfig();
            const activeEnvName = config.activeEnvironment || 'Build';
            const activeEnv = config.environments ? config.environments[activeEnvName] : {};

            const envVars = activeEnv as Record<string, string>;
            const globals = config.globals as Record<string, string> || {};
            const scriptsDir = this._settingsManager.scriptsDir;

            const contextVars = message.contextVariables || {};
            const processedUrl = WildcardProcessor.process(message.url, envVars, globals, scriptsDir, contextVars);
            const processedXml = WildcardProcessor.process(message.xml, envVars, globals, scriptsDir, contextVars);

            this._soapClient.log('--- Executing Request ---');
            this._soapClient.log('Original URL:', message.url);
            this._soapClient.log('Substituted URL:', processedUrl);
            this._soapClient.log('Substituted Payload:', processedXml);
            this._soapClient.log('-----------------------');

            // Process Headers
            let headers = message.headers || {};
            // Apply wildcards to headers
            if (headers) {
                const processedHeaders: Record<string, string> = {};
                for (const key in headers) {
                    if (headers.hasOwnProperty(key)) {
                        processedHeaders[key] = WildcardProcessor.process(headers[key], envVars, globals, scriptsDir, contextVars);
                    }
                }
                headers = processedHeaders;
            }

            // Merge Content-Type
            if (message.contentType) {
                headers['Content-Type'] = message.contentType;
            }
            if (Object.keys(headers).length === 0) headers = undefined;

            const startTime = Date.now();
            const result = await this._soapClient.executeRequest(processedUrl, message.operation, processedXml, headers);
            const timeTaken = Date.now() - startTime;

            // Run Assertions
            let assertionResults: any[] = [];
            if (message.assertions && Array.isArray(message.assertions)) {
                assertionResults = AssertionRunner.run(typeof result === 'string' ? result : JSON.stringify(result), timeTaken, message.assertions);
                if (assertionResults.length > 0) {
                    this._soapClient.log(`Assertion Results:`);
                    assertionResults.forEach(r => {
                        this._soapClient.log(`  [${r.status}] ${r.name}: ${r.message || ''}`);
                    });
                }
            }

            this._panel.webview.postMessage({ command: 'response', result, assertionResults, timeTaken });
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._soapClient.log(`Request Execution Error: ${errorMessage}`);
            if (error.stack) this._soapClient.log(error.stack);
            this._panel.webview.postMessage({ command: 'error', message: errorMessage });
        }
    }
}


import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import { SettingsManager } from '../utils/SettingsManager';
import { WildcardProcessor } from '../utils/WildcardProcessor';
import { AssertionRunner } from '../utils/AssertionRunner';
import { RequestHistoryService } from '../services/RequestHistoryService';
import { RequestHistoryEntry } from '../models';
import * as vscode from 'vscode';

export class ExecuteRequestCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _soapClient: SoapClient,
        private readonly _settingsManager: SettingsManager,
        private readonly _historyService?: RequestHistoryService
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
                    if (Object.prototype.hasOwnProperty.call(headers, key)) {
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

            // Capture to history if this is a manual request (not from test run)
            if (this._historyService && !message.isTestRun) {
                try {
                    const historyEntry: RequestHistoryEntry = {
                        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: startTime,
                        projectName: message.projectName || 'Unknown',
                        projectId: message.projectId,
                        interfaceName: message.interfaceName || 'Unknown',
                        operationName: message.operation || 'Unknown',
                        requestName: message.requestName || 'Manual Request',
                        endpoint: processedUrl,
                        requestBody: processedXml,
                        headers: headers || {},
                        statusCode: 200, // Assume success if we got here
                        duration: timeTaken,
                        responseSize: typeof result === 'string' ? result.length : JSON.stringify(result).length,
                        success: true,
                        starred: false
                    };
                    this._historyService.addEntry(historyEntry);

                    // Notify frontend of history update
                    this._panel.webview.postMessage({
                        command: 'historyUpdate',
                        entry: historyEntry
                    });
                } catch (histErr) {
                    console.error('Failed to save to history:', histErr);
                }
            }
        } catch (error: any) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this._soapClient.log(`Request Execution Error: ${errorMessage}`);
            if (error.stack) this._soapClient.log(error.stack);
            this._panel.webview.postMessage({ command: 'error', message: errorMessage });

            // Capture failed requests to history too
            if (this._historyService && !message.isTestRun) {
                try {
                    const historyEntry: RequestHistoryEntry = {
                        id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                        timestamp: Date.now(),
                        projectName: message.projectName || 'Unknown',
                        projectId: message.projectId,
                        interfaceName: message.interfaceName || 'Unknown',
                        operationName: message.operation || 'Unknown',
                        requestName: message.requestName || 'Manual Request',
                        endpoint: message.url,
                        requestBody: message.xml,
                        headers: message.headers || {},
                        success: false,
                        error: errorMessage,
                        starred: false
                    };
                    this._historyService.addEntry(historyEntry);

                    this._panel.webview.postMessage({
                        command: 'historyUpdate',
                        entry: historyEntry
                    });
                } catch (histErr) {
                    console.error('Failed to save error to history:', histErr);
                }
            }
        }
    }
}

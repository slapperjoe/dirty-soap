
import { ICommand } from './ICommand';
import { SoapClient } from '../soapClient';
import { SettingsManager } from '../utils/SettingsManager';
import { WildcardProcessor } from '../utils/WildcardProcessor';
import { AssertionRunner } from '../utils/AssertionRunner';
import { WSSecurityUtil } from '../utils/WSSecurityUtil';
import { AttachmentUtil } from '../utils/AttachmentUtil';
import { RequestHistoryService } from '../services/RequestHistoryService';
import { RequestHistoryEntry, WSSecurityConfig, WSSecurityType, SoapAttachment } from '@shared/models';
import * as vscode from 'vscode';
import * as fs from 'fs';

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
            let processedXml = WildcardProcessor.process(message.xml, envVars, globals, scriptsDir, contextVars);

            // Apply WS-Security if configured
            const wsSecurity = message.wsSecurity as WSSecurityConfig | undefined;
            if (wsSecurity && wsSecurity.type !== WSSecurityType.None) {
                // Process any environment variables in credentials and paths
                const processedWsSecurity: WSSecurityConfig = {
                    ...wsSecurity,
                    username: wsSecurity.username ? WildcardProcessor.process(wsSecurity.username, envVars, globals, scriptsDir, contextVars) : undefined,
                    password: wsSecurity.password ? WildcardProcessor.process(wsSecurity.password, envVars, globals, scriptsDir, contextVars) : undefined,
                    privateKeyPath: wsSecurity.privateKeyPath ? WildcardProcessor.process(wsSecurity.privateKeyPath, envVars, globals, scriptsDir, contextVars) : undefined,
                    publicCertPath: wsSecurity.publicCertPath ? WildcardProcessor.process(wsSecurity.publicCertPath, envVars, globals, scriptsDir, contextVars) : undefined
                };

                if (wsSecurity.type === WSSecurityType.UsernameToken) {
                    processedXml = WSSecurityUtil.applyToRequest(processedXml, processedWsSecurity);
                    this._soapClient.log('WS-Security (UsernameToken) applied');
                } else if (wsSecurity.type === WSSecurityType.Certificate) {
                    // Read certificate files
                    if (!processedWsSecurity.privateKeyPath || !processedWsSecurity.publicCertPath) {
                        throw new Error('Certificate authentication requires both private key and public certificate paths');
                    }

                    const privateKey = fs.readFileSync(processedWsSecurity.privateKeyPath, 'utf8');
                    const publicCert = fs.readFileSync(processedWsSecurity.publicCertPath, 'utf8');

                    processedXml = WSSecurityUtil.applyCertificateToRequest(processedXml, {
                        privateKey,
                        publicCert,
                        password: processedWsSecurity.password
                    });
                    this._soapClient.log('WS-Security (Certificate) applied');
                }
            }

            // Process Attachments
            const attachments = message.attachments as SoapAttachment[] | undefined;
            let formData: any = null;
            let isMultipart = false;

            if (attachments && attachments.length > 0) {
                // First, inline Base64 attachments
                processedXml = AttachmentUtil.inlineBase64Attachments(processedXml, attachments);
                this._soapClient.log(`Base64 attachments inlined`);

                // Check if we need multipart for SwA/MTOM
                if (AttachmentUtil.hasMultipartAttachments(attachments)) {
                    const result = AttachmentUtil.processAttachments(processedXml, attachments);
                    processedXml = result.xml;
                    formData = result.formData;
                    isMultipart = result.isMultipart;
                    this._soapClient.log(`SwA multipart request prepared with ${attachments.filter(a => a.type === 'SwA' || a.type === 'MTOM').length} attachment(s)`);
                }
            }

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

            // Merge Content-Type (only for non-multipart)
            if (message.contentType && !isMultipart) {
                headers['Content-Type'] = message.contentType;
            }
            if (Object.keys(headers).length === 0) headers = undefined;

            const startTime = Date.now();
            let result;

            if (isMultipart && formData) {
                // Use multipart request for SwA attachments
                result = await this._soapClient.executeMultipartRequest(processedUrl, message.operation, processedXml, formData, headers);
            } else {
                // Standard request
                result = await this._soapClient.executeRequest(processedUrl, message.operation, processedXml, headers);
            }
            const timeTaken = Date.now() - startTime;

            // Run Assertions
            let assertionResults: any[] = [];
            if (message.assertions && Array.isArray(message.assertions)) {
                const statusCode = result?.status;
                assertionResults = AssertionRunner.run(typeof result === 'string' ? result : (result?.rawResponse || JSON.stringify(result)), timeTaken, message.assertions, statusCode);
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

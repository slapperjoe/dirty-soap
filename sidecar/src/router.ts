/**
 * Command Router - Routes frontend commands to appropriate service methods
 * 
 * Maps FrontendCommand enum values from shared/src/messages.ts
 * to the appropriate service method calls.
 */

import { FrontendCommand } from '../../shared/src/messages';
import { RequestHistoryEntry } from '../../shared/src/models';
import { ServiceContainer } from './services';
import { SAMPLES_PROJECT } from './data/DefaultSamples';

export interface CommandRouter {
    handle(command: string, payload: any): Promise<any>;
}

export function createCommandRouter(services: ServiceContainer): CommandRouter {
    const testRunStore = new Map<string, { updates: any[]; done: boolean; error?: string }>();
    const performanceRunStore = new Map<string, { updates: any[]; done: boolean; error?: string; run?: any }>();
    const handlers: Record<string, (payload: any) => Promise<any>> = {
        // ===== WSDL/SOAP Operations =====
        [FrontendCommand.LoadWsdl]: async (payload) => {
            const { url, localWsdlDir } = payload;
            
            // Detection logic: Check if it's OpenAPI/Swagger by file extension
            const isJson = url.toLowerCase().endsWith('.json') || 
                          url.toLowerCase().endsWith('.yaml') || 
                          url.toLowerCase().endsWith('.yml');
            
            if (isJson) {
                services.soapClient.log('Detected OpenAPI/Swagger format (JSON/YAML)...');
                const { OpenApiParser } = require('../../src/OpenApiParser');
                const parser = new OpenApiParser(services.soapClient.getOutputChannel());
                return await parser.parse(url);
            } else {
                // Fallback to WSDL
                services.soapClient.log('Using WSDL parser...');
                return await services.soapClient.parseWsdl(url, localWsdlDir);
            }
        },

        [FrontendCommand.ExecuteRequest]: async (payload) => {
            // Frontend sends: url, operation, xml, headers, contentType, etc.
            // Accept both naming conventions
            const startTime = Date.now();
            let endpoint = payload.endpoint || payload.url;
            const operation = payload.operation;
            let args = payload.args || payload.xml;
            const headers = payload.headers || {};
            const requestType = payload.requestType || 'soap';

            // Apply content type if provided
            if (payload.contentType && !headers['Content-Type']) {
                headers['Content-Type'] = payload.contentType;
            }

            // Resolve environment variables (including secrets) before execution
            const environmentName = payload.environment || services.settingsManager.getActiveEnvironment();
            let envVars: Record<string, string> = {};
            if (environmentName) {
                try {
                    envVars = await services.settingsManager.getResolvedEnvironment(environmentName);
                } catch (err: any) {
                    console.error(`[Router] Failed to resolve environment '${environmentName}':`, err);
                }
            }

            const globalVars = services.settingsManager.getGlobalVariables() || {};
            const contextVars = payload.contextVariables || {};

            // Process wildcards in request body and endpoint
            if (args && typeof args === 'string') {
                const WildcardProcessor = await import('../../src/utils/WildcardProcessor').then(m => m.WildcardProcessor);
                args = WildcardProcessor.process(args, envVars, globalVars, undefined, contextVars);
            }
            if (endpoint) {
                const WildcardProcessor = await import('../../src/utils/WildcardProcessor').then(m => m.WildcardProcessor);
                endpoint = WildcardProcessor.process(endpoint, envVars, globalVars, undefined, contextVars);
            }

            try {
                let result: any;

                if (requestType !== 'soap') {
                    result = await services.soapClient.executeHttpRequest({
                        id: payload.requestId,
                        name: payload.requestName || operation || 'Request',
                        endpoint,
                        method: payload.method,
                        requestType,
                        bodyType: payload.bodyType,
                        contentType: payload.contentType,
                        headers,
                        request: args,
                        restConfig: payload.restConfig,
                        graphqlConfig: payload.graphqlConfig
                    } as any);
                } else {
                    result = await services.soapClient.executeRequest(endpoint, operation, args, headers);
                }

                let historyEntry: RequestHistoryEntry | null = null;
                if (services.historyService && !payload.isTestRun) {
                    try {
                        const responsePayload = result?.rawResponse ?? result?.result ?? result;
                        const responseSize = typeof responsePayload === 'string'
                            ? responsePayload.length
                            : JSON.stringify(responsePayload ?? '').length;
                        historyEntry = {
                            id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: startTime,
                            projectName: payload.projectName || 'Unknown',
                            projectId: payload.projectId,
                            interfaceName: payload.interfaceName || 'Unknown',
                            operationName: operation || 'Unknown',
                            requestName: payload.requestName || 'Manual Request',
                            endpoint,
                            requestBody: args,
                            headers: headers || {},
                            statusCode: result?.status ?? 200,
                            duration: Date.now() - startTime,
                            responseSize,
                            responseBody: typeof responsePayload === 'string' ? responsePayload : JSON.stringify(responsePayload ?? ''),
                            responseHeaders: result?.headers,
                            success: result?.success,
                            starred: false,
                        };
                        services.historyService.addEntry(historyEntry);
                    } catch (histErr) {
                        console.error('Failed to save to history:', histErr);
                    }
                }

                return { response: result, historyEntry };
            } catch (error: any) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                let historyEntry: RequestHistoryEntry | null = null;
                if (services.historyService && !payload.isTestRun) {
                    try {
                        historyEntry = {
                            id: `hist-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            timestamp: Date.now(),
                            projectName: payload.projectName || 'Unknown',
                            projectId: payload.projectId,
                            interfaceName: payload.interfaceName || 'Unknown',
                            operationName: operation || 'Unknown',
                            requestName: payload.requestName || 'Manual Request',
                            endpoint,
                            requestBody: args,
                            headers: headers || {},
                            success: false,
                            error: errorMessage,
                            starred: false,
                        };
                        services.historyService.addEntry(historyEntry);
                    } catch (histErr) {
                        console.error('Failed to save error to history:', histErr);
                    }
                }

                return { response: null, historyEntry, error: errorMessage };
            }
        },

        [FrontendCommand.CancelRequest]: async () => {
            services.soapClient.cancelRequest();
            return { cancelled: true };
        },

        [FrontendCommand.GetSampleSchema]: async (payload) => {
            const { operationName, portName } = payload;
            return services.soapClient.getOperationSchema(operationName, portName);
        },

        // ===== Project Storage =====
        [FrontendCommand.SaveProject]: async (payload) => {
            // Accept both 'filePath' and 'path' from frontend
            const filePath = payload.filePath || payload.path || payload?.project?.fileName;
            const { project } = payload;
            if (!filePath) {
                // If no path, this is a new project that needs "Save As" dialog
                // In Tauri standalone, we can't prompt - return error
                throw new Error('No file path provided. Please use "Save Project As" first.');
            }
            await services.folderStorage.saveProject(project, filePath);
            return {
                saved: true,
                path: filePath,
                // CRITICAL: Return these so frontend updates the project state
                projectName: project.name,
                fileName: filePath
            };
        },

        [FrontendCommand.LoadProject]: async (payload) => {
            // Accept both 'filePath' and 'path' from frontend
            const filePath = payload.filePath || payload.path;
            if (!filePath) {
                throw new Error('No file path provided');
            }
            const project = await services.folderStorage.loadProject(filePath);
            return { project, filename: filePath };
        },

        [FrontendCommand.SyncProjects]: async (payload) => {
            // Save all projects to their respective folders
            const { projects } = payload;
            const results = [];
            for (const project of projects || []) {
                if (project.fileName) {
                    try {
                        await services.folderStorage.saveProject(project, project.fileName);
                        results.push({ id: project.id, saved: true });
                    } catch (e: any) {
                        results.push({ id: project.id, saved: false, error: e.message });
                    }
                }
            }
            return { synced: true, results };
        },

        [FrontendCommand.CloseProject]: async (payload) => {
            // Just acknowledge - UI handles removing from state
            console.log('[Sidecar] Close project:', payload.projectId);
            return { closed: true };
        },

        // ===== Proxy Service =====
        [FrontendCommand.StartProxy]: async (payload) => {
            if (payload?.config) {
                // Map 'target' to 'targetUrl' for ProxyService
                const configData = payload.config;
                const proxyConfig = configData.target 
                    ? { ...configData, targetUrl: configData.target } 
                    : configData;
                services.proxyService.updateConfig(proxyConfig);
            }
            await services.proxyService.start();
            return { started: true, port: services.proxyService.getConfig().port };
        },

        [FrontendCommand.StopProxy]: async () => {
            services.proxyService.stop();
            return { stopped: true };
        },

        [FrontendCommand.UpdateProxyConfig]: async (payload) => {
            // Payload comes as { config: { port, target, ... } }
            const configData = payload.config || payload;
            
            // Map 'target' to 'targetUrl' for ProxyService
            const proxyConfig = configData.target 
                ? { ...configData, targetUrl: configData.target } 
                : configData;
            
            services.proxyService.updateConfig(proxyConfig);
            
            // Persist target URL to settings
            const targetUrl = proxyConfig.targetUrl || configData.target;
            if (targetUrl) {
                services.settingsManager.updateLastProxyTarget(targetUrl);
            }
            
            return { updated: true };
        },

        [FrontendCommand.ResolveBreakpoint]: async (payload) => {
            const { breakpointId, content, cancelled } = payload;
            services.proxyService.resolveBreakpoint(breakpointId, content, cancelled);
            return { resolved: true };
        },

        [FrontendCommand.SetServerMode]: async (payload) => {
            services.proxyService.setServerMode(payload.mode);
            return { set: true };
        },

        [FrontendCommand.OpenCertificate]: async () => {
            console.log('[Router] OpenCertificate command received');
            try {
                console.log('[Router] Calling prepareCert...');
                // Generate certificate if it doesn't exist
                await services.proxyService.prepareCert();
                console.log('[Router] prepareCert completed');
                
                const certPath = services.proxyService.getCertPath();
                console.log('[Router] certPath:', certPath);
                
                if (!certPath) {
                    console.error('[Router] certPath is null/undefined');
                    return { 
                        success: false, 
                        error: 'Failed to generate certificate - no path returned.' 
                    };
                }
                
                const result = { 
                    success: true, 
                    certPath,
                    instructions: "To trust this proxy for HTTPS interception:\n\n" +
                        "Windows: Double-click the certificate → Install Certificate → Local Machine → " +
                        "Place in 'Trusted Root Certification Authorities'\n\n" +
                        "macOS: Open Keychain Access → File → Import Items → Select certificate → " +
                        "Set to 'Always Trust'\n\n" +
                        "Linux: Copy to /usr/local/share/ca-certificates/ and run 'sudo update-ca-certificates'"
                };
                console.log('[Router] Returning success result:', result);
                return result;
            } catch (error: any) {
                console.error('[Router] Error in OpenCertificate:', error);
                return {
                    success: false,
                    error: `Failed to generate certificate: ${error.message || error}`
                };
            }
        },

        // ===== Mock Service =====
        [FrontendCommand.StartMockServer]: async (payload) => {
            if (payload?.config) {
                services.mockService.updateConfig(payload.config);
            }
            await services.mockService.start();
            return { started: true, port: services.mockService.getConfig().port };
        },

        [FrontendCommand.StopMockServer]: async () => {
            services.mockService.stop();
            return { stopped: true };
        },

        [FrontendCommand.UpdateMockConfig]: async (payload) => {
            services.mockService.updateConfig(payload);
            return { updated: true };
        },

        [FrontendCommand.UpdateMockRules]: async (payload) => {
            services.mockService.setRules(payload.rules || []);
            return { set: true };
        },

        [FrontendCommand.AddMockRule]: async (payload) => {
            services.mockService.addRule(payload.rule);
            return { added: true };
        },

        [FrontendCommand.DeleteMockRule]: async (payload) => {
            services.mockService.removeRule(payload.id);
            return { removed: true };
        },

        [FrontendCommand.ToggleMockRule]: async (payload) => {
            // Toggle via updateRule with enabled toggled
            const rules = services.mockService.getRules();
            const rule = rules.find(r => r.id === payload.id);
            if (rule) {
                services.mockService.updateRule(payload.id, { enabled: !rule.enabled });
            }
            return { toggled: true };
        },

        [FrontendCommand.GetMockStatus]: async () => {
            return {
                running: services.mockService.isActive(),
                config: services.mockService.getConfig(),
                rules: services.mockService.getRules()
            };
        },

        // ===== Test Runner =====
        [FrontendCommand.RunTestCase]: async (payload) => {
            const { testCase, fallbackEndpoint } = payload;
            if (payload?.stream) {
                const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const run = { updates: [], done: false } as { updates: any[]; done: boolean; error?: string };
                testRunStore.set(runId, run);
                services.testRunnerService.setCallback((data) => run.updates.push(data));
                (async () => {
                    try {
                        await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
                    } catch (error: any) {
                        run.error = error?.message || String(error);
                    } finally {
                        run.done = true;
                        services.testRunnerService.setCallback(() => { });
                    }
                })();
                return { runId };
            }

            const updates: any[] = [];
            services.testRunnerService.setCallback((data) => updates.push(data));
            await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
            services.testRunnerService.setCallback(() => { });
            return { updates };
        },

        [FrontendCommand.RunTestSuite]: async (payload) => {
            // TestRunnerService doesn't have runTestSuite, needs to iterate
            const { testSuite, fallbackEndpoint } = payload;
            if (payload?.stream) {
                const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const run = { updates: [], done: false } as { updates: any[]; done: boolean; error?: string };
                testRunStore.set(runId, run);
                services.testRunnerService.setCallback((data) => run.updates.push(data));
                (async () => {
                    try {
                        for (const testCase of testSuite.testCases || []) {
                            await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
                        }
                    } catch (error: any) {
                        run.error = error?.message || String(error);
                    } finally {
                        run.done = true;
                        services.testRunnerService.setCallback(() => { });
                    }
                })();
                return { runId };
            }

            const results = [];
            const updates: any[] = [];
            services.testRunnerService.setCallback((data) => updates.push(data));
            for (const testCase of testSuite.testCases || []) {
                const result = await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
                results.push(result);
            }
            services.testRunnerService.setCallback(() => { });
            return { results, updates };
        },

        [FrontendCommand.GetTestRunUpdates]: async (payload) => {
            const runId = payload?.runId;
            const fromIndex = typeof payload?.fromIndex === 'number' ? payload.fromIndex : 0;
            if (!runId) return { updates: [], nextIndex: fromIndex, done: true, error: 'Missing runId' };

            const run = testRunStore.get(runId);
            if (!run) return { updates: [], nextIndex: fromIndex, done: true, error: 'Run not found' };

            const safeIndex = Math.max(0, fromIndex);
            const updates = run.updates.slice(safeIndex);
            const nextIndex = safeIndex + updates.length;
            const done = run.done;
            const error = run.error;

            if (done && nextIndex >= run.updates.length) {
                testRunStore.delete(runId);
            }

            return { updates, nextIndex, done, error };
        },

        // ===== Performance Testing =====
        [FrontendCommand.RunPerformanceSuite]: async (payload) => {
            const { suiteId, environment, variables } = payload;
            if (payload?.stream) {
                const runId = `perf-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
                const runState = { updates: [], done: false } as { updates: any[]; done: boolean; error?: string; run?: any };
                performanceRunStore.set(runId, runState);

                const onRunStarted = (data: any) => {
                    runState.updates.push({ type: 'runStarted', runId: data.runId, suiteId: data.suiteId, suiteName: data.suiteName });
                };
                const onIterationComplete = (data: any) => {
                    runState.updates.push({ type: 'iterationComplete', runId: data.runId, iteration: data.iteration, total: data.total });
                };
                const onRunCompleted = (run: any) => {
                    runState.run = run;
                    runState.updates.push({ type: 'runCompleted', run });
                    runState.done = true;
                    services.performanceService.off('runStarted', onRunStarted);
                    services.performanceService.off('iterationComplete', onIterationComplete);
                    services.performanceService.off('runCompleted', onRunCompleted);
                };

                services.performanceService.on('runStarted', onRunStarted);
                services.performanceService.on('iterationComplete', onIterationComplete);
                services.performanceService.on('runCompleted', onRunCompleted);

                (async () => {
                    try {
                        await services.performanceService.runSuite(suiteId, environment, variables);
                        services.settingsManager.updatePerformanceHistory(services.performanceService.getHistory());
                    } catch (error: any) {
                        runState.error = error?.message || String(error);
                        runState.done = true;
                        services.performanceService.off('runStarted', onRunStarted);
                        services.performanceService.off('iterationComplete', onIterationComplete);
                        services.performanceService.off('runCompleted', onRunCompleted);
                    }
                })();

                return { runId };
            }

            const result = await services.performanceService.runSuite(suiteId, environment, variables);
            services.settingsManager.updatePerformanceHistory(services.performanceService.getHistory());
            return result;
        },

        [FrontendCommand.AbortPerformanceSuite]: async () => {
            services.performanceService.abort();
            return { stopped: true };
        },

        [FrontendCommand.GetPerformanceHistory]: async (payload) => {
            if (payload?.suiteId) {
                return services.performanceService.getSuiteHistory(payload.suiteId);
            }
            return services.performanceService.getHistory();
        },

        [FrontendCommand.GetPerformanceSuites]: async () => {
            return services.performanceService.getSuites();
        },

        [FrontendCommand.GetPerformanceRunUpdates]: async (payload) => {
            const runId = payload?.runId;
            const fromIndex = typeof payload?.fromIndex === 'number' ? payload.fromIndex : 0;
            if (!runId) return { updates: [], nextIndex: fromIndex, done: true, error: 'Missing runId' };

            const run = performanceRunStore.get(runId);
            if (!run) return { updates: [], nextIndex: fromIndex, done: true, error: 'Run not found' };

            const safeIndex = Math.max(0, fromIndex);
            const updates = run.updates.slice(safeIndex);
            const nextIndex = safeIndex + updates.length;
            const done = run.done;
            const error = run.error;
            const runData = run.run;

            if (done && nextIndex >= run.updates.length) {
                performanceRunStore.delete(runId);
            }

            return { updates, nextIndex, done, error, run: runData };
        },

        [FrontendCommand.AddPerformanceSuite]: async (payload) => {
            const now = Date.now();
            const suite = payload?.suite || {
                id: payload?.id || `perf-suite-${now}`,
                name: payload?.name || 'New Performance Suite',
                description: payload?.description || '',
                requests: [],
                iterations: payload?.iterations || 10,
                delayBetweenRequests: payload?.delayBetweenRequests || 0,
                warmupRuns: payload?.warmupRuns || 1,
                concurrency: payload?.concurrency || 1,
                createdAt: now,
                modifiedAt: now,
                collapsedSections: ['scheduling', 'workers']
            };
            services.performanceService.addSuite(suite);
            services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            return { suite, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.UpdatePerformanceSuite]: async (payload) => {
            const suiteId = payload.suiteId || payload.id;
            services.performanceService.updateSuite(suiteId, payload.updates);
            services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            return { updated: true, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.DeletePerformanceSuite]: async (payload) => {
            const suiteId = payload.suiteId || payload.id;
            services.performanceService.deleteSuite(suiteId);
            services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            return { deleted: true, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.DeletePerformanceRequest]: async (payload) => {
            const { suiteId, requestId } = payload;
            const suite = services.performanceService.getSuite(suiteId);
            if (suite) {
                const updatedRequests = suite.requests.filter(r => r.id !== requestId);
                services.performanceService.updateSuite(suiteId, { requests: updatedRequests });
                services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            }
            return { deleted: true, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.UpdatePerformanceRequest]: async (payload) => {
            const { suiteId, requestId, updates } = payload;
            const suite = services.performanceService.getSuite(suiteId);
            if (suite) {
                const updatedRequests = suite.requests.map(r => 
                    r.id === requestId ? { ...r, ...updates } : r
                );
                services.performanceService.updateSuite(suiteId, { requests: updatedRequests });
                services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            }
            return { updated: true, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.AddPerformanceRequest]: async (payload) => {
            const { suiteId, ...requestData } = payload;
            const suite = services.performanceService.getSuite(suiteId);
            if (suite) {
                const newRequest = {
                    id: `perf-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    name: requestData.name || 'New Request',
                    endpoint: requestData.endpoint || '',
                    method: requestData.method || 'POST',
                    soapAction: requestData.soapAction,
                    interfaceName: requestData.interfaceName,
                    operationName: requestData.operationName,
                    requestBody: requestData.requestBody || '',
                    headers: requestData.headers || {},
                    extractors: requestData.extractors || [],
                    order: suite.requests.length,
                    requestType: requestData.requestType,
                    bodyType: requestData.bodyType,
                    restConfig: requestData.restConfig,
                    graphqlConfig: requestData.graphqlConfig,
                };
                const updatedRequests = [...suite.requests, newRequest];
                services.performanceService.updateSuite(suiteId, { requests: updatedRequests });
                services.settingsManager.updatePerformanceSuites(services.performanceService.getSuites());
            }
            return { added: true, config: services.settingsManager.getConfig() };
        },

        [FrontendCommand.PickOperationForPerformance]: async (payload) => {
            // This is handled by the frontend context, but we include it for completeness
            return { acknowledged: true };
        },

        // ===== Config Switcher =====
        [FrontendCommand.InjectProxy]: async (payload) => {
            const { filePath, proxyBaseUrl } = payload;
            return services.configSwitcherService.inject(filePath, proxyBaseUrl);
        },

        [FrontendCommand.RestoreProxy]: async (payload) => {
            return services.configSwitcherService.restore(payload.filePath);
        },

        // ===== Request History =====
        [FrontendCommand.GetHistory]: async () => {
            return services.historyService.getAll();
        },

        [FrontendCommand.ClearHistory]: async () => {
            services.historyService.clearAll();
            return { cleared: true };
        },

        [FrontendCommand.DeleteHistoryEntry]: async (payload) => {
            services.historyService.deleteEntry(payload.id);
            return { deleted: true };
        },

        [FrontendCommand.ToggleStarHistory]: async (payload) => {
            services.historyService.toggleStar(payload.id);
            return { toggled: true };
        },

        // ===== Settings =====
        [FrontendCommand.GetSettings]: async () => {
            const configPath = services.settingsManager.getConfigPath();
            const configDir = services.settingsManager.getConfigDir();
            
            let raw = '';
            let readError: string | null = null;
            let exists = false;
            
            try {
                const fs = await import('fs');
                exists = fs.existsSync(configPath);
                raw = services.settingsManager.getRawConfig();
            } catch (e: any) {
                readError = e?.message || String(e);
            }

            const config = services.settingsManager.getConfig();

            return {
                config,
                raw,
                configDir,
                configPath
            };
        },

        [FrontendCommand.SaveSettings]: async (payload) => {
            if (payload?.raw) {
                services.settingsManager.saveRawConfig(payload.content || '');
            } else if (payload?.config) {
                services.settingsManager.updateConfigFromObject(payload.config);
            } else if (payload?.content) {
                services.settingsManager.saveRawConfig(payload.content);
            }
            const updatedConfig = services.settingsManager.getConfig();
            services.fileWatcherService.reloadConfiguration();
            services.performanceService.setSuites(updatedConfig.performanceSuites || []);
            services.performanceService.setHistory(updatedConfig.performanceHistory || []);
            services.scheduleService.loadSchedules(updatedConfig.performanceSchedules || []);
            
            // Sync proxy-related rules to ProxyService if running
            services.proxyService.setProxyRules(updatedConfig.network?.proxyRules || []);
            services.proxyService.setReplaceRules(updatedConfig.replaceRules || []);
            services.proxyService.setBreakpoints(updatedConfig.breakpoints || []);
            
            return {
                success: true
            };
        },

        // ===== Secrets Management =====
        ['setEnvironmentSecret']: async (payload) => {
            const { envName, fieldName, value } = payload;
            await services.secretManager.setEnvironmentSecret(envName, fieldName, value);
            return { success: true };
        },

        ['getEnvironmentSecret']: async (payload) => {
            const { envName, fieldName } = payload;
            const value = await services.secretManager.getEnvironmentSecret(envName, fieldName);
            return { value };
        },

        ['deleteEnvironmentSecret']: async (payload) => {
            const { envName, fieldName } = payload;
            await services.secretManager.deleteEnvironmentSecret(envName, fieldName);
            return { success: true };
        },

        // ===== File Watcher =====
        [FrontendCommand.StartWatcher]: async () => {
            services.fileWatcherService.start();
            return { started: true };
        },

        [FrontendCommand.StopWatcher]: async () => {
            services.fileWatcherService.stop();
            return { stopped: true };
        },

        // ===== Schedules =====
        [FrontendCommand.GetSchedules]: async () => {
            return services.scheduleService.getSchedules();
        },

        [FrontendCommand.AddSchedule]: async (payload) => {
            const { suiteId, suiteName, cronExpression, description } = payload;
            return services.scheduleService.addSchedule(suiteId, suiteName, cronExpression, description);
        },

        [FrontendCommand.UpdateSchedule]: async (payload) => {
            return services.scheduleService.updateSchedule(payload.id, payload.updates);
        },

        [FrontendCommand.DeleteSchedule]: async (payload) => {
            return services.scheduleService.deleteSchedule(payload.id);
        },

        [FrontendCommand.ToggleSchedule]: async (payload) => {
            const schedules = services.scheduleService.getSchedules();
            const schedule = schedules.find(s => s.id === payload.id);
            if (schedule) {
                return services.scheduleService.updateSchedule(payload.id, { enabled: !schedule.enabled });
            }
            return null;
        },

        // ===== ADO (Azure DevOps) =====
        [FrontendCommand.AdoStorePat]: async (payload) => {
            await services.secretStorage.store('dirtysoap.azuredevops.pat', payload.pat);
            return { stored: true };
        },

        [FrontendCommand.AdoHasPat]: async () => {
            const pat = await services.secretStorage.get('dirtysoap.azuredevops.pat');
            return { hasPat: !!pat };
        },

        [FrontendCommand.AdoDeletePat]: async () => {
            await services.secretStorage.delete('dirtysoap.azuredevops.pat');
            return { deleted: true };
        },

        // ===== Diagnostics =====
        ['getLogs']: async (payload) => {
            return services.getOutputLogs(payload?.count || 100);
        },

        // ===== Workspace Commands (Tauri-specific stubs) =====
        [FrontendCommand.SaveOpenProjects]: async (payload) => {
            // Save the list of open project paths to settings
            // Payload should contain { projectPaths: string[] }
            if (payload && payload.projectPaths) {
                // console.log(`[Sidecar] Saving open projects list: ${payload.projectPaths.length}`);
                services.settingsManager.updateOpenProjects(payload.projectPaths);
            }
            return { saved: true };
        },

        [FrontendCommand.SaveWorkspace]: async (payload) => {
            // Save workspace state to localStorage
            try {
                const { workspace } = payload;
                // In Tauri, we could save to a file or use the store plugin
                console.log('[Sidecar] SaveWorkspace called - using localStorage');
                return { saved: true };
            } catch (e: any) {
                return { saved: false, error: e.message };
            }
        },

        [FrontendCommand.OpenWorkspace]: async () => {
            // In Tauri, the dialog service would handle file selection
            console.log('[Sidecar] OpenWorkspace called');
            return { opened: false, message: 'Use file dialog to open workspace' };
        },

        [FrontendCommand.AutoSaveWorkspace]: async () => {
            // Auto-save is handled client-side in Tauri
            return { saved: true };
        },

        [FrontendCommand.GetAutosave]: async () => {
            // Return empty - autosave handled client-side
            return { hasAutosave: false };
        },

        [FrontendCommand.SaveUiState]: async (payload) => {
            if (payload?.ui) {
                services.settingsManager.updateUiState(payload.ui);
            }
            return {
                saved: true,
                config: services.settingsManager.getConfig(),
                raw: services.settingsManager.getRawConfig()
            };
        },

        [FrontendCommand.Log]: async (payload) => {
            console.log('[Frontend Log]', payload.message);
            return { logged: true };
        },

        [FrontendCommand.ClipboardAction]: async (payload) => {
            // Clipboard operations handled by Tauri plugin
            console.log('[Sidecar] Clipboard action:', payload.action);
            return { success: true };
        },

        // ===== Coordinator (stub - not implemented for standalone) =====
        [FrontendCommand.StartCoordinator]: async () => {
            return { started: false, message: 'Coordinator not available in standalone mode' };
        },

        [FrontendCommand.StopCoordinator]: async () => {
            return { stopped: true };
        },

        [FrontendCommand.GetCoordinatorStatus]: async () => {
            return { running: false, workers: [] };
        },

        // ===== File Watcher =====
        [FrontendCommand.GetWatcherHistory]: async () => {
            return services.fileWatcherService.getHistory();
        },

        [FrontendCommand.ClearWatcherHistory]: async () => {
            services.fileWatcherService.clearHistory();
            return { cleared: true };
        },

        // ===== Echo (for testing) =====
        ['echo']: async (payload) => {
            return { echo: payload };
        },

        // ===== Debug/Diagnostics =====
        [FrontendCommand.GetSidecarLogs]: async (payload) => {
            const count = payload?.count || 100;
            const logs = services.getOutputLogs(count);
            return { logs };
        },

        [FrontendCommand.ClearSidecarLogs]: async () => {
            services.clearOutputLogs();
            return { cleared: true };
        },

        [FrontendCommand.GetDebugInfo]: async () => {
            const config = services.settingsManager.getConfig();
            
            // Collect debug information
            const debugInfo = {
                timestamp: new Date().toISOString(),
                sidecar: {
                    ready: true,
                    version: process.env.APINOX_VERSION || 'unknown',
                },
                services: {
                    proxy: {
                        running: services.proxyService.isActive(),
                        port: services.proxyService.getConfig().port,
                    },
                    mock: {
                        running: services.mockService.isActive(),
                        port: services.mockService.getPort(),
                    },
                    watcher: {
                        running: services.fileWatcherService.isActive(),
                    },
                },
                config: {
                    configDir: services.settingsManager.getConfigDir(),
                    hasOpenProjects: (config.openProjects?.length || 0) > 0,
                    projectCount: config.openProjects?.length || 0,
                    activeEnvironment: config.activeEnvironment || 'none',
                    environments: Object.keys(config.environments || {}),
                },
                system: {
                    platform: process.platform,
                    nodeVersion: process.version,
                    architecture: process.arch,
                },
            };

            return { debugInfo };
        },

        [FrontendCommand.OpenFile]: async (message: any) => {
            if (!message.filePath) {
                throw new Error('No file path provided');
            }
            // Use platform-specific command to open file with default editor
            const { exec } = require('child_process');
            const platform = process.platform;
            let command: string;
            
            if (platform === 'win32') {
                command = `start "" "${message.filePath}"`;
            } else if (platform === 'darwin') {
                command = `open "${message.filePath}"`;
            } else {
                command = `xdg-open "${message.filePath}"`;
            }
            
            return new Promise((resolve, reject) => {
                exec(command, (error: any) => {
                    if (error) {
                        console.error('[Sidecar] Failed to open file:', error);
                        reject(new Error(`Failed to open file: ${error.message}`));
                    } else {
                        resolve({ opened: true });
                    }
                });
            });
        },

        // ===== Certificate & Proxy Diagnostics =====
        [FrontendCommand.CheckCertificate]: async () => {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            
            const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
            const keyPath = path.join(os.tmpdir(), 'apinox-proxy.key');
            
            const exists = fs.existsSync(certPath) && fs.existsSync(keyPath);
            let thumbprint = null;
            
            if (exists && process.platform === 'win32') {
                // Use PowerShell to get thumbprint (more reliable than certutil)
                try {
                    const { execSync } = require('child_process');
                    const script = `$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${certPath.replace(/\\/g, '\\\\')}'); Write-Output $cert.Thumbprint`;
                    const result = execSync(`powershell -Command "${script}"`, { encoding: 'utf8' });
                    thumbprint = result.trim().toUpperCase();
                    console.log('[Diagnostics] Certificate thumbprint:', thumbprint);
                } catch (e: any) {
                    console.warn('[Diagnostics] Failed to get thumbprint:', e.message);
                }
            }
            
            return { 
                exists, 
                certPath: exists ? certPath : null,
                keyPath: exists ? keyPath : null,
                thumbprint 
            };
        },

        [FrontendCommand.CheckCertificateStore]: async (payload) => {
            if (process.platform !== 'win32') {
                return { inLocalMachine: false, inCurrentUser: false, unsupported: true };
            }
            
            const { thumbprint } = payload;
            if (!thumbprint) {
                throw new Error('Thumbprint is required');
            }
            
            console.log('[Diagnostics] Checking certificate stores for thumbprint:', thumbprint);
            
            const { execSync } = require('child_process');
            let inLocalMachine = false;
            let inCurrentUser = false;
            
            try {
                // Check LocalMachine\Root
                const script = `$certs = Get-ChildItem -Path Cert:\\LocalMachine\\Root -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq '${thumbprint}' }; if ($certs) { Write-Output 'FOUND' } else { Write-Output 'NOT_FOUND' }`;
                const localMachineResult = execSync(
                    `powershell -Command "${script}"`,
                    { encoding: 'utf8' }
                );
                inLocalMachine = localMachineResult.trim() === 'FOUND';
                console.log('[Diagnostics] LocalMachine\\Root:', inLocalMachine ? 'FOUND' : 'NOT FOUND');
            } catch (e: any) {
                console.warn('[Diagnostics] Error checking LocalMachine store:', e.message);
            }
            
            try {
                // Check CurrentUser\Root
                const script = `$certs = Get-ChildItem -Path Cert:\\CurrentUser\\Root -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq '${thumbprint}' }; if ($certs) { Write-Output 'FOUND' } else { Write-Output 'NOT_FOUND' }`;
                const currentUserResult = execSync(
                    `powershell -Command "${script}"`,
                    { encoding: 'utf8' }
                );
                inCurrentUser = currentUserResult.trim() === 'FOUND';
                console.log('[Diagnostics] CurrentUser\\Root:', inCurrentUser ? 'FOUND' : 'NOT FOUND');
            } catch (e: any) {
                console.warn('[Diagnostics] Error checking CurrentUser store:', e.message);
            }
            
            return { inLocalMachine, inCurrentUser };
        },

        [FrontendCommand.TestHttpsServer]: async () => {
            const https = require('https');
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            
            const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
            const keyPath = path.join(os.tmpdir(), 'apinox-proxy.key');
            
            if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
                return { success: false, error: 'Certificate files not found' };
            }
            
            try {
                const cert = fs.readFileSync(certPath, 'utf8');
                const key = fs.readFileSync(keyPath, 'utf8');
                
                // Try to create HTTPS server with the certificate
                const testServer = https.createServer({ cert, key }, (req: any, res: any) => {
                    res.writeHead(200);
                    res.end('OK');
                });
                
                // Try to bind to a random port
                await new Promise<void>((resolve, reject) => {
                    testServer.listen(0, '127.0.0.1', () => {
                        testServer.close(() => resolve());
                    });
                    testServer.on('error', reject);
                });
                
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        },

        [FrontendCommand.TestProxyConnection]: async () => {
            const https = require('https');
            
            // Check if proxy is running
            if (!services.proxyService.isActive()) {
                return { success: false, error: 'Proxy is not running' };
            }
            
            const config = services.proxyService.getConfig();
            const proxyUrl = `https://localhost:${config.port}`;
            
            return new Promise((resolve) => {
                const options = {
                    hostname: 'localhost',
                    port: config.port,
                    path: '/',
                    method: 'GET',
                    rejectUnauthorized: false, // Accept self-signed cert
                    requestCert: false,
                    agent: false
                };
                
                console.log('[Diagnostics] Testing connection to proxy:', proxyUrl);
                
                const req = https.request(options, (res: any) => {
                    console.log('[Diagnostics] Connection successful! Status:', res.statusCode);
                    console.log('[Diagnostics] TLS Protocol:', res.socket.getProtocol());
                    console.log('[Diagnostics] Cipher:', res.socket.getCipher());
                    
                    let data = '';
                    res.on('data', (chunk: any) => { data += chunk; });
                    res.on('end', () => {
                        resolve({
                            success: true,
                            protocol: res.socket.getProtocol(),
                            cipher: res.socket.getCipher()?.name,
                            statusCode: res.statusCode
                        });
                    });
                });
                
                req.on('error', (error: any) => {
                    console.error('[Diagnostics] Connection failed:', error);
                    resolve({
                        success: false,
                        error: error.message,
                        code: error.code
                    });
                });
                
                req.setTimeout(5000, () => {
                    req.destroy();
                    resolve({ success: false, error: 'Connection timeout' });
                });
                
                req.end();
            });
        },

        [FrontendCommand.InstallCertificateToLocalMachine]: async () => {
            if (process.platform !== 'win32') {
                return { success: false, error: 'Only supported on Windows' };
            }
            
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const { execSync } = require('child_process');
            
            const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
            
            if (!fs.existsSync(certPath)) {
                return { success: false, error: 'Certificate file not found' };
            }
            
            try {
                console.log('[Diagnostics] Installing certificate to LocalMachine\\Root...');
                console.log('[Diagnostics] Certificate path:', certPath);
                
                // Escape backslashes in path for PowerShell
                const escapedPath = certPath.replace(/\\/g, '\\\\');
                
                // Install certificate with detailed error handling
                const script = `
                    try {
                        $certPath = '${escapedPath}'
                        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath)
                        Write-Output "Certificate loaded: $($cert.Thumbprint)"
                        
                        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
                        $store.Open('ReadWrite')
                        
                        # Check if already exists
                        $existing = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
                        if ($existing) {
                            Write-Output "Certificate already installed"
                            $store.Close()
                            exit 0
                        }
                        
                        $store.Add($cert)
                        $store.Close()
                        Write-Output "Certificate installed successfully"
                        
                        # Verify installation
                        $verifyStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
                        $verifyStore.Open('ReadOnly')
                        $verified = $verifyStore.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
                        $verifyStore.Close()
                        
                        if ($verified) {
                            Write-Output "Installation verified"
                        } else {
                            throw "Installation verification failed"
                        }
                    } catch {
                        Write-Error $_.Exception.Message
                        exit 1
                    }
                `;
                
                const result = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${script}"`, { encoding: 'utf8' });
                console.log('[Diagnostics] Installation result:', result);
                
                return { success: true, message: result.trim() };
            } catch (error: any) {
                console.error('[Diagnostics] Installation failed:', error.message);
                
                // Check if it's a permissions error
                if (error.message.includes('Access is denied') || error.message.includes('UnauthorizedAccessException')) {
                    return { 
                        success: false, 
                        error: 'Access denied. APInox needs to run as Administrator to install certificates to LocalMachine store.\n\nAlternatively, run this PowerShell command as Administrator:\nImport-Certificate -FilePath "' + certPath + '" -CertStoreLocation Cert:\\LocalMachine\\Root'
                    };
                }
                
                return { success: false, error: error.message };
            }
        },

        [FrontendCommand.MoveCertificateToLocalMachine]: async (payload) => {
            if (process.platform !== 'win32') {
                return { success: false, error: 'Only supported on Windows' };
            }
            
            const { thumbprint } = payload;
            if (!thumbprint) {
                throw new Error('Thumbprint is required');
            }
            
            const { execSync } = require('child_process');
            
            try {
                // PowerShell script to move certificate from CurrentUser to LocalMachine
                const script = `
                    $thumbprint = '${thumbprint}'
                    $currentUserStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
                    $currentUserStore.Open('ReadWrite')
                    $cert = $currentUserStore.Certificates | Where-Object { $_.Thumbprint -eq $thumbprint } | Select-Object -First 1
                    
                    if ($cert) {
                        $localMachineStore = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'LocalMachine')
                        $localMachineStore.Open('ReadWrite')
                        $localMachineStore.Add($cert)
                        $localMachineStore.Close()
                        
                        $currentUserStore.Remove($cert)
                        $currentUserStore.Close()
                        Write-Output 'Success'
                    } else {
                        $currentUserStore.Close()
                        throw 'Certificate not found in CurrentUser store'
                    }
                `;
                
                execSync(`powershell -Command "${script.replace(/"/g, '\\"')}"`, { encoding: 'utf8' });
                return { success: true };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        },

        [FrontendCommand.RegenerateCertificate]: async () => {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            
            const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
            const keyPath = path.join(os.tmpdir(), 'apinox-proxy.key');
            
            try {
                console.log('[Diagnostics] Starting certificate regeneration...');
                
                // Delete existing certificate files
                if (fs.existsSync(certPath)) {
                    fs.unlinkSync(certPath);
                    console.log('[Diagnostics] Deleted old certificate');
                }
                if (fs.existsSync(keyPath)) {
                    fs.unlinkSync(keyPath);
                    console.log('[Diagnostics] Deleted old key');
                }
                
                // Import node-forge to regenerate certificate
                const forge = require('node-forge');
                const pki = forge.pki;
                
                // Generate a key pair
                console.log('[Diagnostics] Generating new RSA key pair (2048-bit)...');
                const keys = pki.rsa.generateKeyPair(2048);
                console.log('[Diagnostics] Key pair generated');
                
                // Create a certificate
                console.log('[Diagnostics] Creating certificate...');
                const cert = pki.createCertificate();
                cert.publicKey = keys.publicKey;
                
                // Serial number
                cert.serialNumber = '01' + Date.now().toString(16);
                
                // Validity period
                cert.validity.notBefore = new Date();
                cert.validity.notAfter = new Date();
                cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);
                
                const attrs = [{
                    name: 'commonName',
                    value: 'localhost'
                }, {
                    name: 'organizationName',
                    value: 'APInox Proxy'
                }];
                
                cert.setSubject(attrs);
                cert.setIssuer(attrs);
                
                cert.setExtensions([{
                    name: 'basicConstraints',
                    cA: false // Server certificate, not CA
                }, {
                    name: 'keyUsage',
                    keyCertSign: false,
                    digitalSignature: true,
                    nonRepudiation: true,
                    keyEncipherment: true,
                    dataEncipherment: true
                }, {
                    name: 'extKeyUsage',
                    serverAuth: true,
                    clientAuth: true
                }, {
                    name: 'subjectAltName',
                    altNames: [{
                        type: 2, // DNS
                        value: 'localhost'
                    }, {
                        type: 7, // IP
                        ip: '127.0.0.1'
                    }, {
                        type: 2, // DNS
                        value: '*.localhost'
                    }]
                }]);
                
                // Self-sign certificate
                console.log('[Diagnostics] Signing certificate...');
                cert.sign(keys.privateKey, forge.md.sha256.create());
                console.log('[Diagnostics] Certificate signed');
                
                // Convert to PEM
                const certPem = pki.certificateToPem(cert);
                const keyPem = pki.privateKeyToPem(keys.privateKey);
                
                // Validate PEM format
                if (!certPem.includes('BEGIN CERTIFICATE') || !keyPem.includes('BEGIN RSA PRIVATE KEY')) {
                    throw new Error('Generated PEM files are invalid');
                }
                
                // Save to temp directory
                fs.writeFileSync(certPath, certPem, 'utf8');
                fs.writeFileSync(keyPath, keyPem, 'utf8');
                
                console.log('[Diagnostics] Certificate files saved');
                console.log('[Diagnostics] Cert:', certPath);
                console.log('[Diagnostics] Key:', keyPath);
                
                // Verify files can be read back
                const certTest = fs.readFileSync(certPath, 'utf8');
                const keyTest = fs.readFileSync(keyPath, 'utf8');
                
                if (!certTest.includes('BEGIN CERTIFICATE') || !keyTest.includes('BEGIN RSA PRIVATE KEY')) {
                    throw new Error('Saved certificate files are corrupted');
                }
                
                // Test that certificate and key match by creating a test server
                console.log('[Diagnostics] Validating certificate/key pair...');
                const https = require('https');
                const testServer = https.createServer({ cert: certPem, key: keyPem });
                
                await new Promise<void>((resolve, reject) => {
                    testServer.listen(0, '127.0.0.1', () => {
                        console.log('[Diagnostics] ✓ Certificate/key pair validated');
                        testServer.close(() => resolve());
                    });
                    testServer.on('error', (err: any) => {
                        reject(new Error(`Certificate/key validation failed: ${err.message}`));
                    });
                    setTimeout(() => {
                        testServer.close();
                        reject(new Error('Certificate validation timeout'));
                    }, 5000);
                });
                
                console.log('[Diagnostics] Certificate regenerated successfully');
                
                return { success: true, certPath, keyPath };
            } catch (error: any) {
                console.error('[Diagnostics] Failed to regenerate certificate:', error);
                
                // Clean up partial files on error
                try {
                    if (fs.existsSync(certPath)) fs.unlinkSync(certPath);
                    if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
                } catch (e) {
                    // Ignore cleanup errors
                }
                
                return { success: false, error: error.message };
            }
        },

        [FrontendCommand.GetProxyStatus]: async () => {
            return { 
                running: services.proxyService.isActive(),
                config: services.proxyService.getConfig()
            };
        },

        [FrontendCommand.ResetCertificates]: async () => {
            const fs = require('fs');
            const path = require('path');
            const os = require('os');
            const { execSync } = require('child_process');
            
            const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
            const keyPath = path.join(os.tmpdir(), 'apinox-proxy.key');

            try {
                // Step 1: Remove certificates from stores
                const psScript = `
                    $results = @()
                    
                    # Remove from LocalMachine\\Root
                    try {
                        $lmCerts = Get-ChildItem -Path Cert:\\LocalMachine\\Root -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like "*APInox*" }
                        $lmCount = ($lmCerts | Measure-Object).Count
                        $lmCerts | Remove-Item -ErrorAction SilentlyContinue
                        $results += "Removed $lmCount certificate(s) from LocalMachine\\Root"
                    } catch {
                        $results += "Failed to clean LocalMachine\\Root: $($_.Exception.Message)"
                    }
                    
                    # Remove from CurrentUser\\Root
                    try {
                        $cuCerts = Get-ChildItem -Path Cert:\\CurrentUser\\Root -ErrorAction SilentlyContinue | Where-Object { $_.Subject -like "*APInox*" }
                        $cuCount = ($cuCerts | Measure-Object).Count
                        $cuCerts | Remove-Item -ErrorAction SilentlyContinue
                        $results += "Removed $cuCount certificate(s) from CurrentUser\\Root"
                    } catch {
                        $results += "Failed to clean CurrentUser\\Root: $($_.Exception.Message)"
                    }
                    
                    $results -join "\\n"
                `;

                const storeCleanup = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
                    encoding: 'utf-8',
                    timeout: 10000
                }).trim();

                // Step 2: Delete certificate files
                let filesDeleted = 0;
                if (fs.existsSync(certPath)) {
                    fs.unlinkSync(certPath);
                    filesDeleted++;
                }
                if (fs.existsSync(keyPath)) {
                    fs.unlinkSync(keyPath);
                    filesDeleted++;
                }

                console.log('[ResetCertificates] Reset complete');
                return {
                    success: true,
                    message: 'Certificates reset successfully',
                    details: `${storeCleanup}\nDeleted ${filesDeleted} file(s) from TEMP folder\n\nNow regenerate certificate and install to LocalMachine\\Root`
                };

            } catch (error) {
                console.error(`[ResetCertificates] Failed: ${error}`);
                return {
                    success: false,
                    error: `Failed to reset certificates: ${error instanceof Error ? error.message : String(error)}`
                };
            }
        },

        // ===== Webview Ready (initialization) =====
        ['webviewReady']: async () => {
            console.log('[Sidecar] Webview ready - sending initialization data');

            const result: any = {
                acknowledged: true,
                samplesProject: SAMPLES_PROJECT
            };

            // Load and send changelog
            try {
                const fs = require('fs');
                const path = require('path');
                
                // In standalone binary, __dirname is inside the pkg snapshot
                // We need to use process.execPath to find the real executable location
                const execDir = path.dirname(process.execPath);
                
                console.log('[Sidecar] Looking for changelog...');
                console.log('[Sidecar]   __dirname:', __dirname);
                console.log('[Sidecar]   process.execPath:', process.execPath);
                console.log('[Sidecar]   execDir:', execDir);
                
                // In development: navigate up from sidecar/dist/sidecar/src
                // In production: try multiple possible locations
                const possiblePaths = [
                    path.join(__dirname, '../../../../CHANGELOG.md'), // Dev mode
                    path.join(__dirname, '../../../CHANGELOG.md'), // Bundled sidecar
                    path.join(__dirname, '../../CHANGELOG.md'), // Alternative bundled location
                    path.join(execDir, 'CHANGELOG.md'), // Windows: next to exe
                    path.join(__dirname, '../Resources/CHANGELOG.md'), // Tauri bundle: MacOS -> Resources (won't work with pkg)
                    path.join(execDir, '../Resources/CHANGELOG.md'), // Tauri bundle: use execPath instead of __dirname
                    path.join(__dirname, 'CHANGELOG.md'), // Same directory as sidecar
                ];
                
                for (const testPath of possiblePaths) {
                    console.log('[Sidecar]   Trying:', testPath);
                    if (fs.existsSync(testPath)) {
                        const content = fs.readFileSync(testPath, 'utf8');
                        result.changelog = content;
                        console.log('[Sidecar] ✓ Changelog loaded from:', testPath, 'length:', content.length);
                        break;
                    }
                }
                
                if (!result.changelog) {
                    console.warn('[Sidecar] Changelog file not found in any expected location');
                }
            } catch (e) {
                console.error('[Sidecar] Failed to load changelog:', e);
            }

            // Load previously open projects
            try {
                const config = services.settingsManager.getConfig();

                if (config.openProjects && config.openProjects.length > 0) {
                    console.log(`[Sidecar] Loading ${config.openProjects.length} previously open projects...`);
                    const loadedProjects = [];

                    for (const projectPath of config.openProjects) {
                        // Skip if it's the Samples project or read-only placeholder
                        if (projectPath === 'Samples' || projectPath === 'samples-project-read-only') continue;

                        try {
                            console.log(`[Sidecar] Loading project from: ${projectPath}`);
                            const project = await services.folderStorage.loadProject(projectPath);
                            if (project) {
                                loadedProjects.push(project);
                            }
                        } catch (err) {
                            console.error(`[Sidecar] Failed to load project from ${projectPath}:`, err);
                        }
                    }

                    if (loadedProjects.length > 0) {
                        result.projects = loadedProjects;
                        console.log(`[Sidecar] Successfully loaded ${loadedProjects.length} user projects`);
                    }
                }
            } catch (e) {
                console.error('[Sidecar] Error loading user projects:', e);
            }

            return result;
        },

        // ===== Workflows =====
        [FrontendCommand.ExecuteWorkflow]: async (payload) => {
            const { workflow, projectPath } = payload;
            
            if (!workflow) {
                throw new Error('Workflow not provided');
            }

            const { WorkflowEngine } = require('./services/WorkflowEngine');
            const engine = new WorkflowEngine();

            // Create request execution function that uses our existing services
            const executeRequestFn = async (request: any) => {
                const environmentName = payload.environment || services.settingsManager.getActiveEnvironment();
                let envVars: Record<string, string> = {};
                if (environmentName) {
                    try {
                        envVars = await services.settingsManager.getResolvedEnvironment(environmentName);
                    } catch (err: any) {
                        console.error(`[Workflow] Failed to resolve environment:`, err);
                    }
                }

                const globalVars = services.settingsManager.getGlobalVariables() || {};
                
                // Process wildcards in request body and endpoint
                let processedBody = request.request || '';
                let processedEndpoint = request.endpoint || '';
                
                if (processedBody) {
                    const WildcardProcessor = await import('../../src/utils/WildcardProcessor').then(m => m.WildcardProcessor);
                    processedBody = WildcardProcessor.process(processedBody, envVars, globalVars);
                }
                if (processedEndpoint) {
                    const WildcardProcessor = await import('../../src/utils/WildcardProcessor').then(m => m.WildcardProcessor);
                    processedEndpoint = WildcardProcessor.process(processedEndpoint, envVars, globalVars);
                }

                // Execute request using SOAP client
                const requestType = request.requestType || 'soap';
                if (requestType !== 'soap') {
                    return await services.soapClient.executeHttpRequest({
                        ...request,
                        request: processedBody,
                        endpoint: processedEndpoint
                    });
                } else {
                    return await services.soapClient.executeRequest(
                        processedEndpoint,
                        request.operationName || request.name,
                        processedBody,
                        request.headers || {}
                    );
                }
            };

            // Execute workflow
            const result = await engine.execute(workflow, executeRequestFn);
            
            return result;
        },

        [FrontendCommand.GetWorkflows]: async (payload) => {
            // Workflows are now global, not project-specific
            const workflows = services.settingsManager.getWorkflows();
            return { workflows };
        },

        [FrontendCommand.SaveWorkflow]: async (payload) => {
            const { workflow } = payload;
            console.log('[Router] SaveWorkflow called with workflow:', workflow?.name, 'id:', workflow?.id);
            
            if (!workflow) {
                throw new Error('Workflow required');
            }
            
            try {
                // Get current workflows from global config
                const workflows = services.settingsManager.getWorkflows();
                console.log('[Router] Current workflows count:', workflows.length);
                
                const existingIndex = workflows.findIndex((w: any) => w.id === workflow.id);
                console.log('[Router] Existing workflow index:', existingIndex);
                
                if (existingIndex >= 0) {
                    workflows[existingIndex] = workflow;
                    console.log('[Router] Updated existing workflow at index:', existingIndex);
                } else {
                    workflows.push(workflow);
                    console.log('[Router] Added new workflow, total count:', workflows.length);
                }
                
                // Save back to global config
                services.settingsManager.updateWorkflows(workflows);
                console.log('[Router] Workflows saved to config');
                
                return { success: true, workflow };
            } catch (err: any) {
                console.error('[Workflow] Failed to save workflow:', err);
                throw err;
            }
        },

        [FrontendCommand.DeleteWorkflow]: async (payload) => {
            const { workflowId } = payload;
            if (!workflowId) {
                throw new Error('Workflow ID required');
            }
            
            try {
                const workflows = services.settingsManager.getWorkflows();
                const filtered = workflows.filter((w: any) => w.id !== workflowId);
                services.settingsManager.updateWorkflows(filtered);
                
                return { success: true };
            } catch (err: any) {
                console.error('[Workflow] Failed to delete workflow:', err);
                throw err;
            }
        },
    };

    return {
        async handle(command: string, payload: any): Promise<any> {
            let handler = handlers[command];
            
            // Fallback: Try case-insensitive or enum value lookup
            if (!handler) {
                // Try lowercase first letter (GetSettings -> getSettings)
                const lowerCaseCommand = command.charAt(0).toLowerCase() + command.slice(1);
                const fallbackHandler = handlers[lowerCaseCommand];
                
                if (fallbackHandler) {
                    console.log(`[Router] Command '${command}' not found, using '${lowerCaseCommand}' instead`);
                    handler = fallbackHandler;
                }
            }

            if (!handler) {
                console.warn(`[Router] Unknown command: ${command}`);
                throw new Error(`Unknown command: ${command}`);
            }

            // Skip logging for noisy/frequent commands to reduce log clutter
            const noisyCommands = ['log', 'autoSaveWorkspace', 'getCoordinatorStatus'];
            if (!noisyCommands.includes(command)) {
                console.log(`[Router] Handling: ${command}`);
            }
            return await handler(payload);
        }
    };
}

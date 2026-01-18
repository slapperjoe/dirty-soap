/**
 * Command Router - Routes frontend commands to appropriate service methods
 * 
 * Maps FrontendCommand enum values from shared/src/messages.ts
 * to the appropriate service method calls.
 */

import { FrontendCommand } from '../../shared/src/messages';
import { RequestHistoryEntry } from '../../shared/src/models';
import { ServiceContainer } from './services';

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
            return await services.soapClient.parseWsdl(url, localWsdlDir);
        },

        [FrontendCommand.ExecuteRequest]: async (payload) => {
            // Frontend sends: url, operation, xml, headers, contentType, etc.
            // Accept both naming conventions
            const startTime = Date.now();
            const endpoint = payload.endpoint || payload.url;
            const operation = payload.operation;
            const args = payload.args || payload.xml;
            const headers = payload.headers || {};
            const requestType = payload.requestType || 'soap';

            // Apply content type if provided
            if (payload.contentType && !headers['Content-Type']) {
                headers['Content-Type'] = payload.contentType;
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
                services.proxyService.updateConfig(payload.config);
            }
            await services.proxyService.start();
            return { started: true, port: services.proxyService.getConfig().port };
        },

        [FrontendCommand.StopProxy]: async () => {
            services.proxyService.stop();
            return { stopped: true };
        },

        [FrontendCommand.UpdateProxyConfig]: async (payload) => {
            services.proxyService.updateConfig(payload);
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
            return services.settingsManager.getConfig();
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
            services.performanceService.setSuites(updatedConfig.performanceSuites || []);
            services.performanceService.setHistory(updatedConfig.performanceHistory || []);
            services.scheduleService.loadSchedules(updatedConfig.performanceSchedules || []);
            return {
                saved: true,
                config: updatedConfig,
                raw: services.settingsManager.getRawConfig()
            };
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

        // ===== Webview Ready (initialization) =====
        ['webviewReady']: async () => {
            console.log('[Sidecar] Webview ready - sending initialization data');

            const result: any = {
                acknowledged: true,
                samplesProject: require('./data/DefaultSamples').SAMPLES_PROJECT
            };

            // Load and send changelog
            try {
                const fs = require('fs');
                const path = require('path');
                // Changelog is in project root, navigate up from sidecar/dist/sidecar/src
                const changelogPath = path.join(__dirname, '../../../../CHANGELOG.md');
                if (fs.existsSync(changelogPath)) {
                    result.changelog = fs.readFileSync(changelogPath, 'utf8');
                    console.log('[Sidecar] Changelog loaded');
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
    };

    return {
        async handle(command: string, payload: any): Promise<any> {
            const handler = handlers[command];

            if (!handler) {
                console.warn(`[Router] Unknown command: ${command}`);
                throw new Error(`Unknown command: ${command}`);
            }

            console.log(`[Router] Handling: ${command}`);
            return await handler(payload);
        }
    };
}

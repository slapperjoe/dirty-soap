/**
 * Command Router - Routes frontend commands to appropriate service methods
 * 
 * Maps FrontendCommand enum values from shared/src/messages.ts
 * to the appropriate service method calls.
 */

import { FrontendCommand } from '../../shared/src/messages';
import { ServiceContainer } from './services';

export interface CommandRouter {
    handle(command: string, payload: any): Promise<any>;
}

export function createCommandRouter(services: ServiceContainer): CommandRouter {
    const handlers: Record<string, (payload: any) => Promise<any>> = {
        // ===== WSDL/SOAP Operations =====
        [FrontendCommand.LoadWsdl]: async (payload) => {
            const { url, localWsdlDir } = payload;
            return await services.soapClient.parseWsdl(url, localWsdlDir);
        },

        [FrontendCommand.ExecuteRequest]: async (payload) => {
            // Frontend sends: url, operation, xml, headers, contentType, etc.
            // Accept both naming conventions
            const endpoint = payload.endpoint || payload.url;
            const operation = payload.operation;
            const args = payload.args || payload.xml;
            const headers = payload.headers || {};

            // Apply content type if provided
            if (payload.contentType && !headers['Content-Type']) {
                headers['Content-Type'] = payload.contentType;
            }

            return await services.soapClient.executeRequest(endpoint, operation, args, headers);
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
            const filePath = payload.filePath || payload.path;
            const { project } = payload;
            if (!filePath) {
                // If no path, this is a new project that needs "Save As" dialog
                // In Tauri standalone, we can't prompt - return error
                throw new Error('No file path provided. Please use "Save Project As" first.');
            }
            await services.folderStorage.saveProject(project, filePath);
            return { saved: true, path: filePath };
        },

        [FrontendCommand.LoadProject]: async (payload) => {
            // Accept both 'filePath' and 'path' from frontend
            const filePath = payload.filePath || payload.path;
            if (!filePath) {
                throw new Error('No file path provided');
            }
            return await services.folderStorage.loadProject(filePath);
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
            return await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
        },

        [FrontendCommand.RunTestSuite]: async (payload) => {
            // TestRunnerService doesn't have runTestSuite, needs to iterate
            const { testSuite, fallbackEndpoint } = payload;
            const results = [];
            for (const testCase of testSuite.testCases || []) {
                const result = await services.testRunnerService.runTestCase(testCase, fallbackEndpoint);
                results.push(result);
            }
            return results;
        },

        // ===== Performance Testing =====
        [FrontendCommand.RunPerformanceSuite]: async (payload) => {
            const { suiteId, environment, variables } = payload;
            return await services.performanceService.runSuite(suiteId, environment, variables);
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

        [FrontendCommand.AddPerformanceSuite]: async (payload) => {
            services.performanceService.addSuite(payload.suite);
            return { added: true };
        },

        [FrontendCommand.UpdatePerformanceSuite]: async (payload) => {
            services.performanceService.updateSuite(payload.id, payload.updates);
            return { updated: true };
        },

        [FrontendCommand.DeletePerformanceSuite]: async (payload) => {
            services.performanceService.deleteSuite(payload.id);
            return { deleted: true };
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
            services.settingsManager.saveConfig(payload);
            return { saved: true };
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
        [FrontendCommand.SaveOpenProjects]: async () => {
            // In Tauri, projects are auto-saved to disk
            // This is a no-op since we use localStorage
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

        [FrontendCommand.SaveUiState]: async () => {
            // UI state is saved to localStorage in Tauri
            return { saved: true };
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

            // Load and send Samples project
            try {
                const { SAMPLES_PROJECT } = require('./data/DefaultSamples');
                if (SAMPLES_PROJECT && SAMPLES_PROJECT.id) {
                    // Send ProjectLoaded message for Samples
                    // We can't directly postMessage, so we return it and the caller handles it
                    // Actually, we need to think about this differently...
                    // The router doesn't have access to send messages back
                    // We need to return the data and let the caller send it
                    console.log('[Sidecar] Samples project ready to send');
                }
            } catch (e) {
                console.error('[Sidecar] Failed to load samples:', e);
            }

            // Load and send changelog
            try {
                const fs = require('fs');
                const path = require('path');
                // Changelog is in project root, navigate up from sidecar/dist/sidecar/src
                const changelogPath = path.join(__dirname, '../../../../CHANGELOG.md');
                if (fs.existsSync(changelogPath)) {
                    const changelog = fs.readFileSync(changelogPath, 'utf8');
                    console.log('[Sidecar] Changelog loaded');
                    return {
                        acknowledged: true,
                        samplesProject: require('./data/DefaultSamples').SAMPLES_PROJECT,
                        changelog
                    };
                }
            } catch (e) {
                console.error('[Sidecar] Failed to load changelog:', e);
            }

            return {
                acknowledged: true,
                samplesProject: require('./data/DefaultSamples').SAMPLES_PROJECT
            };
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

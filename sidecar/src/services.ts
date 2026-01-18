/**
 * Service Container - Holds all backend service instances
 * 
 * Mirrors the service initialization from WebviewPanel.ts
 * but without VS Code dependencies.
 */

import { SoapClient } from '../../src/soapClient';
import { ProxyService } from '../../src/services/ProxyService';
import { MockService } from '../../src/services/MockService';
import { TestRunnerService } from '../../src/services/TestRunnerService';
import { PerformanceService } from '../../src/services/PerformanceService';
import { ScheduleService } from '../../src/services/ScheduleService';
import { ConfigSwitcherService } from '../../src/services/ConfigSwitcherService';
import { FileWatcherService } from '../../src/services/FileWatcherService';
import { RequestHistoryService } from '../../src/services/RequestHistoryService';
import { FolderProjectStorage } from '../../src/FolderProjectStorage';
import { SettingsManager } from '../../src/utils/SettingsManager';

import { SidecarNotificationService } from './adapters/SidecarNotificationService';
import { SidecarConfigService } from './adapters/SidecarConfigService';
import { SidecarSecretStorage } from './adapters/SidecarSecretStorage';

export class ServiceContainer {
    public readonly soapClient: SoapClient;
    public readonly proxyService: ProxyService;
    public readonly mockService: MockService;
    public readonly testRunnerService: TestRunnerService;
    public readonly performanceService: PerformanceService;
    public readonly scheduleService: ScheduleService;
    public readonly configSwitcherService: ConfigSwitcherService;
    public readonly fileWatcherService: FileWatcherService;
    public readonly historyService: RequestHistoryService;
    public readonly folderStorage: FolderProjectStorage;
    public readonly settingsManager: SettingsManager;

    // Platform adapters
    public readonly notificationService: SidecarNotificationService;
    public readonly configService: SidecarConfigService;
    public readonly secretStorage: SidecarSecretStorage;

    private outputLog: string[] = [];

    constructor() {
        // Create platform adapters
        this.notificationService = new SidecarNotificationService();
        this.configService = new SidecarConfigService();
        this.secretStorage = new SidecarSecretStorage();

        // Create output channel mock
        const outputChannel = {
            appendLine: (msg: string) => {
                this.outputLog.push(msg);
                console.log(`[APInox] ${msg}`);
            }
        };

        // Initialize services
        this.settingsManager = new SettingsManager();
        this.soapClient = new SoapClient(this.settingsManager, outputChannel, this.configService);
        this.folderStorage = new FolderProjectStorage(outputChannel);
        this.fileWatcherService = new FileWatcherService(outputChannel, this.settingsManager);

        this.proxyService = new ProxyService(
            { port: 9000, targetUrl: 'http://localhost:8080', systemProxyEnabled: true },
            this.notificationService,
            this.configService
        );
        this.proxyService.setLogger(msg => outputChannel.appendLine(msg));

        this.mockService = new MockService({}, this.notificationService);
        this.mockService.setLogger(msg => outputChannel.appendLine(msg));
        this.mockService.setProxyPort(this.proxyService.getConfig().port);

        // Link mock service to proxy for 'both' mode
        this.proxyService.setMockService(this.mockService);

        this.configSwitcherService = new ConfigSwitcherService();
        this.testRunnerService = new TestRunnerService(this.soapClient, outputChannel);

        this.performanceService = new PerformanceService(this.soapClient);
        this.performanceService.setLogger(msg => outputChannel.appendLine(msg));

        this.scheduleService = new ScheduleService(this.performanceService);

        // Initialize performance data from settings
        const config = this.settingsManager.getConfig();
        this.performanceService.setSuites(config.performanceSuites || []);
        this.performanceService.setHistory(config.performanceHistory || []);
        this.scheduleService.loadSchedules(config.performanceSchedules || []);

        const configDir = this.settingsManager.getConfigDir();
        this.historyService = new RequestHistoryService(configDir);

        console.log('[Sidecar] All services initialized');
    }

    /**
     * Clean up resources when shutting down
     */
    dispose(): void {
        this.proxyService.stop();
        this.mockService.stop();
        this.fileWatcherService.stop();
        console.log('[Sidecar] Services disposed');
    }

    /**
     * Get recent output logs
     */
    getOutputLogs(count: number = 100): string[] {
        return this.outputLog.slice(-count);
    }
}

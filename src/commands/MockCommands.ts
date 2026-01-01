import { ICommand } from './ICommand';
import { MockService } from '../services/MockService';
import { SettingsManager } from '../utils/SettingsManager';
import { ConfigSwitcherService } from '../services/ConfigSwitcherService';
import { MockRule, MockConfig } from '../models';
import * as vscode from 'vscode';

export class StartMockServerCommand implements ICommand {
    constructor(private readonly _mockService: MockService) { }

    async execute(_message: any): Promise<void> {
        this._mockService.start();
    }
}

export class StopMockServerCommand implements ICommand {
    constructor(private readonly _mockService: MockService) { }

    async execute(_message: any): Promise<void> {
        this._mockService.stop();
    }
}

export class UpdateMockConfigCommand implements ICommand {
    constructor(
        private readonly _mockService: MockService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        console.log('[MockCommands] Received updateMockConfig:', message.config);

        const mockConfig: Partial<MockConfig> = {
            port: message.config.port,
            targetUrl: message.config.targetUrl,
            passthroughEnabled: message.config.passthroughEnabled,
            routeThroughProxy: message.config.routeThroughProxy,
            recordMode: message.config.recordMode
        };

        this._mockService.updateConfig(mockConfig);

        // Persist to settings
        this._settingsManager.updateMockConfig(mockConfig);
    }
}

export class UpdateMockRulesCommand implements ICommand {
    constructor(
        private readonly _mockService: MockService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const rules = message.rules as MockRule[];
        this._mockService.setRules(rules);

        // Persist to settings
        this._settingsManager.updateMockRules(rules);
    }
}

export class AddMockRuleCommand implements ICommand {
    constructor(
        private readonly _mockService: MockService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const rule = message.rule as MockRule;
        this._mockService.addRule(rule);

        // Persist to settings
        const allRules = this._mockService.getRules();
        this._settingsManager.updateMockRules(allRules);
    }
}

export class DeleteMockRuleCommand implements ICommand {
    constructor(
        private readonly _mockService: MockService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const ruleId = message.ruleId as string;
        this._mockService.removeRule(ruleId);

        // Persist to settings
        const allRules = this._mockService.getRules();
        this._settingsManager.updateMockRules(allRules);
    }
}

export class ToggleMockRuleCommand implements ICommand {
    constructor(
        private readonly _mockService: MockService,
        private readonly _settingsManager: SettingsManager
    ) { }

    async execute(message: any): Promise<void> {
        const ruleId = message.ruleId as string;
        const enabled = message.enabled as boolean;

        this._mockService.updateRule(ruleId, { enabled });

        // Persist to settings
        const allRules = this._mockService.getRules();
        this._settingsManager.updateMockRules(allRules);
    }
}

export class InjectMockConfigCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _configSwitcherService: ConfigSwitcherService,
        private readonly _mockService: MockService
    ) { }

    async execute(message: any): Promise<void> {
        const config = this._mockService.getConfig();
        const mockUrl = `http://localhost:${config.port}`;

        const injectResult = this._configSwitcherService.inject(message.path, mockUrl);

        if (injectResult.success) {
            vscode.window.showInformationMessage(injectResult.message);
            // Update target URL if we captured the original
            if (injectResult.originalUrl) {
                this._mockService.updateConfig({ targetUrl: injectResult.originalUrl });
                this._panel.webview.postMessage({
                    command: 'updateMockTarget',
                    target: injectResult.originalUrl
                });
            }
        } else {
            vscode.window.showErrorMessage(injectResult.message);
        }

        this._panel.webview.postMessage({
            command: 'mockConfigInjected',
            success: injectResult.success
        });
    }
}

export class RestoreMockConfigCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _configSwitcherService: ConfigSwitcherService
    ) { }

    async execute(message: any): Promise<void> {
        const restoreResult = this._configSwitcherService.restore(message.path);

        if (restoreResult.success) {
            vscode.window.showInformationMessage(restoreResult.message);
        } else {
            vscode.window.showErrorMessage(restoreResult.message);
        }

        this._panel.webview.postMessage({
            command: 'mockConfigRestored',
            success: restoreResult.success
        });
    }
}

export class GetMockStatusCommand implements ICommand {
    constructor(
        private readonly _panel: vscode.WebviewPanel,
        private readonly _mockService: MockService
    ) { }

    async execute(_message: any): Promise<void> {
        const config = this._mockService.getConfig();
        const isRunning = this._mockService.isActive();

        this._panel.webview.postMessage({
            command: 'mockStatus',
            config,
            isRunning
        });
    }
}

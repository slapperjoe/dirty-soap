import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, modify, applyEdits } from 'jsonc-parser';
import { ReplaceRule } from './ReplaceRuleApplier';
import { Breakpoint } from '../services/ProxyService';
import { MockConfig, MockRule, PerformanceSuite, PerformanceRun, PerformanceSchedule, ProxyRule } from '../../shared/src/models';

export interface ApinoxConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        retryCount?: number;
        proxy?: string;
        strictSSL?: boolean;
        proxyRules?: ProxyRule[];
    };
    fileWatcher?: {
        requestPath?: string;
        responsePath?: string;
    };
    ui?: {
        layoutMode?: 'vertical' | 'horizontal';
        showLineNumbers?: boolean;
        alignAttributes?: boolean;
        inlineElementValues?: boolean;
        splitRatio?: number;
    };
    activeEnvironment?: string;
    lastConfigPath?: string;
    lastProxyTarget?: string;
    openProjects?: string[];
    environments?: Record<string, {
        endpoint_url?: string;
        env?: string;
        [key: string]: string | undefined;
    }>;
    globals?: Record<string, string>;
    recentWorkspaces?: string[];
    /** Auto-replace rules for proxy view */
    replaceRules?: ReplaceRule[];
    /** Breakpoints for proxy - pause on matching requests/responses */
    breakpoints?: Breakpoint[];
    /** Mock server configuration */
    mockServer?: MockConfig;
    /** Performance testing suites */
    performanceSuites?: PerformanceSuite[];
    /** Performance run history */
    performanceHistory?: PerformanceRun[];
    /** Scheduled performance runs */
    performanceSchedules?: PerformanceSchedule[];
}

const DEFAULT_CONFIG: ApinoxConfig = {
    version: 1,
    network: {
        defaultTimeout: 30,
        retryCount: 3,
        proxy: "",
        strictSSL: true
    },
    ui: {
        layoutMode: 'vertical',
        showLineNumbers: true,
        alignAttributes: false,
        inlineElementValues: false,
        splitRatio: 0.5
    },
    activeEnvironment: 'Build',
    environments: {
        'Build': {
            endpoint_url: 'http://bld02.acme.com',
            env: 'bld02',
            _comment: 'Use {{url}} as shortcut for endpoint_url'
        },
        'DIT': { endpoint_url: 'http://dit.example.com', env: 'dit01' },
        'SIT': { endpoint_url: 'http://sit.example.com', env: 'sit01' },
        'Perf': { endpoint_url: 'http://perf.example.com', env: 'pft01' },
        'Prod': { endpoint_url: 'http://prod.example.com', env: 'prd01' }
    },
    globals: {
        apiKey: '12345',
        _comment: 'Variables here apply to all environments'
    },
    recentWorkspaces: [],
    lastConfigPath: ""
};

export class SettingsManager {
    private configDir: string;
    private configPath: string;
    private autosavePath: string;
    public scriptsDir: string;

    constructor() {
        this.configDir = path.join(os.homedir(), '.apinox');
        this.configPath = path.join(this.configDir, 'config.jsonc');
        this.autosavePath = path.join(this.configDir, 'autosave.xml');
        this.scriptsDir = path.join(this.configDir, 'scripts');
        this.ensureConfigDir();
        this.ensureScriptsDir();
        console.log(`SettingsManager initialized. Config Path: ${this.configPath}`);
    }

    private ensureConfigDir() {
        if (!fs.existsSync(this.configDir)) {
            fs.mkdirSync(this.configDir, { recursive: true });
        }
    }

    private ensureScriptsDir() {
        if (!fs.existsSync(this.scriptsDir)) {
            fs.mkdirSync(this.scriptsDir, { recursive: true });
        }
    }

    public getConfigDir(): string {
        return this.configDir;
    }

    public getConfig(): ApinoxConfig {
        if (!fs.existsSync(this.configPath)) {
            this.saveConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }

        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const config = parse(content);

            // Filter out read-only sample projects that might have been accidentally saved
            if (config?.openProjects && Array.isArray(config.openProjects)) {
                const originalLength = config.openProjects.length;
                config.openProjects = config.openProjects.filter((p: string) => p !== 'Samples' && p !== 'samples-project-read-only');

                // If we filtered invalid projects, update the file on screen to clean the dirty state
                if (config.openProjects.length < originalLength) {
                    console.log(`[SettingsManager] Cleaning invalid projects from config (removed ${originalLength - config.openProjects.length} items)`);
                    // We call updateOpenProjects which triggers a save via jsonc-parser
                    // Use setTimeout to avoid blocking/recursion in synchronous getConfig
                    setTimeout(() => this.updateOpenProjects(config.openProjects), 0);
                }
            }
            // Merge with default to ensure all fields exist
            return { ...DEFAULT_CONFIG, ...config, ui: { ...DEFAULT_CONFIG.ui, ...config?.ui }, network: { ...DEFAULT_CONFIG.network, ...config?.network } };
        } catch (error) {
            console.error('Failed to parse config:', error);
            return DEFAULT_CONFIG;
        }
    }

    public getRawConfig(): string {
        if (!fs.existsSync(this.configPath)) {
            this.saveConfig(DEFAULT_CONFIG);
        }
        const content = fs.readFileSync(this.configPath, 'utf8');
        if (!content || content.trim().length === 0) {
            // File exists but is empty/corrupt. Re-write defaults.
            this.updateConfigPath([], DEFAULT_CONFIG); // Use updateConfigPath to get nice formatting with comments if possible
            return fs.readFileSync(this.configPath, 'utf8');
        }
        return content;
    }

    public saveConfig(config: ApinoxConfig) {
        // We write strict JSON if we are overwriting everything from an object,
        // but ideally we should preserve comments if we were editing specific fields.
        // For this basic implementation, if we save the whole object, we loose comments unless we use the raw editor.
        // The raw editor will use saveRawConfig.
        // This method is for programmatic updates (like toggles).

        if (!fs.existsSync(this.configPath)) {
            // Initialize with default JSON string with comments if creating new
            // currentContent = JSON.stringify(DEFAULT_CONFIG, null, 2); 
            // Logic not needed if we overwrite below
        }

        // NOTE: JSONC comment handling is implemented via updateConfigPath() method
        // which uses jsonc-parser's modify() to preserve comments during updates.
        // This method (saveConfig) is only used for full config overwrites where comments are expected to be lost.

        // This is a bit tricky. If we just dump JSON, we kill comments.
        // We should try to update specific paths if possible, or just overwrite if it's a structural save.
        // For safe programmatic updates (toggles), we should use jsonc-parser modifiers.
        // But for "saveSettings" from extension, we probably want to save what the user sent if they edited raw.

        // For now, if we are saving full config object programmatically, we might lose comments.
        // Let's implement specific updaters instead for UI state to preserve comments.

        const content = JSON.stringify(config, null, 2);
        fs.writeFileSync(this.configPath, content);
    }

    public updateUiState(ui: ApinoxConfig['ui']) {
        this.updateConfigPath(['ui'], ui);
    }

    public updateActiveEnvironment(envName: string) {
        this.updateConfigPath(['activeEnvironment'], envName);
    }

    public updateLastConfigPath(path: string) {
        this.updateConfigPath(['lastConfigPath'], path);
    }

    public updateLastProxyTarget(target: string) {
        this.updateConfigPath(['lastProxyTarget'], target);
    }

    public updateOpenProjects(paths: string[]) {
        this.updateConfigPath(['openProjects'], paths);
    }

    public updateMockConfig(config: Partial<MockConfig>) {
        const current = this.getConfig();
        const updated = { ...current.mockServer, ...config };
        this.updateConfigPath(['mockServer'], updated);
    }

    public updateMockRules(rules: MockRule[]) {
        this.updateConfigPath(['mockServer', 'rules'], rules);
    }

    public getMockConfig(): MockConfig | undefined {
        return this.getConfig().mockServer;
    }

    public updatePerformanceSuites(suites: PerformanceSuite[]) {
        this.updateConfigPath(['performanceSuites'], suites);
    }

    public updatePerformanceHistory(history: PerformanceRun[]) {
        this.updateConfigPath(['performanceHistory'], history);
    }

    public updatePerformanceSchedules(schedules: import('../../shared/src/models').PerformanceSchedule[]) {
        this.updateConfigPath(['performanceSchedules'], schedules);
    }

    public updateFileWatcherConfig(config: { requestPath?: string; responsePath?: string }) {
        this.updateConfigPath(['fileWatcher'], config);
    }

    public saveRawConfig(content: string) {
        fs.writeFileSync(this.configPath, content);
    }

    public getAutosave(): string | null {
        if (fs.existsSync(this.autosavePath)) {
            try {
                const content = fs.readFileSync(this.autosavePath, 'utf8');
                const state = JSON.parse(content);
                // Filter out Samples
                if (state.projects) {
                    state.projects = state.projects.filter((p: any) => p.name !== 'Samples' && p.id !== 'samples-project-read-only');
                }
                return JSON.stringify(state);
            } catch (e) {
                console.error('Failed to parse autosave', e);
                return null;
            }
        }
        return null;
    }

    public saveAutosave(content: string) {
        try {
            const state = JSON.parse(content);
            // Filter out Samples
            if (state.projects) {
                state.projects = state.projects.filter((p: any) => p.name !== 'Samples' && p.id !== 'samples-project-read-only');
            }
            const cleanContent = JSON.stringify(state);
            fs.writeFileSync(this.autosavePath, cleanContent);
        } catch (e) {
            console.error('Failed to parse content for autosave', e);
            // Fallback: write original (risky but better than crashing) - actually if parse fails, writing it likely writes bad data.
            // But we should prioritize not crashing.
            fs.writeFileSync(this.autosavePath, content);
        }
    }

    public updateConfigFromObject(config: ApinoxConfig) {
        // Iterate top-level keys and update them individually to best preserve structure/comments
        // We skip 'version' usually, but can update it.
        const keys = Object.keys(config) as (keyof ApinoxConfig)[];
        keys.forEach(key => {
            // If it's a complex object like 'ui' or 'network', we could just replace the whole node
            // jsonc-parser modify should handle replacing the object value while keeping surrounding comments.
            // If the value is undefined, we might skip or remove (modify with undefined removes).
            if (config[key] !== undefined) {
                this.updateConfigPath([key], config[key]);
            }
        });
    }

    private updateConfigPath(jsonPath: (string | number)[], value: any) {
        let content = "{}";
        if (fs.existsSync(this.configPath)) {
            content = fs.readFileSync(this.configPath, 'utf8');
        }

        const template = `{
  "version": 1,
  "network": {
    "defaultTimeout": 30,
    "retryCount": 3,
    "proxy": ""
  },
  "ui": {
    "layoutMode": "vertical",
    "showLineNumbers": true,
    "alignAttributes": false,
    "inlineElementValues": false,
    "splitRatio": 0.5
  },
  "activeEnvironment": "Build",
  "environments": {
    "Build": {
      "endpoint_url": "http://bld02.acme.com",
      "env": "bld02"
      // Use {{url}} as shortcut for endpoint_url
    },
    // Add more environments here
    "DIT": { "endpoint_url": "http://dit.example.com", "env": "dit01" },
    "SIT": { "endpoint_url": "http://sit.example.com", "env": "sit01" },
    "Perf": { "endpoint_url": "http://perf.example.com", "env": "pft01" },
    "Prod": { "endpoint_url": "http://prod.example.com", "env": "prd01" }
  },
  "globals": {
    "apiKey": "12345"
    // Variables here apply to all environments
  },
  "recentWorkspaces": []
}`;

        // If content is empty or corrupt, use template
        if (!content || content.trim().length === 0 || content === "{}") {
            content = template;
        }

        const edits = modify(content, jsonPath, value, { formattingOptions: { tabSize: 2, insertSpaces: true } });
        const newContent = applyEdits(content, edits);
        fs.writeFileSync(this.configPath, newContent);
    }
}

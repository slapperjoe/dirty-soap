import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { parse, modify, applyEdits } from 'jsonc-parser';

export interface DirtySoapConfig {
    version: number;
    network?: {
        defaultTimeout?: number;
        retryCount?: number;
        proxy?: string;
    };
    ui?: {
        layoutMode?: 'vertical' | 'horizontal';
        showLineNumbers?: boolean;
        alignAttributes?: boolean;
        inlineElementValues?: boolean;
        splitRatio?: number;
    };
    activeEnvironment?: string;
    environments?: Record<string, {
        endpoint_url?: string;
        env?: string;
        [key: string]: string | undefined;
    }>;
    globals?: Record<string, string>;
    recentWorkspaces?: string[];
    lastConfigPath?: string;
}

const DEFAULT_CONFIG: DirtySoapConfig = {
    version: 1,
    network: {
        defaultTimeout: 30,
        retryCount: 3,
        proxy: ""
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
        this.configDir = path.join(os.homedir(), '.dirty-soap');
        this.configPath = path.join(this.configDir, 'config.jsonc');
        this.autosavePath = path.join(this.configDir, 'autosave.xml');
        this.scriptsDir = path.join(this.configDir, 'scripts');
        this.ensureConfigDir();
        this.ensureScriptsDir();
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

    public getConfig(): DirtySoapConfig {
        if (!fs.existsSync(this.configPath)) {
            this.saveConfig(DEFAULT_CONFIG);
            return DEFAULT_CONFIG;
        }

        try {
            const content = fs.readFileSync(this.configPath, 'utf8');
            const config = parse(content);
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
        return fs.readFileSync(this.configPath, 'utf8');
    }

    public saveConfig(config: DirtySoapConfig) {
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

        // TODO: Comment/jsonc handling

        // This is a bit tricky. If we just dump JSON, we kill comments.
        // We should try to update specific paths if possible, or just overwrite if it's a structural save.
        // For safe programmatic updates (toggles), we should use jsonc-parser modifiers.
        // But for "saveSettings" from extension, we probably want to save what the user sent if they edited raw.

        // For now, if we are saving full config object programmatically, we might lose comments.
        // Let's implement specific updaters instead for UI state to preserve comments.

        const content = JSON.stringify(config, null, 2);
        fs.writeFileSync(this.configPath, content);
    }

    public updateUiState(ui: DirtySoapConfig['ui']) {
        this.updateConfigPath(['ui'], ui);
    }

    public updateActiveEnvironment(envName: string) {
        this.updateConfigPath(['activeEnvironment'], envName);
    }

    public updateLastConfigPath(path: string) {
        this.updateConfigPath(['lastConfigPath'], path);
    }

    public saveRawConfig(content: string) {
        fs.writeFileSync(this.configPath, content);
    }

    public getAutosave(): string | null {
        if (fs.existsSync(this.autosavePath)) {
            return fs.readFileSync(this.autosavePath, 'utf8');
        }
        return null;
    }

    public saveAutosave(content: string) {
        fs.writeFileSync(this.autosavePath, content);
    }

    private updateConfigPath(jsonPath: (string | number)[], value: any) {
        let content = "{}";
        if (fs.existsSync(this.configPath)) {
            content = fs.readFileSync(this.configPath, 'utf8');
        } else {
            // Initialize with default JSONC string with comments
            content = `{
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
        }

        const edits = modify(content, jsonPath, value, { formattingOptions: { tabSize: 2, insertSpaces: true } });
        const newContent = applyEdits(content, edits);
        fs.writeFileSync(this.configPath, newContent);
    }
}

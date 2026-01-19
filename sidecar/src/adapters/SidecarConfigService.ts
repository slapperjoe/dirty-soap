/**
 * Sidecar Config Service
 * 
 * Reads configuration from environment variables
 * and a local config file.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IConfigService } from '../../../src/interfaces/IConfigService';

export class SidecarConfigService implements IConfigService {
    private config: Record<string, any> = {};
    private configPath: string;

    constructor() {
        const envConfigDir = process.env.APINOX_CONFIG_DIR;
        const baseDir = envConfigDir && envConfigDir.trim().length > 0
            ? envConfigDir
            : path.join(os.homedir(), '.apinox');
        this.configPath = path.join(baseDir, 'config.json');
        this.loadConfig();
    }

    private loadConfig(): void {
        try {
            if (fs.existsSync(this.configPath)) {
                const content = fs.readFileSync(this.configPath, 'utf-8');
                this.config = JSON.parse(content);
            }
        } catch (error) {
            console.warn('[SidecarConfig] Failed to load config file:', error);
        }
    }

    get<T>(section: string, key: string, defaultValue?: T): T | undefined {
        const sectionConfig = this.config[section];
        if (sectionConfig && key in sectionConfig) {
            return sectionConfig[key] as T;
        }
        return defaultValue;
    }

    getProxyUrl(): string | undefined {
        // Check config first, then environment
        const configProxy = this.get<string>('http', 'proxy');
        if (configProxy) return configProxy;

        return process.env.HTTPS_PROXY ||
            process.env.HTTP_PROXY ||
            process.env.https_proxy ||
            process.env.http_proxy;
    }

    getStrictSSL(): boolean {
        // Check config first
        const configSSL = this.get<boolean>('http', 'proxyStrictSSL');
        if (configSSL !== undefined) return configSSL;

        // Check environment
        const envValue = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        if (envValue === '0') return false;

        return true;
    }
}

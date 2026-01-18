import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SettingsManager } from '../utils/SettingsManager';


export interface WatcherEvent {
    id: string;
    timestamp: number;
    timestampLabel: string;
    requestFile: string;
    responseFile: string;
    requestContent?: string;
    responseContent?: string;
    requestOperation?: string;
    responseOperation?: string;
}

export class FileWatcherService {
    private outputChannel: any;
    private requestPath: string;
    private responsePath: string;
    private history: WatcherEvent[] = [];
    private onUpdateCallback: ((history: WatcherEvent[]) => void) | undefined;
    private watchers: fs.FSWatcher[] = [];

    // Debounce timers
    private requestTimer: NodeJS.Timeout | undefined;
    private responseTimer: NodeJS.Timeout | undefined;

    // Correlation tracking
    private pendingRequestId: string | null = null;

    private settingsManager: SettingsManager;

    constructor(outputChannel: any, settingsManager: SettingsManager) {
        this.outputChannel = outputChannel;
        this.settingsManager = settingsManager;

        this.requestPath = this.resolvePath('requestPath', 'requestXML.xml');
        this.responsePath = this.resolvePath('responsePath', 'responseXML.xml');
    }

    private resolvePath(settingKey: 'requestPath' | 'responsePath', defaultFilename: string): string {
        const config = this.settingsManager.getConfig();
        const configuredPath = config.fileWatcher?.[settingKey];

        if (configuredPath && configuredPath.trim().length > 0) {
            return configuredPath;
        }

        if (os.platform() === 'win32') {
            const winTemp = 'c:\\temp';
            // Ensure c:\temp exists if we are going to use it as default
            try {
                if (!fs.existsSync(winTemp)) {
                    // We don't create c:\temp automatically as it might require permissions, 
                    // but we default to it as requested. 
                    // If it doesn't exist, the watcher will log an error/wait.
                }
            } catch (e) { /* ignore */ }
            return path.join(winTemp, defaultFilename);
        }

        return path.join(os.tmpdir(), defaultFilename);
    }

    public reloadConfiguration() {
        this.requestPath = this.resolvePath('requestPath', 'requestXML.xml');
        this.responsePath = this.resolvePath('responsePath', 'responseXML.xml');
        this.log(`Configuration reloaded. Watching: Request=${this.requestPath}, Response=${this.responsePath}`);
        this.start(); // Restart with new paths
    }

    private log(message: string) {
        if (this.outputChannel) {
            this.outputChannel.appendLine(`[Watcher] ${message}`);
        }
    }

    public setCallback(callback: (history: WatcherEvent[]) => void) {
        this.onUpdateCallback = callback;
    }

    private extractOperationName(xml: string): string | undefined {
        try {
            // matches <soap:Body> or <Body> then finds the next tag's name
            const match = xml.match(/<(?:\w+:)?Body[^>]*>\s*<(?:\w+:)?(\w+)/i);
            return match ? match[1] : undefined;
        } catch (e) {
            return undefined;
        }
    }

    public start() {
        this.stop(); // Clear existing

        this.log('Starting File Watcher...');

        if (fs.existsSync(this.requestPath)) {
            this.watchFile(this.requestPath, 'request');
            // Initial Read
            this.processRequestChange();
        } else {
            this.log(`Request file not found at ${this.requestPath} - attempting to watch directory or waiting for creation...`);
        }

        if (fs.existsSync(this.responsePath)) {
            this.watchFile(this.responsePath, 'response');
            // Initial Read - only if we have requests, or maybe just check?
            // Actually, processResponseChange tries to attach to pending. 
            // If we just started, we might have a request from the line above.
            setTimeout(() => this.processResponseChange(), 200);
        } else {
            this.log(`Response file not found at ${this.responsePath}`);
        }
    }

    public stop() {
        this.watchers.forEach(w => w.close());
        this.watchers = [];
        this.log('Stopped File Watcher.');
    }

    public getHistory(): WatcherEvent[] {
        return this.history;
    }

    public clearHistory() {
        this.history = [];
        this.emitUpdate();
        this.log('History cleared.');
    }

    private watchFile(filePath: string, type: 'request' | 'response') {
        try {
            this.log(`Watching ${filePath}`);
            const watcher = fs.watch(filePath, (eventType, _filename) => {
                if (eventType === 'change') {
                    this.handleFileChange(type);
                }
            });
            this.watchers.push(watcher);
        } catch (e: any) {
            this.log(`Failed to watch ${filePath}: ${e.message}`);
        }
    }

    private handleFileChange(type: 'request' | 'response') {
        if (type === 'request') {
            if (this.requestTimer) clearTimeout(this.requestTimer);
            this.requestTimer = setTimeout(() => this.processRequestChange(), 100);
        } else {
            if (this.responseTimer) clearTimeout(this.responseTimer);
            this.responseTimer = setTimeout(() => this.processResponseChange(), 100);
        }
    }

    private processRequestChange() {
        try {
            const content = fs.readFileSync(this.requestPath, 'utf8');
            const now = new Date();
            const id = now.getTime().toString();
            const opName = this.extractOperationName(content);

            const event: WatcherEvent = {
                id: id,
                timestamp: now.getTime(),
                timestampLabel: now.toLocaleTimeString(),
                requestFile: this.requestPath,
                responseFile: this.responsePath,
                requestContent: content,
                responseContent: undefined, // Waiting for response
                requestOperation: opName
            };

            this.history.unshift(event); // Add to top
            this.pendingRequestId = id; // Mark as pending for response

            // Limit history size
            if (this.history.length > 50) {
                this.history.pop();
            }

            this.emitUpdate();
            this.log(`Captured Request Change (${id}) - ${opName || 'Unknown Op'}`);
        } catch (e: any) {
            this.log(`Error reading request file: ${e.message}`);
        }
    }

    private processResponseChange() {
        try {
            const content = fs.readFileSync(this.responsePath, 'utf8');

            // Try to find the pending request, or the latest one
            let targetEvent: WatcherEvent | undefined;

            if (this.pendingRequestId) {
                targetEvent = this.history.find(h => h.id === this.pendingRequestId);
            }

            // If no specific pending request, valid assumption is the most recent one 
            // if it happened recently (e.g. within last few seconds)
            if (!targetEvent && this.history.length > 0) {
                targetEvent = this.history[0];
            }

            if (targetEvent) {
                targetEvent.responseContent = content;
                targetEvent.responseOperation = this.extractOperationName(content);
                this.pendingRequestId = null; // Clear pending
                this.emitUpdate();
                this.log(`Captured Response Change for ${targetEvent.id} - ${targetEvent.responseOperation || 'Unknown'}`);
            } else {
                // Orphan response? Create a new event just for it?
                // For now, let's ignore or log orphan
                this.log('Captured Response but no matching Request found in recent history.');
            }
        } catch (e: any) {
            this.log(`Error reading response file: ${e.message}`);
        }
    }

    private emitUpdate() {
        if (this.onUpdateCallback) {
            this.onUpdateCallback(this.history);
        }
    }
}

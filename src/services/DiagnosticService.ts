import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';

export interface LogEntry {
    timestamp: string;
    category: 'FRONTEND' | 'BACKEND' | 'BRIDGE_IN' | 'BRIDGE_OUT' | 'ERROR';
    message: string;
    data?: any;
}

export class DiagnosticService {
    private static instance: DiagnosticService;
    private logStream: fs.WriteStream | null = null;
    private currentLogPath = '';
    private isRecording = true;

    private constructor() {
        this.initializeLogStream();
    }

    private initializeLogStream() {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const fileName = `apinox-diagnostics-${timestamp}.jsonl`;

            // Use system temp directory
            const tempDir = os.tmpdir();
            let logDir = path.join(tempDir, 'dirty-soap-diagnostics');

            // Fallback to .apinox if temp creation fails
            try {
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
            } catch (e) {
                console.warn('[DiagnosticService] Failed to create temp dir, falling back to home dir', e);
                logDir = path.join(os.homedir(), '.apinox', 'diagnostics');
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
            }

            this.currentLogPath = path.join(logDir, fileName);
            this.logStream = fs.createWriteStream(this.currentLogPath, { flags: 'a' });

            // Write header
            const header = {
                type: 'HEADER',
                timestamp: new Date().toISOString(),
                platform: os.platform(),
                release: os.release(),
                version: '1.0'
            };
            this.logStream.write(JSON.stringify(header) + '\n');
            console.log(`[DiagnosticService] Logging to ${this.currentLogPath}`);

            this.cleanupOldLogs(logDir);

        } catch (error) {
            console.error('[DiagnosticService] Failed to initialize log stream', error);
        }
    }

    private cleanupOldLogs(logDir: string) {
        try {
            const retentionDays = 7;
            const cleanupCutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

            const files = fs.readdirSync(logDir);
            for (const file of files) {
                if (file.startsWith('apinox-diagnostics-') && file.endsWith('.jsonl')) {
                    const filePath = path.join(logDir, file);
                    const stats = fs.statSync(filePath);
                    if (stats.mtimeMs < cleanupCutoff) {
                        try {
                            fs.unlinkSync(filePath);
                            console.log(`[DiagnosticService] Deleted old log file: ${file}`);
                        } catch (err) {
                            console.error(`[DiagnosticService] Failed to delete old log file: ${file}`, err);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[DiagnosticService] Failed to cleanup old logs', error);
        }
    }

    public static getInstance(): DiagnosticService {
        if (!DiagnosticService.instance) {
            DiagnosticService.instance = new DiagnosticService();
        }
        return DiagnosticService.instance;
    }

    public log(category: LogEntry['category'], message: string, data?: any) {
        if (!this.isRecording) return;

        const entry: LogEntry = {
            timestamp: new Date().toISOString(),
            category,
            message,
            data
        };

        // Write to file
        if (this.logStream) {
            this.logStream.write(JSON.stringify(entry) + '\n');
        }

        // Echo to console for dev loop visibility
        if (category === 'ERROR') {
            console.error(`[${category}] ${message}`, data || '');
        } else {
            console.log(`[${category}] ${message}`, data || '');
        }
    }

    public getLogPath(): string {
        return this.currentLogPath;
    }

    public setRecording(enabled: boolean) {
        this.isRecording = enabled;
        if (enabled) {
            this.log('BACKEND', 'Diagnostic recording started');
        } else {
            this.log('BACKEND', 'Diagnostic recording stopped');
        }
    }

    // Deprecated but kept for compatibility with existing calls, now just returns current path
    public async exportLogs(_context?: vscode.ExtensionContext): Promise<string> {
        return this.currentLogPath;
    }
}

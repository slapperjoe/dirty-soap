import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RequestHistoryEntry, HistoryConfig } from '../../shared/src/models';

/**
 * Service for managing request history
 * Stores history in ~/.dirty-soap/history.json
 */
export class RequestHistoryService {
    private historyPath: string;
    private entries: RequestHistoryEntry[] = [];
    private config: HistoryConfig = {
        maxEntries: 100,
        groupBy: 'time',
        autoClear: false
    };

    constructor(configDir: string) {
        const resolvedDir = configDir || path.join(os.homedir(), '.apinox');
        if (!fs.existsSync(resolvedDir)) {
            fs.mkdirSync(resolvedDir, { recursive: true });
        }
        this.historyPath = path.join(resolvedDir, 'history.json');
        this.load();
    }

    /**
     * Add a new request to history
     */
    addEntry(entry: RequestHistoryEntry): void {
        // Add to beginning of array (most recent first)
        this.entries.unshift(entry);

        // Trim to max entries
        if (this.entries.length > this.config.maxEntries) {
            this.entries = this.entries.slice(0, this.config.maxEntries);
        }

        this.save();
    }

    /**
     * Get all history entries
     */
    getAll(): RequestHistoryEntry[] {
        return this.entries;
    }

    /**
     * Get starred entries only
     */
    getStarred(): RequestHistoryEntry[] {
        return this.entries.filter(e => e.starred);
    }

    /**
     * Toggle star status of an entry
     */
    toggleStar(id: string): void {
        const entry = this.entries.find(e => e.id === id);
        if (entry) {
            entry.starred = !entry.starred;
            this.save();
        }
    }

    /**
     * Delete a specific entry
     */
    deleteEntry(id: string): void {
        this.entries = this.entries.filter(e => e.id !== id);
        this.save();
    }

    /**
     * Clear all history
     */
    clearAll(): void {
        this.entries = [];
        this.save();
    }

    /**
     * Clear entries older than specified days
     */
    clearOlderThan(days: number): void {
        const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
        this.entries = this.entries.filter(e => e.timestamp > cutoff);
        this.save();
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<HistoryConfig>): void {
        this.config = { ...this.config, ...config };

        // Adjust entries if maxEntries changed
        if (config.maxEntries && this.entries.length > config.maxEntries) {
            this.entries = this.entries.slice(0, config.maxEntries);
        }

        this.save();
    }

    /**
     * Get current configuration
     */
    getConfig(): HistoryConfig {
        return this.config;
    }

    /**
     * Save history to disk
     */
    private save(): void {
        try {
            const data = {
                version: 1,
                config: this.config,
                entries: this.entries
            };
            fs.writeFileSync(this.historyPath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save request history:', error);
        }
    }

    /**
     * Load history from disk
     */
    private load(): void {
        try {
            if (fs.existsSync(this.historyPath)) {
                const content = fs.readFileSync(this.historyPath, 'utf8');
                const data = JSON.parse(content);

                this.config = data.config || this.config;
                this.entries = data.entries || [];
            }
        } catch (error) {
            console.error('Failed to load request history:', error);
            // Start with empty history
            this.entries = [];
        }
    }
}

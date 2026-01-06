import { RequestHistoryEntry } from '@shared/models';
import { RequestHistoryService } from '../services/RequestHistoryService';

/**
 * Command handler for request history operations
 */
export class HistoryCommand {
    constructor(private historyService: RequestHistoryService) { }

    /**
     * Get all history entries
     */
    getHistory(): RequestHistoryEntry[] {
        return this.historyService.getAll();
    }

    /**
     * Get starred entries only
     */
    getStarred(): RequestHistoryEntry[] {
        return this.historyService.getStarred();
    }

    /**
     * Toggle star status
     */
    toggleStar(id: string): void {
        this.historyService.toggleStar(id);
    }

    /**
     * Delete an entry
     */
    deleteEntry(id: string): void {
        this.historyService.deleteEntry(id);
    }

    /**
     * Clear all history
     */
    clearAll(): void {
        this.historyService.clearAll();
    }

    /**
     * Add entry to history (called after request execution)
     */
    addEntry(entry: RequestHistoryEntry): void {
        this.historyService.addEntry(entry);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return this.historyService.getConfig();
    }

    /**
     * Update configuration
     */
    updateConfig(config: any) {
        this.historyService.updateConfig(config);
    }
}

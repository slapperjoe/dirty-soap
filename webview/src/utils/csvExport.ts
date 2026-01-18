/**
 * CSV Export Utilities
 * 
 * Provides functions to export data arrays to CSV format.
 */

/**
 * Escape a value for CSV (handle commas, quotes, newlines)
 */
function escapeCsvValue(value: any): string {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Convert an array of objects to CSV string
 */
function toCSV<T extends Record<string, any>>(
    data: T[],
    columns: { key: keyof T; header: string }[]
): string {
    if (data.length === 0) return '';

    // Header row
    const header = columns.map(c => escapeCsvValue(c.header)).join(',');

    // Data rows
    const rows = data.map(item =>
        columns.map(c => escapeCsvValue(item[c.key])).join(',')
    );

    return [header, ...rows].join('\r\n');
}

/**
 * Download a CSV string as a file
 */
function downloadCSV(csvContent: string, filename: string): void {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Export watcher events to CSV
 */
export function exportWatcherEvents(events: Array<{
    id: string;
    timestamp: number;
    type: string;
    method: string;
    url: string;
    status?: number;
    duration?: number;
}>, filename = 'watcher_events'): void {
    const columns = [
        { key: 'timestamp' as const, header: 'Timestamp' },
        { key: 'type' as const, header: 'Type' },
        { key: 'method' as const, header: 'Method' },
        { key: 'url' as const, header: 'URL' },
        { key: 'status' as const, header: 'Status' },
        { key: 'duration' as const, header: 'Duration (ms)' }
    ];

    const formattedData = events.map(e => ({
        ...e,
        timestamp: new Date(e.timestamp).toISOString()
    }));

    const csv = toCSV(formattedData, columns);
    downloadCSV(csv, `${filename}_${Date.now()}`);
}

/**
 * Export proxy history events to CSV  
 */

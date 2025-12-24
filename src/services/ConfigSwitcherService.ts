import * as fs from 'fs';
import * as path from 'path';

export class ConfigSwitcherService {

    /**
     * Injects the proxy URL into the given config file.
     * Backs up the original file to {fileName}.original
     */
    public inject(filePath: string, proxyBaseUrl: string): { success: boolean, message: string, originalUrl?: string } {
        try {
            if (!fs.existsSync(filePath)) {
                return { success: false, message: 'File not found.' };
            }

            const backupPath = filePath + '.original';

            // 1. Create Backup if not exists
            if (!fs.existsSync(backupPath)) {
                fs.copyFileSync(filePath, backupPath);
            }

            // 2. Read content
            let content = fs.readFileSync(filePath, 'utf8');

            // 3. Replace endpoint addresses
            // Strategy: Look for address="..." attributes in <endpoint> tags.
            const regex = /address="(http|https):\/\/[^/"]+(\/.*?)?"/g;

            let matchCount = 0;
            let capturedUrl = '';

            const newContent = content.replace(regex, (match, protocol, path) => {
                matchCount++;
                // Reconstruct the original matched URL base (approximate, since regex matches the whole attribute value logic)
                // Actually my regex `address="(http...` matches the whole attribute. 
                // Let's rely on capturing the FULL url inside the quotes if possible.
                // Adjusted regex for capturing: /address="((http|https):\/\/[^"]+)"/g

                // Wait, the previous regex was: /address="(http|https):\/\/[^/"]+(\/.*?)?"/g
                // Let's refine it to be safer and capture the original full URL for the first match.

                // We want to replace the HOST:PORT but keep the PATH if we are proxying...
                // BUT the user request says: "config switcher inject should be able to use the value replaced to update the target."
                // Usually the target is the BASE URL.
                // If the config has multiple endpoints with different paths, we can't easily set ONE target.
                // Assumption: They all point to the same service base.

                // Let's capture the first full match.

                return match;
            });

            // RERUN with better logic:
            // capturing the first match's base URL.

            // New Regex to capture the URL inside quotes
            const urlRegex = /address="((http|https):\/\/[^"]+)"/g;

            const newContent2 = content.replace(urlRegex, (match, fullUrl) => {
                matchCount++;
                if (!capturedUrl) capturedUrl = fullUrl; // Capture first

                // We want to replace `fullUrl` with `proxyBaseUrl` (which is http://localhost:9000).
                // But wait, `proxyBaseUrl` usually doesn't have the path. 
                // If `fullUrl` is `http://remote.com/service`, and `proxyBaseUrl` is `http://localhost:9000`.
                // We want `address="http://localhost:9000/service"`.

                try {
                    const parsedObj = new URL(fullUrl);
                    // Construct new URL with proxy host
                    // proxyBaseUrl passed in is `http://localhost:9000`
                    const proxyObj = new URL(proxyBaseUrl);
                    parsedObj.protocol = proxyObj.protocol;
                    parsedObj.host = proxyObj.host;
                    // keep pathname
                    return `address="${parsedObj.toString()}"`;
                } catch (e) {
                    // Fallback
                    return `address="${proxyBaseUrl}"`;
                }
            });

            if (matchCount === 0) {
                return { success: false, message: 'No suitable endpoint addresses found to replace.' };
            }

            // 4. Write modified content
            fs.writeFileSync(filePath, newContent2, 'utf8');

            return {
                success: true,
                message: `Successfully injected proxy into ${matchCount} endpoints. Backup created.`,
                originalUrl: capturedUrl // Return the first captured URL as the likely target
            };

        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    /**
     * Restores the config file from {fileName}.original
     */
    public restore(filePath: string): { success: boolean, message: string } {
        try {
            const backupPath = filePath + '.original';

            if (!fs.existsSync(backupPath)) {
                return { success: false, message: 'Backup file (.original) not found. Cannot restore.' };
            }

            // 1. Restore file
            fs.copyFileSync(backupPath, filePath);

            // 2. Delete backup
            fs.unlinkSync(backupPath);

            return { success: true, message: 'Successfully restored original configuration.' };

        } catch (error: any) {
            return { success: false, message: `Error: ${error.message}` };
        }
    }

    public isProxied(filePath: string): boolean {
        const backupPath = filePath + '.original';
        return fs.existsSync(backupPath);
    }
}

/**
 * send-request command
 * 
 * Send a single SOAP request (useful for AI agents).
 */

import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');
import axios from 'axios';

interface SendRequestOptions {
    endpoint: string;
    action?: string;
    body?: string;
    header: string[];
    format: 'json' | 'xml';
}

export async function sendRequestCommand(options: SendRequestOptions): Promise<void> {
    try {
        const { endpoint, action, body, header, format } = options;

        // Parse body - could be inline XML or @filename
        let requestBody = body || '';
        if (requestBody.startsWith('@')) {
            const filePath = requestBody.slice(1);
            if (!fs.existsSync(filePath)) {
                console.error(chalk.red(`Body file not found: ${filePath}`));
                process.exit(1);
            }
            requestBody = fs.readFileSync(filePath, 'utf-8');
        }

        // Parse headers
        const headers: Record<string, string> = {
            'Content-Type': 'text/xml; charset=utf-8'
        };
        if (action) {
            headers['SOAPAction'] = action;
        }
        for (const h of header) {
            const [key, ...valueParts] = h.split('=');
            if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join('=').trim();
            }
        }

        console.error(chalk.cyan(`\n📤 Sending request to: ${endpoint}`));
        if (action) {
            console.error(chalk.gray(`   SOAPAction: ${action}`));
        }

        const startTime = Date.now();

        const response = await axios.post(endpoint, requestBody, {
            headers,
            timeout: 30000,
            validateStatus: () => true,
            responseType: 'text'
        });

        const duration = Date.now() - startTime;

        console.error(chalk.green(`✓ Response received in ${duration}ms`));
        console.error(chalk.gray(`   Status: ${response.status}`));

        if (format === 'json') {
            console.log(JSON.stringify({
                status: response.status,
                statusText: response.statusText,
                duration,
                headers: response.headers,
                body: response.data
            }, null, 2));
        } else {
            // XML format - just output the body
            console.log(response.data);
        }

    } catch (error: any) {
        console.error(chalk.red(`Error: ${error.message}`));
        process.exit(1);
    }
}

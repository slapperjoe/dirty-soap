/**
 * parse-wsdl command
 * 
 * Parse WSDL and output schema (useful for AI agents).
 */

import * as fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const chalk = require('chalk');

interface ParseWsdlOptions {
    format: 'json' | 'yaml';
    output?: string;
}

export async function parseWsdlCommand(url: string, options: ParseWsdlOptions): Promise<void> {
    try {
        console.error(chalk.cyan(`\n📄 Parsing WSDL: ${url}`));

        // Dynamic import to avoid loading heavy dependencies unless needed
        const soap = await import('soap');

        const client = await soap.createClientAsync(url);
        const description = client.describe();

        let output: string;
        if (options.format === 'yaml') {
            // Simple YAML-ish output (avoid adding yaml dependency)
            output = jsonToYaml(description);
        } else {
            output = JSON.stringify(description, null, 2);
        }

        if (options.output) {
            fs.writeFileSync(options.output, output, 'utf-8');
            console.error(chalk.green(`✓ Schema written to: ${options.output}`));
        } else {
            console.log(output);
        }

    } catch (error: any) {
        console.error(chalk.red(`Error parsing WSDL: ${error.message}`));
        process.exit(1);
    }
}

function jsonToYaml(obj: any, indent = 0): string {
    const spaces = '  '.repeat(indent);
    const lines: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined) {
            lines.push(`${spaces}${key}: null`);
        } else if (typeof value === 'object' && !Array.isArray(value)) {
            lines.push(`${spaces}${key}:`);
            lines.push(jsonToYaml(value, indent + 1));
        } else if (Array.isArray(value)) {
            lines.push(`${spaces}${key}:`);
            for (const item of value) {
                if (typeof item === 'object') {
                    lines.push(`${spaces}  -`);
                    lines.push(jsonToYaml(item, indent + 2));
                } else {
                    lines.push(`${spaces}  - ${item}`);
                }
            }
        } else {
            lines.push(`${spaces}${key}: ${value}`);
        }
    }

    return lines.join('\n');
}

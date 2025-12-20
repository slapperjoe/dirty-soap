import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

export class WildcardProcessor {

    public static process(text: string, env: Record<string, string>, globals: Record<string, string>, scriptsDir?: string): string {
        if (!text) return text;

        let processed = text;

        // 1. Contextual Functions

        // {{uuid}} or {{newguid}}
        processed = processed.replace(/\{\{(uuid|newguid)\}\}/gi, () => uuidv4());

        // {{now}} (ISO)
        processed = processed.replace(/\{\{now\}\}/gi, () => new Date().toISOString());

        // {{epoch}}
        processed = processed.replace(/\{\{epoch\}\}/gi, () => Math.floor(Date.now() / 1000).toString());

        // {{randomInt(min,max)}}
        processed = processed.replace(/\{\{randomInt\((\d+),(\d+)\)\}\}/gi, (_, min, max) => {
            const minInt = parseInt(min);
            const maxInt = parseInt(max);
            return Math.floor(Math.random() * (maxInt - minInt + 1) + minInt).toString();
        });

        // {{lorem(count)}}
        processed = processed.replace(/\{\{lorem\((\d+)\)\}\}/gi, (_, count) => {
            return this.generateLorem(parseInt(count));
        });

        // {{name}}
        processed = processed.replace(/\{\{name\}\}/gi, () => this.generateName());

        // {{country}}
        processed = processed.replace(/\{\{country\}\}/gi, () => this.generateCountry());

        // {{state}}
        processed = processed.replace(/\{\{state\}\}/gi, () => this.generateState());

        // {{now+1m}} etc..  Regex: now([+-])(\d+)([dmy])
        processed = processed.replace(/\{\{now([+-])(\d+)([dmy])\}\}/gi, (_, op, amount, unit) => {
            return this.processDateMath(op, parseInt(amount), unit);
        });

        // 2. Shortcut: {{url}}
        // Maps to endpoint_url in env
        if (env['endpoint_url']) {
            processed = processed.replace(/\{\{url\}\}/gi, env['endpoint_url']);
        }

        // 3. Environment Variables (Highest priority after specific functions?)
        // Or should env override? Let's do env replacements.
        for (const [key, value] of Object.entries(env)) {
            // Avoid replacing endpoint_url again if it was handled, but standard simple replace
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processed = processed.replace(regex, value);
        }

        // 4. Global Variables
        for (const [key, value] of Object.entries(globals)) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            processed = processed.replace(regex, value);
        }

        // 5. User JS Scripts
        if (scriptsDir && fs.existsSync(scriptsDir)) {
            processed = this.processUserScripts(processed, scriptsDir);
        }

        return processed;
    }

    private static processUserScripts(text: string, scriptsDir: string): string {
        let processed = text;
        try {
            const files = fs.readdirSync(scriptsDir).filter(f => f.endsWith('.js'));
            for (const file of files) {
                const scriptPath = path.join(scriptsDir, file);
                const scriptContent = fs.readFileSync(scriptPath, 'utf8');

                const sandbox: any = {
                    module: { exports: {} },
                    console: console,
                    Buffer: Buffer
                };

                try {
                    vm.createContext(sandbox);
                    vm.runInContext(scriptContent, sandbox);

                    const exports = sandbox.module.exports;
                    if (exports && typeof exports === 'object') {
                        for (const [key, func] of Object.entries(exports)) {
                            // key should be like {{myFunc}}
                            // func should be a function() => string
                            if (typeof func === 'function') {
                                // Escape key for regex
                                const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                                const regex = new RegExp(escapedKey, 'g');
                                if (regex.test(processed)) {
                                    const result = (func as Function)();
                                    processed = processed.replace(regex, String(result));
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error executing script ${file}:`, e);
                }
            }
        } catch (e) {
            console.error('Error reading scripts dir:', e);
        }
        return processed;
    }

    private static processDateMath(op: string, amount: number, unit: string): string {
        const date = new Date();
        const sign = op === '+' ? 1 : -1;
        const val = amount * sign;

        if (unit === 'd') date.setDate(date.getDate() + val);
        if (unit === 'm') date.setMonth(date.getMonth() + val);
        if (unit === 'y') date.setFullYear(date.getFullYear() + val);

        return date.toISOString();
    }

    private static generateLorem(count: number): string {
        const words = ["lorem", "ipsum", "dolor", "sit", "amet", "consectetur", "adipiscing", "elit", "sed", "do", "eiusmod", "tempor", "incididunt", "ut", "labore", "et", "dolore", "magna", "aliqua"];
        let result = [];
        for (let i = 0; i < count; i++) {
            result.push(words[Math.floor(Math.random() * words.length)]);
        }
        return result.join(" ");
    }

    private static generateName(): string {
        const first = ["John", "Jane", "Alice", "Bob", "Charlie", "David", "Eve", "Frank"];
        const last = ["Smith", "Doe", "Johnson", "Brown", "Williams", "Jones", "Miller", "Davis"];
        return `${first[Math.floor(Math.random() * first.length)]} ${last[Math.floor(Math.random() * last.length)]}`;
    }

    private static generateCountry(): string {
        const countries = ["USA", "Canada", "UK", "Australia", "Germany", "France", "Japan", "Brazil"];
        return countries[Math.floor(Math.random() * countries.length)];
    }

    private static generateState(): string {
        const states = ["New York", "California", "Texas", "Florida", "Illinois", "Pennsylvania", "Ohio"];
        return states[Math.floor(Math.random() * states.length)];
    }
}

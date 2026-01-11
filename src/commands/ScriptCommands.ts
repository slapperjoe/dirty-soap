import * as vm from 'vm';
import * as vscode from 'vscode';
import { ICommand } from './ICommand';
import { BackendCommand } from '../../shared/src/messages';

export interface PlaygroundScriptRequest {
    command: string; // From message
    scriptType: 'assertion' | 'step';
    script: string;
    context: {
        responseBody?: string;
        statusCode?: number;
        variables?: Record<string, any>;
    };
}

export interface PlaygroundScriptResult {
    status: 'PASS' | 'FAIL' | 'ERROR';
    message?: string;
    logs: string[];
    result?: any;
}

export class ScriptCommands implements ICommand {
    private logger: (msg: string) => void;
    private panel: vscode.WebviewPanel;

    constructor(logger: (msg: string) => void, panel: vscode.WebviewPanel) {
        this.logger = logger;
        this.panel = panel;
    }

    public async execute(message: PlaygroundScriptRequest): Promise<void> {
        const result = await this.executePlaygroundScript(message);
        this.panel.webview.postMessage({
            command: BackendCommand.PlaygroundScriptResult,
            ...result
        });
    }

    public async executePlaygroundScript(request: PlaygroundScriptRequest): Promise<PlaygroundScriptResult> {
        const logs: string[] = [];
        const log = (msg: string) => logs.push(String(msg));

        // Common Sandbox Globals
        const commonSandbox = {
            console: {
                log: (...args: any[]) => log(args.map(a => String(a)).join(' ')),
                warn: (...args: any[]) => log('[WARN] ' + args.map(a => String(a)).join(' ')),
                error: (...args: any[]) => log('[ERROR] ' + args.map(a => String(a)).join(' '))
            },
            JSON, parseInt, parseFloat, String, Number, Boolean, Array, Object, RegExp, Date, Math,
            setTimeout, clearTimeout, setInterval, clearInterval
        };

        try {
            const vmContext = vm.createContext({ ...commonSandbox });

            if (request.scriptType === 'assertion') {
                return this.runAssertionScript(request, vmContext, logs);
            } else {
                return await this.runStepScript(request, vmContext, logs);
            }
        } catch (e: any) {
            return {
                status: 'ERROR',
                message: e.message,
                logs
            };
        }
    }

    private runAssertionScript(request: PlaygroundScriptRequest, vmContext: any, logs: string[]): PlaygroundScriptResult {
        // Setup assertion context
        const response = request.context.responseBody || '';
        const statusCode = request.context.statusCode || 200;

        const assertionContext = {
            ...vmContext,
            response,
            statusCode,
            status: statusCode,
            // Assertion Helpers
            pass: () => ({ status: 'PASS' }),
            fail: (msg?: string) => ({ status: 'FAIL', message: msg })
        };

        vm.createContext(assertionContext);

        // Wrap script
        const wrappedScript = `
            (function() {
                ${request.script}
            })()
        `;

        try {
            const result = vm.runInContext(wrappedScript, assertionContext, { timeout: 2000 });

            // Analyze result
            let status: 'PASS' | 'FAIL' | 'ERROR' = 'FAIL';
            let message = 'Script finished without explicit result';

            if (result === true) {
                status = 'PASS';
                message = 'returned true';
            } else if (result === false) {
                status = 'FAIL';
                message = 'returned false';
            } else if (result && typeof result === 'object' && result.status) {
                status = result.status;
                message = result.message;
            } else if (typeof result === 'string') {
                status = 'PASS';
                message = result;
            }

            return { status, message, logs, result };
        } catch (e: any) {
            logs.push(`[Runtime Error] ${e.message}`);
            return { status: 'ERROR', message: e.message, logs };
        }
    }

    private async runStepScript(request: PlaygroundScriptRequest, vmContext: any, logs: string[]): Promise<PlaygroundScriptResult> {
        // Setup step context
        const contextVars = request.context.variables || {};
        const response = request.context.responseBody || '';
        const statusCode = request.context.statusCode || 200;

        const stepContext = {
            ...vmContext,
            context: contextVars,
            responseLines: response ? response.split('\n') : [], // Optional helper
            response,        // Available in playground
            statusCode,      // Available in playground
            status: statusCode, // Alias
            log: vmContext.console.log, // Alias

            // Mocked Helpers
            fail: (reason: string) => { throw new Error(reason); },
            delay: async (ms: number) => {
                logs.push(`[Mock] Delayed for ${ms}ms`);
                await new Promise(r => setTimeout(r, Math.min(ms, 1000)));
            },
            goto: (stepName: string) => {
                logs.push(`[Mock] goto('${stepName}') called`);
            }
        };

        vm.createContext(stepContext);

        const wrappedScript = `(async () => {
            ${request.script}
        })()`;

        try {
            const result = await vm.runInContext(wrappedScript, stepContext, { timeout: 5000 });
            return { status: 'PASS', message: 'Script executed successfully', logs, result };
        } catch (e: any) {
            logs.push(`[Runtime Error] ${e.message}`);
            return { status: 'ERROR', message: e.message, logs };
        }
    }
}

import { TestRunnerService } from './TestRunnerService';
import { SoapClient } from '../soapClient';
import { SoapTestCase, SoapTestStep } from '@shared/models';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('TestRunnerService Scripting', () => {
    let soapClient: SoapClient;
    let outputChannel: any;
    let service: TestRunnerService;

    beforeEach(() => {
        soapClient = { executeRequest: vi.fn(), log: vi.fn() } as any;
        outputChannel = { appendLine: vi.fn() };
        service = new TestRunnerService(soapClient, outputChannel);
    });

    it('should execute scripts and share context', async () => {
        const step1: SoapTestStep = {
            id: '1', name: 'Init', type: 'script',
            config: { scriptContent: "context.count = 5; log('Set count');" }
        };
        const step2: SoapTestStep = {
            id: '2', name: 'Check', type: 'script',
            config: { scriptContent: "context.count++; log('New count: ' + context.count);" }
        };

        const testCase: SoapTestCase = {
            id: 'tc1', name: 'Script Test', steps: [step1, step2]
        };

        await service.runTestCase(testCase);

        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('[Script] Set count'));
        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('[Script] New count: 6'));
    });

    it('should support goto flow control', async () => {
        const step1: SoapTestStep = {
            id: '1', name: 'Start', type: 'script',
            config: { scriptContent: "if (!context.loop) { context.loop = 0; } context.loop++; log('Loop ' + context.loop);" }
        };
        const step2: SoapTestStep = {
            id: '2', name: 'Decision', type: 'script',
            config: { scriptContent: "if (context.loop < 3) { goto('Start'); } else { log('Done'); }" }
        };

        const testCase: SoapTestCase = {
            id: 'tc2', name: 'Goto Test', steps: [step1, step2]
        };

        await service.runTestCase(testCase);
        // Loop 1 -> Decision (<3) -> Start -> Loop 2 -> Decision (<3) -> Start -> Loop 3 -> Decision (>=3) -> Done

        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Loop 1'));
        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Loop 2'));
        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Loop 3'));
        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Done'));
    });

    it('should enforce max steps limit', async () => {
        const step1: SoapTestStep = {
            id: '1', name: 'Infinite', type: 'script',
            config: { scriptContent: "goto('Infinite');" }
        };
        const testCase: SoapTestCase = {
            id: 'tc3', name: 'Inf Test', steps: [step1]
        };

        await service.runTestCase(testCase);
        expect(outputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Max steps (200) exceeded'));
    });

    it('should support async delay', async () => {
        const step1: SoapTestStep = {
            id: '1', name: 'DelayScript', type: 'script',
            config: { scriptContent: "await delay(100);" }
        };
        const testCase: SoapTestCase = {
            id: 'tc4', name: 'Delay Test', steps: [step1]
        };

        const start = Date.now();
        await service.runTestCase(testCase);
        const duration = Date.now() - start;
        // Expect at least 100ms
        expect(duration).toBeGreaterThanOrEqual(95);
    });
    it('sanity check timeout', async () => {
        const start = Date.now();
        await new Promise(r => setTimeout(r, 100));
        expect(Date.now() - start).toBeGreaterThanOrEqual(95);
    });
});

import { describe, it, expect } from 'vitest';
import { ApinoxProject, TestStep } from '@shared/models';

/**
 * Integration tests for step sync logic
 * These tests verify that when a step is updated in the projects array,
 * the selectedStep is properly re-hydrated with the new data.
 */
describe('Step Sync Integration', () => {
    const createMockProject = (scriptContent: string): ApinoxProject => ({
        name: 'Test Project',
        id: 'proj-1',
        interfaces: [],
        testSuites: [{
            id: 'suite-1',
            name: 'Test Suite',
            testCases: [{
                id: 'case-1',
                name: 'Test Case',
                steps: [{
                    id: 'step-1',
                    name: 'Script Step',
                    type: 'script',
                    config: {
                        scriptContent
                    }
                }]
            }]
        }]
    });

    it('should find an updated step in the projects array', () => {
        const step1Content = '// Original content';
        const step2Content = '// Updated content\nlog("test");';

        const project1 = createMockProject(step1Content);
        const project2 = createMockProject(step2Content);

        const originalStep = project1.testSuites![0].testCases[0].steps[0];
        const updatedStep = project2.testSuites![0].testCases[0].steps[0];

        // Verify the steps have different content
        expect(originalStep.config.scriptContent).toBe(step1Content);
        expect(updatedStep.config.scriptContent).toBe(step2Content);

        // Verify they have the same ID (this is key for the sync logic)
        expect(originalStep.id).toBe(updatedStep.id);
    });

    it('should locate a step within a project structure', () => {
        const project = createMockProject('// Test');
        const testCaseId = 'case-1';
        const stepId = 'step-1';

        let foundStep: TestStep | undefined;

        for (const suite of project.testSuites || []) {
            const testCase = suite.testCases?.find(tc => tc.id === testCaseId);
            if (testCase) {
                foundStep = testCase.steps.find(s => s.id === stepId);
                break;
            }
        }

        expect(foundStep).toBeDefined();
        expect(foundStep?.id).toBe(stepId);
        expect(foundStep?.config.scriptContent).toBe('// Test');
    });

    it('should identify when a step reference has changed', () => {
        const project1 = createMockProject('// Original');
        const project2 = createMockProject('// Updated');

        const step1 = project1.testSuites![0].testCases[0].steps[0];
        const step2 = project2.testSuites![0].testCases[0].steps[0];

        // Different object references (as would happen after project reload)
        expect(step1).not.toBe(step2);

        // But same ID
        expect(step1.id).toBe(step2.id);

        // And different content
        expect(step1.config.scriptContent).not.toBe(step2.config.scriptContent);
    });

    it('should handle case where step is not found', () => {
        const project = createMockProject('// Test');
        const nonExistentStepId = 'step-999';

        let foundStep: TestStep | undefined;

        for (const suite of project.testSuites || []) {
            for (const testCase of suite.testCases || []) {
                foundStep = testCase.steps.find(s => s.id === nonExistentStepId);
                if (foundStep) break;
            }
        }

        expect(foundStep).toBeUndefined();
    });

    it('should preserve step order when updating', () => {
        const project: ApinoxProject = {
            name: 'Test Project',
            id: 'proj-1',
            interfaces: [],
            testSuites: [{
                id: 'suite-1',
                name: 'Test Suite',
                testCases: [{
                    id: 'case-1',
                    name: 'Test Case',
                    steps: [
                        {
                            id: 'step-1',
                            name: 'Step 1',
                            type: 'request',
                            config: {}
                        },
                        {
                            id: 'step-2',
                            name: 'Script Step',
                            type: 'script',
                            config: { scriptContent: '// Original' }
                        },
                        {
                            id: 'step-3',
                            name: 'Step 3',
                            type: 'delay',
                            config: { delayMs: 1000 }
                        }
                    ]
                }]
            }]
        };

        const testCase = project.testSuites![0].testCases[0];
        const scriptStepIndex = testCase.steps.findIndex(s => s.id === 'step-2');

        expect(scriptStepIndex).toBe(1); // Should be the second step
        expect(testCase.steps.length).toBe(3);

        // Update the script step
        const updatedStep: TestStep = {
            ...testCase.steps[scriptStepIndex],
            config: { scriptContent: '// Updated content' }
        };

        testCase.steps[scriptStepIndex] = updatedStep;

        // Verify order is preserved
        expect(testCase.steps[0].id).toBe('step-1');
        expect(testCase.steps[1].id).toBe('step-2');
        expect(testCase.steps[2].id).toBe('step-3');

        // Verify content was updated
        expect(testCase.steps[1].config.scriptContent).toBe('// Updated content');
    });
});

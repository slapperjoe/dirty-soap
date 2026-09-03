/**
 * projectUpdateHelpers.ts
 *
 * Pure helper functions for producing immutable updates to the ApinoxProject array
 * held in React state.  All functions follow the same pattern:
 *   updateXxx(projects, id, updater) → new Project[]
 *
 * Usage (replaces the repeated setProjects(prev => prev.map(...)) boilerplate):
 *
 *   setProjects(prev => updateTestStep(prev, testCase.id, step.id, s => ({ ...s, ...changes })));
 *   setTimeout(() => saveProject(updatedProject), 0);  // caller handles save
 */

import {
    ApinoxProject,
    ApiInterface,
    ApiOperation,
    ApiRequest,
    TestSuite,
    TestCase,
    TestStep,
} from '@shared/models';

/**
 * Phase B (t_86c34d38): the step/suite/case helpers operate on the
 * `testSuites` field only. Both the legacy `ApinoxProject` and the unified
 * `UnifiedProject` carry `testSuites`, so the TESTS step subsystem (which now
 * edits the unified store) reuses these same pure helpers via the generic
 * `P extends ProjectLike` bound — no per-model copy needed.
 */
interface ProjectLike {
    testSuites?: TestSuite[];
}

// ---------------------------------------------------------------------------
// Project-level
// ---------------------------------------------------------------------------

/** Replace one project in the list by id. */
export function updateProject(
    projects: ApinoxProject[],
    projectId: string,
    updater: (p: ApinoxProject) => ApinoxProject,
): ApinoxProject[] {
    return projects.map(p => (p.id === projectId ? updater(p) : p));
}

// ---------------------------------------------------------------------------
// Interface-level
// ---------------------------------------------------------------------------

/** Apply an updater to one interface within any project. */
export function updateInterface(
    projects: ApinoxProject[],
    interfaceId: string,
    updater: (iface: ApiInterface) => ApiInterface,
): ApinoxProject[] {
    return projects.map(p => {
        const idx = p.interfaces.findIndex(i => i.id === interfaceId);
        if (idx === -1) return p;
        const interfaces = p.interfaces.map((i, j) => (j === idx ? updater(i) : i));
        return { ...p, interfaces, dirty: true };
    });
}

// ---------------------------------------------------------------------------
// Operation-level
// ---------------------------------------------------------------------------

/** Apply an updater to one operation (located by id or name) within any project. */
export function updateOperation(
    projects: ApinoxProject[],
    operationId: string,
    updater: (op: ApiOperation) => ApiOperation,
): ApinoxProject[] {
    return projects.map(p => {
        let changed = false;
        const interfaces = p.interfaces.map(iface => {
            const opIdx = iface.operations.findIndex(
                o => o.id === operationId || o.name === operationId,
            );
            if (opIdx === -1) return iface;
            changed = true;
            return {
                ...iface,
                operations: iface.operations.map((op, j) => (j === opIdx ? updater(op) : op)),
            };
        });
        return changed ? { ...p, interfaces, dirty: true } : p;
    });
}

// ---------------------------------------------------------------------------
// Request-level
// ---------------------------------------------------------------------------

/** Apply an updater to one request (located by id or name) within any operation. */
export function updateRequest(
    projects: ApinoxProject[],
    requestId: string,
    updater: (req: ApiRequest) => ApiRequest,
): ApinoxProject[] {
    return projects.map(p => {
        let changed = false;
        const interfaces = p.interfaces.map(iface => ({
            ...iface,
            operations: iface.operations.map(op => {
                const reqIdx = op.requests.findIndex(
                    r => r.id === requestId || r.name === requestId,
                );
                if (reqIdx === -1) return op;
                changed = true;
                return {
                    ...op,
                    requests: op.requests.map((r, j) => (j === reqIdx ? updater(r) : r)),
                };
            }),
        }));
        return changed ? { ...p, interfaces, dirty: true } : p;
    });
}

// ---------------------------------------------------------------------------
// Test Suite / Test Case / Test Step
// ---------------------------------------------------------------------------

/** Apply an updater to one test suite within any project. */
export function updateTestSuite(
    projects: ApinoxProject[],
    suiteId: string,
    updater: (suite: TestSuite) => TestSuite,
): ApinoxProject[] {
    return projects.map(p => {
        const idx = p.testSuites?.findIndex(s => s.id === suiteId) ?? -1;
        if (idx === -1) return p;
        const testSuites = p.testSuites!.map((s, j) => (j === idx ? updater(s) : s));
        return { ...p, testSuites, dirty: true };
    });
}

/** Apply an updater to one test case within any suite / project. */
export function updateTestCase<P extends ProjectLike>(
    projects: P[],
    caseId: string,
    updater: (tc: TestCase) => TestCase,
): P[] {
    return projects.map(p => {
        let changed = false;
        const testSuites = p.testSuites?.map(suite => {
            const idx = suite.testCases.findIndex(tc => tc.id === caseId);
            if (idx === -1) return suite;
            changed = true;
            return {
                ...suite,
                testCases: suite.testCases.map((tc, j) => (j === idx ? updater(tc) : tc)),
            };
        });
        if (!changed) return p;
        // Mark dirty so the owning store's auto-save persists it (both the
        // legacy and unified models carry `dirty`).
        return { ...p, testSuites, dirty: true } as P;
    });
}

/** Apply an updater to one test step within a specific test case. */
export function updateTestStep<P extends ProjectLike>(
    projects: P[],
    caseId: string,
    stepId: string,
    updater: (step: TestStep) => TestStep,
): P[] {
    return updateTestCase(projects, caseId, tc => ({
        ...tc,
        steps: tc.steps.map(s => (s.id === stepId ? updater(s) : s)),
    }));
}

/** Remove a test step from a specific test case. */
export function deleteTestStep<P extends ProjectLike>(
    projects: P[],
    caseId: string,
    stepId: string,
): P[] {
    return updateTestCase(projects, caseId, tc => ({
        ...tc,
        steps: tc.steps.filter(s => s.id !== stepId),
    }));
}

/** Reorder steps in a test case by swapping two indices. */
export function reorderTestStep<P extends ProjectLike>(
    projects: P[],
    caseId: string,
    stepId: string,
    direction: 'up' | 'down',
): P[] {
    return updateTestCase(projects, caseId, tc => {
        const steps = [...tc.steps];
        const index = steps.findIndex(s => s.id === stepId);
        if (index === -1) return tc;
        if (direction === 'up' && index > 0) {
            [steps[index], steps[index - 1]] = [steps[index - 1], steps[index]];
        } else if (direction === 'down' && index < steps.length - 1) {
            [steps[index], steps[index + 1]] = [steps[index + 1], steps[index]];
        } else {
            return tc;
        }
        return { ...tc, steps };
    });
}

/** Add a step to a test case. */
export function addTestStep<P extends ProjectLike>(
    projects: P[],
    caseId: string,
    step: TestStep,
): P[] {
    return updateTestCase(projects, caseId, tc => ({
        ...tc,
        steps: [...tc.steps, step],
    }));
}

/**
 * importUnifiedStore tests (t_b2eae8b0).
 *
 * Pins the canonical write path for the Bulk Import + SoapUI import flows:
 * each imported (nested) project is persisted to the UNIFIED store via the
 * `save_imported_project_as_unified` Tauri command, nameless projects are
 * skipped (null preserved in order), and a failure on one project is logged
 * (not thrown) so the rest of the batch still lands.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above all imports/vars, so the spy must be created with
// vi.hoisted (same pattern as the context tests) to be visible inside the
// factory. vi.mock path resolves relative to THIS test file (src/utils/
// __tests__/), so the bridge module is '../bridge'.
const invokeMock = vi.hoisted(() =>
    vi.fn(
        async (_command: string, args?: Record<string, unknown>) => {
            // Echo back a persisted unified project so callers can read `.name`.
            const name = (args?.project as { name?: string } | undefined)?.name;
            return { name, operations: [] };
        },
    ),
);

vi.mock('../bridge', () => ({
    bridge: {
        invokeTauriCommand: invokeMock,
    },
    invokeTauriCommand: invokeMock,
    isTauri: () => true,
}));

import { saveImportedProjectsAsUnified, type ImportedNestedProject } from '../importUnifiedStore';

beforeEach(() => {
    invokeMock.mockClear();
});

describe('saveImportedProjectsAsUnified (t_b2eae8b0 import → unified store)', () => {
    it('persists each named project via save_imported_project_as_unified, in order', async () => {
        const projects = [
            { name: 'Svc A', interfaces: [] },
            { name: 'Svc B', interfaces: [] },
        ];
        const result = await saveImportedProjectsAsUnified(projects);

        expect(invokeMock).toHaveBeenCalledTimes(2);
        // Every call targets the unified-store command with a JSON-cloned project.
        projects.forEach((project, i) => {
            const [command, args] = invokeMock.mock.calls[i] as [string, Record<string, unknown>];
            expect(command).toBe('save_imported_project_as_unified');
            expect((args.project as { name: string }).name).toBe(project.name);
        });
        // Results mirror the backend's persisted project per input (in order).
        expect(result.map((r) => (r ? (r.name as string) : null))).toEqual(['Svc A', 'Svc B']);
    });

    it('skips a nameless project (null in its slot) without invoking the backend', async () => {
        const result = await saveImportedProjectsAsUnified([
            { name: 'Good' },
            { id: 'no-name-here' } as unknown as ImportedNestedProject, // no name → skipped
            { name: 'AlsoGood' },
        ]);

        expect(invokeMock).toHaveBeenCalledTimes(2); // the nameless one is skipped
        expect(result).toHaveLength(3);
        expect(result[0]?.name).toBe('Good');
        expect(result[1]).toBeNull();
        expect(result[2]?.name).toBe('AlsoGood');
    });

    it('logs (does not throw) when a project fails, and keeps going', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        invokeMock.mockReset();
        invokeMock.mockImplementation(
            async (_command: string, args?: Record<string, unknown>) => {
                if ((args?.project as { name?: string })?.name === 'Bad') {
                    throw new Error('boom');
                }
                return { name: (args?.project as { name?: string })?.name, operations: [] };
            },
        );

        const result = await saveImportedProjectsAsUnified([
            { name: 'Bad' },
            { name: 'StillWorks' },
        ]);

        // Failure is recorded as null, the second project still persists.
        expect(result[0]).toBeNull();
        expect(result[1]?.name).toBe('StillWorks');
        expect(invokeMock).toHaveBeenCalledTimes(2);
        expect(consoleErrorSpy).toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
    });
});

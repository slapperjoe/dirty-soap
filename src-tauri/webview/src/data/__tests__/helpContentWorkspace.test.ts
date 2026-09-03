/**
 * Help "Workspace" page re-point regression test (t_1340c643).
 *
 * The Help → Core → "Workspace" page was re-pointed to the unified explorer in
 * Phase A (t_762df439): the legacy workspace tab is gone, so the docs must name
 * the unified explorer as the entry point and describe the legacy Workspace only
 * as an off-rail, legacy-only surface. This pins that re-point so the Help
 * content cannot silently regress to describing the removed tab as the entry
 * point.
 */
import { describe, it, expect } from 'vitest';
import { HELP_SECTIONS } from '../helpContent';

/** Find the (legacy) workspace help page by its stable id across all sections. */
const findWorkspacePage = () => {
    for (const section of HELP_SECTIONS) {
        const self = section as any;
        if (self.id === 'workspace') return self;
        const child = (self.children || []).find((c: any) => c.id === 'workspace');
        if (child) return child;
    }
    return undefined;
};

describe('Help "Workspace" page (re-pointed to unified explorer)', () => {
    const page = findWorkspacePage();

    it('exists in the help content', () => {
        expect(page).toBeDefined();
    });

    it('names the unified explorer as the entry point', () => {
        const content = (page as any).content as string;
        expect(content).toContain('Unified Explorer');
        expect(content).toMatch(/Unified Explorer[\s\S]*entry point/i);
    });

    it('describes the legacy Workspace only as off-rail / legacy-only (not the entry point)', () => {
        const content = (page as any).content as string;
        // The legacy view is documented as no longer on the activity rail.
        expect(content).toMatch(/no longer listed on the[\s\S]*activity rail/i);
        // It remains available only for legacy projects / legacy links.
        expect(content).toMatch(/legacy/i);
    });
});

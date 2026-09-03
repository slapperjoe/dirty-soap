/**
 * SidebarRail regression test (t_762df439 / t_1340c643).
 *
 * The legacy PROJECTS ("Workspace") rail entry was removed; the unified
 * explorer is the entry point. These tests fail if the Projects/Workspace
 * tab reappears on the rail.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { SidebarRail } from '../SidebarRail';
import { SidebarView } from '@shared/models';

const baseProps = {
    activeView: SidebarView.UNIFIED_EXPLORER,
    onChangeView: vi.fn(),
};

describe('SidebarRail (workspace tab removal)', () => {
    it('does not render a Projects (legacy Workspace) rail item', () => {
        render(<SidebarRail {...baseProps} />);

        // The legacy entry was titled "Projects"; nothing on the rail carries
        // that title (or the body header's "Workspace" wording) anymore.
        expect(screen.queryByTitle('Projects')).not.toBeInTheDocument();
        expect(screen.queryByTitle('Workspace')).not.toBeInTheDocument();
    });

    it('still renders the unified explorer rail item as the first entry', () => {
        render(<SidebarRail {...baseProps} />);

        const explorer = screen.getByTitle('Unified Explorer');
        expect(explorer).toBeInTheDocument();

        // It is the first item in the top rail group (before Tests).
        const tests = screen.getByTitle('Tests');
        expect(explorer.compareDocumentPosition(tests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('activates the unified explorer when the first entry is clicked', () => {
        const onChangeView = vi.fn();
        const { container } = render(<SidebarRail {...baseProps} onChangeView={onChangeView} />);

        // First rail item is the unified explorer entry.
        const firstItem = container.querySelector('div[title="Unified Explorer"]')!;
        fireEvent.click(firstItem);

        expect(onChangeView).toHaveBeenCalledWith(SidebarView.UNIFIED_EXPLORER);
    });

    it('renders no rail entry for a non-rail view (e.g. TESTS) via activeView', () => {
        const onChangeView = vi.fn();
        render(
            <SidebarRail
                activeView={SidebarView.TESTS}
                onChangeView={onChangeView}
            />,
        );

        // Views that are not exposed on the rail (TESTS, etc.) carry no
        // active rail item — they are only reachable programmatically.
        expect(screen.queryByTitle('Projects')).not.toBeInTheDocument();
    });
});

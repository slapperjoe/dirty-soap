import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { UnifiedExplorerSidebar } from '../UnifiedExplorerSidebar';
import { UnifiedProject } from '@shared/models';

/**
 * R-10 (F-17) — context-menu rename, unified sidebar.
 *
 * Renaming is display-only: the modal edits an additive `displayName`
 * override and the parent (`onRename*` → MainContent → Rust
 * `rename_unified_*` commands) persists it. The stable `name` — used for the
 * on-disk directory, WSDL binding, refresh merge, and selection identity —
 * never changes, so selection survives a rename (doc Q8).
 */

// ── fixtures ─────────────────────────────────────────────────────────────────
const makeProject = (displayName?: string): UnifiedProject => ({
    name: 'CountryInfo',
    displayName,
    source: 'wsdl',
    sourceUrl: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
    parsedAt: new Date().toISOString(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-1',
            name: 'GetCurrencyRate',
            displayName: displayName ? 'Fancy Op' : undefined,
            action: 'http://www.oorsprong.org/websamples.countryinfo/GetCurrencyRate',
            targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo/',
            originalEndpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
            requests: [
                {
                    id: 'req-1',
                    name: 'MyRateRequest',
                    displayName: displayName ? 'Fancy Request' : undefined,
                    request: '<GetCurrencyRate/>',
                    endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                },
            ],
        },
    ],
});

const baseProps: Omit<React.ComponentProps<typeof UnifiedExplorerSidebar>, 'projects' | 'scrapbook'> = {
    selectedNode: null,
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteRequest: vi.fn(),
    onNewRequest: vi.fn(),
    onRenameProject: vi.fn(async () => {}),
    onRenameOperation: vi.fn(async () => {}),
    onRenameRequest: vi.fn(async () => {}),
    onExportProject: vi.fn(),
    onReorderOperation: vi.fn(),
    onReorderRequest: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Expand a tree row by clicking its chevron (the first child of the row div).
 * The tree is collapsed by default, so operation/request rows only render
 * once their parent is expanded.
 */
const expandRow = (label: string, container: HTMLElement) => {
    // Find the row span whose text is exactly the label (the label span is a
    // direct child of the row div; the chevron is the row's first child).
    const spans = Array.from(container.querySelectorAll('span')).filter(
        (s) => s.textContent === label,
    );
    expect(spans.length, `row "${label}" not found`).toBeGreaterThan(0);
    const row = spans[spans.length - 1]!.parentElement as HTMLElement;
    const chevron = row.firstElementChild as HTMLElement;
    expect(chevron, 'row has no chevron (not expandable?)').toBeTruthy();
    fireEvent.click(chevron);
};

describe('R-10: unified sidebar context-menu rename (F-17)', () => {
    it('renders the display-name override in the tree when set (all three levels)', () => {
        const { container } = render(
            <UnifiedExplorerSidebar {...baseProps} projects={[makeProject('Fancy Service')]} />,
        );
        // Expand the project row; the operation auto-expands on mount
        // (the sidebar auto-expands operations that have requests), so the
        // request row renders too.
        expandRow('Fancy Service', container);
        // The stable names are hidden once a displayName override exists…
        expect(screen.queryByText('CountryInfo')).not.toBeInTheDocument();
        expect(screen.queryByText('GetCurrencyRate')).not.toBeInTheDocument();
        expect(screen.queryByText('MyRateRequest')).not.toBeInTheDocument();
        // …and the overrides are shown instead.
        expect(screen.getByText('Fancy Service')).toBeInTheDocument();
        expect(screen.getByText('Fancy Op')).toBeInTheDocument();
        expect(screen.getByText('Fancy Request')).toBeInTheDocument();
    });

    it('falls back to the stable name when no display name is set', () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);
        expect(screen.getByText('CountryInfo')).toBeInTheDocument();
    });

    it('project rename: menu → modal → save calls onRenameProject(projectName, displayName)', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        // Right-click the project row to open the context menu.
        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const renameItem = await screen.findByText('Rename');
        fireEvent.click(renameItem);

        // The modal opens, pre-filled with the current (stable) name.
        const input = await screen.findByRole('textbox');
        expect(input).toHaveValue('CountryInfo');
        expect(screen.getByText('Rename project')).toBeInTheDocument();

        // Type the new display name and save.
        fireEvent.change(input, { target: { value: 'My Country Service' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(props.onRenameProject).toHaveBeenCalledTimes(1);
            expect(props.onRenameProject).toHaveBeenCalledWith('CountryInfo', 'My Country Service');
        });
        // The other levels' handlers must not fire.
        expect(props.onRenameOperation).not.toHaveBeenCalled();
        expect(props.onRenameRequest).not.toHaveBeenCalled();
    });

    it('operation rename: passes the stable operation name (not the display name)', async () => {
        const props = { ...baseProps };
        const { container } = render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        expandRow('CountryInfo', container);
        fireEvent.contextMenu(screen.getByText('GetCurrencyRate'));
        fireEvent.click(await screen.findByText('Rename'));

        const input = await screen.findByRole('textbox');
        expect(input).toHaveValue('GetCurrencyRate');
        expect(screen.getByText('Rename operation')).toBeInTheDocument();

        fireEvent.change(input, { target: { value: 'Rate Op' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(props.onRenameOperation).toHaveBeenCalledWith('CountryInfo', 'GetCurrencyRate', 'Rate Op');
        });
    });

    it('request rename: passes project + stable operation + stable request names', async () => {
        const props = { ...baseProps };
        const { container } = render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        // Only the project needs expanding — the operation auto-expands on
        // mount (ops with requests), so the request row renders directly.
        expandRow('CountryInfo', container);
        fireEvent.contextMenu(screen.getByText('MyRateRequest'));
        fireEvent.click(await screen.findByText('Rename'));

        const input = await screen.findByRole('textbox');
        expect(input).toHaveValue('MyRateRequest');
        expect(screen.getByText('Rename request')).toBeInTheDocument();

        fireEvent.change(input, { target: { value: 'My Req' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            expect(props.onRenameRequest).toHaveBeenCalledWith(
                'CountryInfo',
                'GetCurrencyRate',
                'MyRateRequest',
                'My Req',
            );
        });
    });

    it('modal pre-fill prefers the existing displayName override', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject('Existing Alias')]} />);

        fireEvent.contextMenu(screen.getByText('Existing Alias'));
        fireEvent.click(await screen.findByText('Rename'));

        const input = await screen.findByRole('textbox');
        expect(input).toHaveValue('Existing Alias');
    });

    it('cancelling the modal does not call any rename handler', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        fireEvent.click(await screen.findByText('Rename'));
        await screen.findByRole('textbox');

        fireEvent.click(screen.getByRole('button', { name: 'Close' }));

        expect(props.onRenameProject).not.toHaveBeenCalled();
    });

    it('saving an empty display name clears the override (empty string forwarded)', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject('Existing Alias')]} />);

        fireEvent.contextMenu(screen.getByText('Existing Alias'));
        fireEvent.click(await screen.findByText('Rename'));
        const input = await screen.findByRole('textbox');

        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));

        await waitFor(() => {
            // The sidebar trims; the Rust side treats empty/whitespace as "clear".
            expect(props.onRenameProject).toHaveBeenCalledWith('CountryInfo', '');
        });
    });
});

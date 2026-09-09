import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UnifiedExplorerSidebar } from '../UnifiedExplorerSidebar';
import { UnifiedProject } from '@shared/models';

/**
 * t_22d642a2 — export menu copy: "Export Project" and "Export Workspace"
 * must be distinguishable at a glance. Each item now carries a short
 * sub-label plus a hover tooltip (native `title` on the row), and the
 * click behavior is unchanged (same handlers, same arguments).
 */

const makeProject = (): UnifiedProject => ({
    name: 'CountryInfo',
    source: 'wsdl',
    sourceUrl: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
    parsedAt: new Date().toISOString(),
    soapVersion: '1.1',
    operations: [
        {
            id: 'op-1',
            name: 'GetCurrencyRate',
            action: 'http://www.oorsprong.org/websamples.countryinfo/GetCurrencyRate',
            targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo/',
            originalEndpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
            requests: [],
        },
    ],
});

const PROJECT_TOOLTIP = "Export this project's files and configuration to a single .apinox file";
const WORKSPACE_TOOLTIP = 'Export the workspace layout and state (pick which projects to include)';

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
    onExportWorkspace: vi.fn(),
    onReorderOperation: vi.fn(),
    onReorderRequest: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
});

/** Walk up from the label to the menu row div that carries the `title`. */
const rowWithTitle = (labelEl: HTMLElement): HTMLElement => {
    const row = labelEl.closest('[title]');
    expect(row, `menu row for "${labelEl.textContent}" has no tooltip`).toBeTruthy();
    return row as HTMLElement;
};

describe('UnifiedExplorerSidebar export menu copy (t_22d642a2)', () => {
    it('renders both export items with distinct labels and sub-labels', async () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        await screen.findByText('Export Project');
        await screen.findByText('Export Workspace');

        // Labels are distinct…
        expect(screen.getByText('Export Project')).toBeInTheDocument();
        expect(screen.getByText('Export Workspace')).toBeInTheDocument();
        // …and each carries a short descriptor sub-label.
        expect(screen.getByText('Project files & configuration')).toBeInTheDocument();
        expect(screen.getByText('Workspace layout & state')).toBeInTheDocument();
    });

    it('renders a tooltip on the Export Project row', async () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const row = rowWithTitle(await screen.findByText('Export Project'));
        expect(row).toHaveAttribute('title', PROJECT_TOOLTIP);
    });

    it('renders a tooltip on the Export Workspace row', async () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const row = rowWithTitle(await screen.findByText('Export Workspace'));
        expect(row).toHaveAttribute('title', WORKSPACE_TOOLTIP);
    });

    it('Export Project click still calls onExportProject with the stable project name', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        fireEvent.click(await screen.findByText('Export Project'));

        expect(props.onExportProject).toHaveBeenCalledTimes(1);
        expect(props.onExportProject).toHaveBeenCalledWith('CountryInfo');
        expect(props.onExportWorkspace).not.toHaveBeenCalled();
    });

    it('Export Workspace click still calls onExportWorkspace (no arguments)', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        fireEvent.click(await screen.findByText('Export Workspace'));

        expect(props.onExportWorkspace).toHaveBeenCalledTimes(1);
        expect(props.onExportWorkspace).toHaveBeenCalledWith();
        expect(props.onExportProject).not.toHaveBeenCalled();
    });

    it('omits the Export Workspace item when onExportWorkspace is not provided', async () => {
        const props = { ...baseProps, onExportWorkspace: undefined };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        await screen.findByText('Export Project');

        expect(screen.queryByText('Export Workspace')).not.toBeInTheDocument();
    });
});

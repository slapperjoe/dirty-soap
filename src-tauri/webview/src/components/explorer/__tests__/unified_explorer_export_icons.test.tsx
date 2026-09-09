import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { UnifiedExplorerSidebar } from '../UnifiedExplorerSidebar';
import { UnifiedProject } from '@shared/models';

/**
 * F-45 — Export (Project|Workspace) icon fix.
 *
 * The "Export Workspace" context-menu item must use the Download icon
 * (the item exports data OUT of the app — the icon signals direction).
 * Before the fix, the item used the Upload icon, which reads as
 * "import into the app" and was the reverse of what the action does.
 *
 * This test pins both the wiring (click → onExportWorkspace()) and
 * the icon (Download, not Upload) on the context-menu item.
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
            requests: [
                {
                    id: 'req-1',
                    name: 'MyRateRequest',
                    request: '<GetCurrencyRate/>',
                    endpoint: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso',
                },
            ],
        },
    ],
});

const baseProps: Omit<React.ComponentProps<typeof UnifiedExplorerSidebar>, 'projects'> = {
    selectedNode: null,
    onSelectNode: vi.fn(),
    onRefreshProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onDeleteOperation: vi.fn(),
    onDeleteRequest: vi.fn(),
    onNewRequest: vi.fn(),
    onExportProject: vi.fn(),
    onExportWorkspace: vi.fn(),
    onReorderOperation: vi.fn(),
    onReorderRequest: vi.fn(),
};

beforeEach(() => {
    vi.clearAllMocks();
});

/**
 * Find the SVG icon that sits in the same flex row as the given label.
 *
 * The SidebarContextMenu renders each item as:
 *   <MenuItemRow>
 *     <ItemContainer>
 *       <MenuItem>            ← the flex row
 *         <IconWrapper><Icon size={14}/></IconWrapper>
 *         <LabelWrapper><Label>...</Label></LabelWrapper>
 *       </MenuItem>
 *     </ItemContainer>
 *   </MenuItemRow>
 *
 * From the label element, the nearest ancestor with an SVG child is
 * the MenuItem (the flex row that holds both icon and label).
 */
const getRowIcon = (labelEl: Element): SVGElement | null => {
    let el: Element | null = labelEl;
    while (el && el !== document.body) {
        const svg = el.querySelector('svg');
        if (svg) return svg;
        el = el.parentElement;
    }
    return null;
};

describe('F-45: Export Workspace context-menu item icon', () => {
    it('renders the Export Workspace menu item with the Download icon (not Upload)', async () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const exportItem = await screen.findByText('Export Workspace');
        const svg = getRowIcon(exportItem);
        expect(svg, 'Export Workspace item should have an icon SVG').not.toBeNull();

        // Download icon: down-pointing arrow (polyline "7 10 12 15 17 10")
        //   + tray (path "M21 15v4...").
        // Upload icon: up-pointing arrow (polyline "7 14 12 9 17 14")
        //   + no tray.
        const pathData = svg?.innerHTML ?? '';
        expect(pathData).toContain('7 10 12 15 17 10');
        expect(pathData).not.toContain('7 14 12 9 17 14');
    });

    it('clicking Export Workspace calls onExportWorkspace (wiring intact)', async () => {
        const props = { ...baseProps };
        render(<UnifiedExplorerSidebar {...props} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const exportItem = await screen.findByText('Export Workspace');
        fireEvent.click(exportItem);

        expect(props.onExportWorkspace).toHaveBeenCalledTimes(1);
        expect(props.onExportProject).not.toHaveBeenCalled();
    });

    it('Export Project item also uses the Download icon (sibling sanity)', async () => {
        render(<UnifiedExplorerSidebar {...baseProps} projects={[makeProject()]} />);

        fireEvent.contextMenu(screen.getByText('CountryInfo'));
        const exportProjectItem = await screen.findByText('Export Project');
        const svg = getRowIcon(exportProjectItem);
        expect(svg, 'Export Project item should have an icon SVG').not.toBeNull();
        const pathData = svg?.innerHTML ?? '';
        expect(pathData).toContain('7 10 12 15 17 10');
        expect(pathData).not.toContain('7 14 12 9 17 14');
    });
});

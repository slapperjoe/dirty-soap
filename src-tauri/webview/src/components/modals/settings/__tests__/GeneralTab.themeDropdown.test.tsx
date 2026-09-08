/**
 * GeneralTab theme dropdown: the Theme selector in the settings "User
 * Interface" section must be VISIBLE (not dead-code-guarded) and FUNCTIONAL —
 * picking a theme applies it and persists the choice.
 *
 * Regression guard for d3bbde1 ("Port WIP from backup"), which flipped the
 * Theme (and UI Font) selectors to `{false && (` and dead-code-guarded the
 * config-dir effect, hiding the dropdown in the shipped Tauri app. The fix
 * restores the `{isStandalone && (` gate. This test pins both the
 * visibility (dropdown present in the DOM) and the behavior (selecting an
 * option persists to localStorage) so the selector cannot silently disappear
 * again.
 *
 * The app always runs standalone: App.tsx mounts `<ThemeProvider
 * standalone={true}>`, and the production gate is `{isStandalone && ( ...
 * )}`. We render GeneralTab inside the real ThemeProvider with
 * standalone=true so the gate evaluates exactly as it does in the running
 * app. The `useUI` context (configDir) is mocked so the tab can render
 * without the full UI provider tree.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from '@apinox/request-editor/core';
import { UIProvider } from '../../../../contexts/UIContext';

// Mock the UI context to a minimal shape GeneralTab reads (configDir).
vi.mock('../../../../contexts/UIContext', () => {
    const React = require('react');
    return {
        useUI: () => ({ configDir: '/tmp/fake-config' }),
        UIProvider: ({ children }: { children: React.ReactNode }) =>
            React.createElement(React.Fragment, null, children),
        // Re-export any other named imports that consumers of this module
        // pull in, so the module shape stays intact.
    };
});

import { GeneralTab } from '../GeneralTab';

// The theme values the production Theme selector offers.
const THEME_OPTIONS = ['Dark', 'Light', 'Solarized Dark', 'Solarized Light', 'Zed Dark', 'DankShell Light'];

function renderGeneralTab() {
    return render(
        <ThemeProvider standalone={true}>
            <UIProvider>
                <GeneralTab config={{}} onChange={() => {}} />
            </UIProvider>
        </ThemeProvider>
    );
}

describe('GeneralTab theme dropdown (regression)', () => {
    beforeEach(() => {
        // Isolate localStorage so persisted-theme assertions are deterministic.
        localStorage.clear();
        // ThemeProvider applies theme variables to document root; reset between
        // tests so state does not leak across cases.
        document.documentElement.removeAttribute('data-theme');
        for (const key of Array.from(document.documentElement.style)) {
            if (key.startsWith('--apinox')) {
                document.documentElement.style.removeProperty(key);
            }
        }
    });

    it('renders the Theme selector (dropdown trigger) in the User Interface section', () => {
        renderGeneralTab();
        // The CustomSelect trigger is a button whose accessible name is the
        // selected theme label. Its mere presence is the visibility guard.
        const themeTrigger = screen.getByRole('button', { name: /Dark/ });
        expect(themeTrigger).toBeTruthy();
        // It advertises itself as a listbox trigger.
        expect(themeTrigger).toHaveAttribute('aria-haspopup', 'listbox');
    });

    it('offers every theme option in the dropdown list', async () => {
        renderGeneralTab();
        const trigger = screen.getByRole('button', { name: /Dark/ });
        await userEvent.click(trigger);
        const listbox = await screen.findByRole('listbox');
        const options = screen.getAllByRole('option');
        expect(options).toHaveLength(THEME_OPTIONS.length);
        const labels = options.map((o) => o.textContent);
        for (const opt of THEME_OPTIONS) {
            expect(labels).toContain(opt);
        }
        expect(listbox).toBeTruthy();
    });

    it('applies the selected theme to the document root (visible change)', async () => {
        renderGeneralTab();
        const trigger = screen.getByRole('button', { name: /Dark/ });
        await userEvent.click(trigger);
        const lightOption = await screen.findByRole('option', { name: 'Light' });
        await userEvent.click(lightOption);

        // ThemeProvider sets data-theme on <body> when a theme is applied in
        // standalone mode. The dropdown closing (option removed from DOM)
        // confirms the selection round-tripped.
        await waitFor(() => {
            expect(screen.queryByRole('option', { name: 'Light' })).toBeNull();
        });
        expect(document.body).toHaveAttribute('data-theme', 'light');
    });

    it('persists the selected theme to localStorage', async () => {
        renderGeneralTab();
        const trigger = screen.getByRole('button', { name: /Dark/ });
        await userEvent.click(trigger);
        const lightOption = await screen.findByRole('option', { name: 'Light' });
        await userEvent.click(lightOption);

        // setTheme() in standalone mode writes the choice to localStorage.
        await waitFor(() => {
            expect(localStorage.getItem('apinox-theme')).toBe('light');
        });
    });
});

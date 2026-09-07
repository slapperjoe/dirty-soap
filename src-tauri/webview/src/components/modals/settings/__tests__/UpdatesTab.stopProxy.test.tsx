/**
 * UpdatesTab "Stop proxy" affordance: the button must appear ONLY when the
 * update check failed with a proxy-shaped error AND the in-app proxy is
 * actually running. Pins both conditions so the button can't regress into
 * showing for unrelated errors or with no proxy to stop.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invokeMock = vi.fn();

vi.mock('../../../../utils/bridge', () => ({
    invokeTauriCommand: (cmd: string, args?: Record<string, any>) =>
        invokeMock(cmd, args),
}));

vi.mock('@tauri-apps/api/event', () => ({
    listen: vi.fn().mockResolvedValue(vi.fn()),
}));

import { UpdatesTab, isProxyRelatedUpdateError } from '../UpdatesTab';

const PROXY_ERROR =
    'Direct request failed (HTTP 403 Forbidden) and the proxy-aware request also failed ' +
    '(error sending request for url (@url:`https://api.github.com/repos/slapperjoe/apinox/releases/latest`)). Route: direct — self-proxy loop.';

const BASE_RESULT = {
    current_version: '0.44.353',
    latest_version: '0.44.353',
    has_update: false,
    check_error: PROXY_ERROR,
    download_url: null,
    release_url: '',
    release_notes: '',
};

function proxyStatus(running: boolean) {
    return { running, port: running ? 8888 : null, mode: 'proxy', targetUrl: '' };
}

async function renderWith({
    checkError,
    proxyRunning,
}: {
    checkError: string | null;
    proxyRunning: boolean;
}) {
    invokeMock.mockImplementation(async (cmd: string) => {
        switch (cmd) {
            case 'check_for_updates':
                return { ...BASE_RESULT, check_error: checkError };
            case 'get_proxy_status':
                return proxyStatus(proxyRunning);
            case 'stop_proxy':
                return null;
            default:
                throw new Error(`unexpected invoke: ${cmd}`);
        }
    });
    render(<UpdatesTab />);
    // Anchor on the final "done" render: by the time the check_error text is
    // painted in the document, the check result has landed.
    await waitFor(() => {
        expect(document.body.textContent || "").toContain(checkError);
    });
    // …and the proxy-status state has landed (button visibility derives from
    // both the error and proxyStatus.running).
    await waitFor(() => {
        expect(invokeMock.mock.calls.some((c) => c[0] === 'get_proxy_status')).toBe(true);
    });
}

describe('isProxyRelatedUpdateError', () => {
    it('matches the self-proxy / proxy-aware retry shape', () => {
        expect(isProxyRelatedUpdateError(PROXY_ERROR)).toBe(true);
    });

    it('matches a bare reqwest send failure', () => {
        expect(
            isProxyRelatedUpdateError('error sending request for url (@url:`https://api.github.com`)')
        ).toBe(true);
    });

    it('does not match unrelated errors', () => {
        expect(isProxyRelatedUpdateError('GitHub API returned status 503')).toBe(false);
        expect(isProxyRelatedUpdateError('No releases published yet')).toBe(false);
        expect(isProxyRelatedUpdateError('')).toBe(false);
        expect(isProxyRelatedUpdateError(null)).toBe(false);
    });
});

describe('UpdatesTab stop-proxy button', () => {
    beforeEach(() => {
        invokeMock.mockReset();
    });

    it('shows the button when the check failed proxy-shaped AND the proxy is running', async () => {
        await renderWith({ checkError: PROXY_ERROR, proxyRunning: true });
        const btn = await screen.findByRole('button', { name: /stop proxy/i });
        expect(btn).toBeTruthy();
    });

    it('hides the button when the proxy is not running', async () => {
        await renderWith({ checkError: PROXY_ERROR, proxyRunning: false });
        expect(screen.queryByRole('button', { name: /stop proxy/i })).toBeNull();
    });

    it('hides the button for unrelated check errors even when the proxy runs', async () => {
        await renderWith({ checkError: 'GitHub API returned status 503', proxyRunning: true });
        expect(screen.queryByRole('button', { name: /stop proxy/i })).toBeNull();
    });

    it('stops the proxy and hides the button when clicked (no auto re-check)', async () => {
        await renderWith({ checkError: PROXY_ERROR, proxyRunning: true });
        const btn = await screen.findByRole('button', { name: /stop proxy/i });
        await userEvent.click(btn);
        await waitFor(() => {
            expect(invokeMock.mock.calls.some((c) => c[0] === 'stop_proxy')).toBe(true);
        });
        // The error message stays on screen for the user to act on…
        await waitFor(() => {
            expect(document.body.textContent || "").toContain(PROXY_ERROR);
        });
        // …the button is gone (proxy no longer running)…
        expect(screen.queryByRole('button', { name: /stop proxy/i })).toBeNull();
        // …and no automatic re-check fired — "Check now" does that.
        const checkCalls = invokeMock.mock.calls.filter((c) => c[0] === 'check_for_updates').length;
        expect(checkCalls).toBe(1);
    });
});

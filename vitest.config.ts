import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        passWithNoTests: true,
        include: ['**/*.{test,spec}.{ts,js}', '**/test-*.ts'],
        // Kanban agent worktrees (git worktree checkouts) live under
        // .worktrees/ and contain full duplicate copies of the source tree —
        // without this exclude, root discovery sweeps every worktree's test
        // copies (which have no node_modules) and fails collection on stale
        // code. The webview component tests (.tsx) run under their own
        // config: src-tauri/webview/vitest.config.ts.
        exclude: ['**/node_modules/**', '**/.git/**', '.worktrees/**'],
        alias: {
            '@shared': path.resolve(__dirname, './shared/src'),
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: [],
            exclude: []
        }
    }
});

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

// The @apinox/request-editor workspace package ships its own nested
// node_modules (react, react-dom, styled-components). Loaded via its built
// dist, that nested React is a second instance whose hooks cannot see the
// app's context providers (useContext -> null dispatcher). The production
// vite.config.ts already solves this by aliasing the package to its SOURCE
// and deduping react/react-dom/styled-components; this test config mirrors
// that resolve block so tests run against the same single-React graph the
// built app uses.
const requestEditorSrc = path.resolve(__dirname, '../../packages/request-editor/src');

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../../shared/src'),
            '@apinox/request-editor/core': path.resolve(requestEditorSrc, 'core.ts'),
            '@apinox/request-editor/monaco': path.resolve(requestEditorSrc, 'monaco.ts'),
            '@apinox/request-editor': path.resolve(requestEditorSrc, 'index.ts')
        },
        dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'styled-components']
    },
    define: {
        '__APP_VERSION__': JSON.stringify(pkg.version),
        '__CHANGELOG__': '""'
    },
    test: {
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.test.{ts,tsx}'],
        setupFiles: ['./src/test/setup.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx']
        }
    }
});

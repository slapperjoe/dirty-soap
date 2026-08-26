import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import pkg from './package.json';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../../shared/src')
        }
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

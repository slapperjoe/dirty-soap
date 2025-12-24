import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: '../webview-build',
        minify: true,
        sourcemap: true,
        rollupOptions: {
            output: {
                entryFileNames: `assets/[name].js`,
                chunkFileNames: `assets/[name].js`,
                assetFileNames: `assets/[name].[ext]`,
                manualChunks: {
                    vendor: ['react', 'react-dom'],
                    monaco: ['monaco-editor', '@monaco-editor/react']
                }
            }
        }
    }
})

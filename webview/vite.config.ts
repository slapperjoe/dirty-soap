import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    optimizeDeps: {
        exclude: [
            'monaco-editor',
            '@monaco-editor/react',
            'monaco-editor/esm/vs/language/json/json.worker'
        ]
    },
    resolve: {
        alias: {
            '@shared': path.resolve(__dirname, '../shared/src')
        }
    },
    build: {
        outDir: '../webview-build',
        assetsInlineLimit: 1048576, // Inline assets up to 1MB (Mascot is ~635KB)
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
                },
                // Help IDEs map source paths correctly
                sourcemapPathTransform: (relativeSourcePath) => {
                    // Map paths to be relative to webview/src
                    return path.join('webview/src', relativeSourcePath.replace(/^\.\.\/src\//, ''))
                }
            }
        }
    }
})


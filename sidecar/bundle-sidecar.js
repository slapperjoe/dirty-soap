#!/usr/bin/env node
/**
 * Bundle sidecar with esbuild and inject version from package.json
 */

const esbuild = require('esbuild');
const pkg = require('./package.json');

console.log(`📦 Bundling sidecar version ${pkg.version}...`);

esbuild.build({
    entryPoints: ['dist/sidecar/src/index.js'],
    bundle: true,
    platform: 'node',
    outfile: 'bundle.js',
    external: ['node:*', 'fsevents', 'jsonc-parser'],
    packages: 'bundle',
    define: {
        'process.env.APINOX_VERSION': JSON.stringify(pkg.version)
    },
    minify: false, // Keep readable for debugging
    sourcemap: false
}).then(() => {
    console.log(`✅ Bundle created successfully with version ${pkg.version}`);
}).catch((error) => {
    console.error('❌ Bundle failed:', error);
    process.exit(1);
});

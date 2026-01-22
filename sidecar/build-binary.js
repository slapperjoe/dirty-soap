#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os');

const platform = os.platform();
const arch = os.arch();

let target;
if (platform === 'darwin') {
    target = arch === 'arm64' ? 'node18-macos-arm64' : 'node18-macos-x64';
} else if (platform === 'win32') {
    target = 'node18-win-x64';
} else if (platform === 'linux') {
    target = arch === 'arm64' ? 'node18-linux-arm64' : 'node18-linux-x64';
} else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
}

console.log(`Building for ${target}...`);

try {
    execSync(`pkg bundle.js --targets ${target} --output apinox-sidecar --compress GZip`, {
        stdio: 'inherit',
        env: { ...process.env, PKG_CACHE_PATH: process.env.PKG_CACHE_PATH || require('path').join(os.tmpdir(), 'pkg-cache') }
    });
    console.log('✓ Binary built successfully!');
} catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
}

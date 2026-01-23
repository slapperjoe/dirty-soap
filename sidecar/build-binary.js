#!/usr/bin/env node
const { execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

const platform = os.platform();
const arch = os.arch();

let target;
let outputName = 'apinox-sidecar';
if (platform === 'darwin') {
    target = arch === 'arm64' ? 'node18-macos-arm64' : 'node18-macos-x64';
} else if (platform === 'win32') {
    target = 'node18-win-x64';
    outputName = 'apinox-sidecar.exe';
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
    
    // SKIP icon application - rcedit corrupts the pkg binary
    // The Tauri wrapper will have its own icon anyway
    /*
    // Apply icon to Windows executable
    if (platform === 'win32' && fs.existsSync(outputName)) {
        console.log('🎨 Applying icon to Windows executable...');
        try {
            // Try using rcedit if available
            const rcedit = require('rcedit');
            const iconPath = path.join(__dirname, 'icon.ico');
            
            if (fs.existsSync(iconPath)) {
                rcedit(outputName, {
                    icon: iconPath,
                    'version-string': {
                        ProductName: 'APInox Sidecar',
                        FileDescription: 'APInox SOAP Testing Sidecar',
                        CompanyName: 'APInox',
                        LegalCopyright: 'Copyright © 2024'
                    }
                }).then(() => {
                    console.log('✓ Icon applied successfully!');
                }).catch(err => {
                    console.warn('⚠️  Could not apply icon:', err.message);
                    console.warn('   Install rcedit: npm install --save-dev rcedit');
                });
            } else {
                console.warn('⚠️  Icon file not found:', iconPath);
            }
        } catch (err) {
            console.warn('⚠️  rcedit not available, skipping icon application');
            console.warn('   To add icons, install: npm install --save-dev rcedit');
        }
    }
    */
} catch (error) {
    console.error('Build failed:', error.message);
    process.exit(1);
}

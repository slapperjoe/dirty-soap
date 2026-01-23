#!/usr/bin/env node
/**
 * Sync version numbers across all package.json, Cargo.toml, and tauri.conf.json files
 * Uses patch version as auto-incrementing build number
 * 
 * Usage: node sync-version.js [major.minor]
 * If no version specified, uses root package.json major.minor + .buildno for patch
 */

const fs = require('fs');
const path = require('path');

const rootDir = __dirname;

// Files to update
const files = {
    rootPackage: path.join(rootDir, 'package.json'),
    sidecarPackage: path.join(rootDir, 'sidecar', 'package.json'),
    webviewPackage: path.join(rootDir, 'src-tauri', 'webview', 'package.json'),
    cargo: path.join(rootDir, 'src-tauri', 'Cargo.toml'),
    tauriConfig: path.join(rootDir, 'src-tauri', 'tauri.conf.json'),
    buildNoFile: path.join(rootDir, '.buildno')
};

// Read build number from .buildno file
function getBuildNumber() {
    try {
        if (fs.existsSync(files.buildNoFile)) {
            const content = fs.readFileSync(files.buildNoFile, 'utf8').trim();
            const buildNo = parseInt(content, 10);
            if (!isNaN(buildNo) && buildNo >= 1) {
                return buildNo;
            }
        }
    } catch (error) {
        console.error('⚠️  Error reading .buildno file:', error.message);
    }
    return 1; // Default build number
}

// Get target version
let targetVersion = process.argv[2];
if (!targetVersion) {
    const rootPackage = JSON.parse(fs.readFileSync(files.rootPackage, 'utf8'));
    const currentVersion = rootPackage.version;
    const buildNo = getBuildNumber();
    
    // Extract major.minor from current version (ignore patch/build)
    const parts = currentVersion.split('.');
    if (parts.length < 2) {
        console.error('❌ Invalid version format in package.json. Expected at least major.minor');
        process.exit(1);
    }
    
    const major = parts[0];
    const minor = parts[1];
    
    // Use build number as patch version: major.minor.buildNo
    targetVersion = `${major}.${minor}.${buildNo}`;
}

console.log(`\n🔄 Syncing all versions to: ${targetVersion}\n`);

// Parse version parts
const versionParts = targetVersion.split('.');
if (versionParts.length !== 3) {
    console.error('❌ Version must be in format: major.minor.patch');
    console.error('   (patch version is the build number)');
    process.exit(1);
}

const [major, minor, buildNo] = versionParts;

// Update all package.json files
const rootPackage = JSON.parse(fs.readFileSync(files.rootPackage, 'utf8'));
rootPackage.version = targetVersion;
fs.writeFileSync(files.rootPackage, JSON.stringify(rootPackage, null, 2) + '\n');
console.log(`✓ Updated root package.json to ${targetVersion}`);

const sidecarPackage = JSON.parse(fs.readFileSync(files.sidecarPackage, 'utf8'));
sidecarPackage.version = targetVersion;
fs.writeFileSync(files.sidecarPackage, JSON.stringify(sidecarPackage, null, 2) + '\n');
console.log(`✓ Updated sidecar/package.json to ${targetVersion}`);

const webviewPackage = JSON.parse(fs.readFileSync(files.webviewPackage, 'utf8'));
webviewPackage.version = targetVersion;
fs.writeFileSync(files.webviewPackage, JSON.stringify(webviewPackage, null, 2) + '\n');
console.log(`✓ Updated src-tauri/webview/package.json to ${targetVersion}`);

// Update Cargo.toml
let cargoContent = fs.readFileSync(files.cargo, 'utf8');
cargoContent = cargoContent.replace(/^version = ".+"$/m, `version = "${targetVersion}"`);
fs.writeFileSync(files.cargo, cargoContent);
console.log(`✓ Updated src-tauri/Cargo.toml to ${targetVersion}`);

// Update tauri.conf.json
const tauriConfig = JSON.parse(fs.readFileSync(files.tauriConfig, 'utf8'));
tauriConfig.version = targetVersion;
fs.writeFileSync(files.tauriConfig, JSON.stringify(tauriConfig, null, 2) + '\n');
console.log(`✓ Updated src-tauri/tauri.conf.json to ${targetVersion}`);

console.log(`\n✅ All versions synced to ${targetVersion}`);
console.log(`   (Build number: ${buildNo})\n`);

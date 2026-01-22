const fs = require('fs');
const path = require('path');
const os = require('os');

const sidecarDir = path.join(__dirname, 'sidecar');
const targetDir = path.join(__dirname, 'sidecar-bundle');

// Determine platform-specific binary name
const platform = os.platform();
const arch = os.arch();

let binaryName;
let tauriTriple; // Tauri target triple

if (platform === 'darwin') {
    binaryName = 'apinox-sidecar';
    tauriTriple = arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin';
} else if (platform === 'win32') {
    binaryName = 'apinox-sidecar.exe';
    tauriTriple = 'x86_64-pc-windows-msvc';
} else if (platform === 'linux') {
    binaryName = 'apinox-sidecar';
    tauriTriple = arch === 'arm64' ? 'aarch64-unknown-linux-gnu' : 'x86_64-unknown-linux-gnu';
} else {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
}

console.log(`Preparing sidecar binary for ${platform} (${arch})...`);
console.log(`Looking for binary: ${binaryName}`);
console.log(`Tauri target triple: ${tauriTriple}`);

// Clean target
if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true });
}
fs.mkdirSync(targetDir, { recursive: true });

// Copy the appropriate binary
const sourceBinary = path.join(sidecarDir, binaryName);
// Tauri expects binaries to be named with the target triple suffix
const targetExt = platform === 'win32' ? '.exe' : '';
const targetBinary = path.join(targetDir, `sidecar-${tauriTriple}${targetExt}`);

if (!fs.existsSync(sourceBinary)) {
    console.error(`Binary not found: ${sourceBinary}`);
    console.error('Please run: cd sidecar && npm run binary');
    process.exit(1);
}

console.log(`Copying ${binaryName} to sidecar-bundle/sidecar...`);
fs.copyFileSync(sourceBinary, targetBinary);

// Make executable on Unix systems
if (platform !== 'win32') {
    fs.chmodSync(targetBinary, 0o755);
}

const binaryStats = fs.statSync(targetBinary);
const sizeMB = (binaryStats.size / 1024 / 1024).toFixed(2);

console.log(`✓ Sidecar binary prepared successfully!`);
console.log(`  Platform: ${platform}`);
console.log(`  Architecture: ${arch}`);
console.log(`  Target triple: ${tauriTriple}`);
console.log(`  Size: ${sizeMB} MB`);
console.log(`  Binary: ${targetBinary}`);

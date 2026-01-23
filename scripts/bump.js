const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Usage: node scripts/bump.js <type> <message>
const type = process.argv[2]; // major, minor, patch
// Join all remaining arguments to handle cases where quotes are stripped or message has spaces
const message = process.argv.slice(3).join(' '); // Optional commit message

if (!['major', 'minor', 'patch'].includes(type)) {
    console.error('Usage: node scripts/bump.js <major|minor|patch> [commit_message]');
    process.exit(1);
}

try {
    console.log(`Bumping version (${type})...`);
    // 1. Bump Version (root package.json)
    execSync(`npm version ${type} --no-git-tag-version`, { stdio: 'inherit' });

    // 2. Sync webview/package.json version
    const rootPackageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
    const newVersion = rootPackageJson.version;

    const webviewPackagePath = path.join(__dirname, '../src-tauri/webview/package.json');
    const webviewPackageJson = JSON.parse(fs.readFileSync(webviewPackagePath, 'utf8'));
    webviewPackageJson.version = newVersion;
    fs.writeFileSync(webviewPackagePath, JSON.stringify(webviewPackageJson, null, 4) + '\n');
    console.log(`Synced src-tauri/webview/package.json to v${newVersion}`);

    // 2b. Sync src-tauri/tauri.conf.json version
    const tauriConfigPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
    const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, 'utf8'));
    tauriConfig.version = newVersion;
    fs.writeFileSync(tauriConfigPath, JSON.stringify(tauriConfig, null, 2) + '\n');
    console.log(`Synced src-tauri/tauri.conf.json to v${newVersion}`);

    // 2. Update Changelog
    console.log('Updating Changelog...');
    // We can call update_changelog.js or inline it. Calling it ensures code reuse if we kept it.
    // But passing args to it via shell is safer if we just invoke node.
    // Let's rely on update_changelog.js handling the "message" arg if passed.
    if (message) {
        execSync(`node scripts/update_changelog.js "${message}"`, { stdio: 'inherit' });
    } else {
        execSync(`node scripts/update_changelog.js`, { stdio: 'inherit' });
    }

    // 3. Git Stage
    console.log('Staging all changes...');
    execSync('git add .', { stdio: 'inherit' });

    // 4. Git Commit (use newVersion from step 2)
    const commitMsg = message ? `v${newVersion}: ${message}` : `Bump version ${newVersion}`;

    console.log(`Committing: ${commitMsg}`);
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

    // 5. Git Tag
    console.log(`Tagging: v${newVersion}`);
    execSync(`git tag v${newVersion}`, { stdio: 'inherit' });

    console.log('Done!');

} catch (e) {
    console.error('Error during version bump:', e);
    process.exit(1);
}

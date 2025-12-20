const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

// Read version
const packageJson = require(packageJsonPath);
const version = packageJson.version;

// Read changelog
let changelog = '';
if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
}

// Generate header
const date = new Date().toISOString().split('T')[0];
const header = `## [${version}] - ${date}`;

// Check if already exists
if (changelog.includes(header)) {
    console.log('Changelog already has current version header.');
    process.exit(0);
}

// Prepend
// If file starts with "# Changelog", preserve it
let newContent = '';
if (changelog.startsWith('# Changelog')) {
    const lines = changelog.split('\n');
    // Keep first 2 lines (Header + Empty line)
    const headerLines = lines.slice(0, 2).join('\n');
    const rest = lines.slice(2).join('\n');
    newContent = `${headerLines}\n\n${header}\n${rest}`;
} else {
    newContent = `${header}\n${changelog}`;
}

fs.writeFileSync(changelogPath, newContent);
console.log(`Updated CHANGELOG.md with version ${version}`);

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

const { execSync } = require('child_process');

// Generate header
const date = new Date().toISOString().split('T')[0];
const header = `## [${version}] - ${date}`;

// Fetch git logs or use provided message
let changes = '';

// Check for CLI argument (e.g. from Task input)
const cliMessage = process.argv[2];

if (cliMessage && cliMessage.trim().length > 0) {
    changes = `- ${cliMessage}`;
} else {
    // Fallback to Git Log
    try {
        // Find the last commit that modified package.json
        // This serves as the "Previous Release" anchor if tags aren't used.
        let lastAnchor = '';
        try {
            lastAnchor = execSync('git log -n 1 --format="%H" -- package.json').toString().trim();
        } catch (e) {
            // No history for package.json
        }

        if (lastAnchor) {
            // Get commits since that anchor
            changes = execSync(`git log ${lastAnchor}..HEAD --pretty=format:"- %s"`).toString();
        } else {
            // Fallback: get last 10 commits
            changes = execSync('git log -n 10 --pretty=format:"- %s"').toString();
        }
    } catch (e) {
        changes = '- Could not auto-generate changes from git.';
    }
}

if (!changes) changes = '- No Commit messages found.';
const entry = `${header}\n### Auto-Generated Changes\n${changes}`;


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
    newContent = `${headerLines}\n\n${entry}\n${rest}`;
} else {
    newContent = `${entry}\n${changelog}`;
}

fs.writeFileSync(changelogPath, newContent);
console.log(`Updated CHANGELOG.md with version ${version}`);

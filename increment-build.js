#!/usr/bin/env node
/**
 * Increment Build Number
 * 
 * Reads the current build number from .buildno file,
 * increments it by 1, and writes it back.
 * 
 * Usage: node increment-build.js
 */

const fs = require('fs');
const path = require('path');

const buildNoFile = path.join(__dirname, '.buildno');

try {
    // Read current build number
    let buildNo = 1;
    if (fs.existsSync(buildNoFile)) {
        const content = fs.readFileSync(buildNoFile, 'utf8').trim();
        buildNo = parseInt(content, 10);
        
        if (isNaN(buildNo) || buildNo < 1) {
            console.error('⚠️  Invalid build number in .buildno file. Resetting to 1.');
            buildNo = 1;
        }
    } else {
        console.log('ℹ️  .buildno file not found. Creating with initial value: 1');
    }
    
    // Increment
    buildNo++;
    
    // Write back
    fs.writeFileSync(buildNoFile, buildNo.toString() + '\n', 'utf8');
    
    console.log(`✅ Build number incremented to: ${buildNo}`);
    process.exit(0);
    
} catch (error) {
    console.error('❌ Error incrementing build number:', error.message);
    process.exit(1);
}

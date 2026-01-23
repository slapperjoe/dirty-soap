#!/usr/bin/env node
const sharp = require('sharp');
const toIco = require('to-ico');
const fs = require('fs');
const path = require('path');

async function generateIcons() {
    const svgPath = path.join(__dirname, 'icon.svg');
    const sizes = [16, 32, 48, 64, 128, 256];
    
    console.log('🎨 Generating icon files from SVG...');
    
    // Generate PNG files at different sizes
    const pngBuffers = [];
    for (const size of sizes) {
        const pngPath = path.join(__dirname, `icon-${size}.png`);
        await sharp(svgPath)
            .resize(size, size, {
                kernel: sharp.kernel.nearest // Preserve pixel-perfect sharpness
            })
            .png()
            .toFile(pngPath);
        
        console.log(`  ✓ Generated ${size}x${size} PNG`);
        pngBuffers.push(fs.readFileSync(pngPath));
    }
    
    // Generate ICO file (for Windows)
    console.log('  🔨 Creating ICO file...');
    const icoBuffer = await toIco(pngBuffers);
    fs.writeFileSync(path.join(__dirname, 'icon.ico'), icoBuffer);
    console.log('  ✓ Generated icon.ico');
    
    // Keep the largest PNG for general use
    console.log('  📋 Copying 256x256 as main icon.png');
    fs.copyFileSync(
        path.join(__dirname, 'icon-256.png'),
        path.join(__dirname, 'icon.png')
    );
    
    console.log('✅ All icons generated successfully!');
}

generateIcons().catch(err => {
    console.error('❌ Error generating icons:', err);
    process.exit(1);
});

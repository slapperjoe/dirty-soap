# Sidecar Icons

This directory contains the icon assets for the APInox Sidecar executable.

## Icon Design

The icon features an **8-bit style overhead view of an F1 racing car** in red, symbolizing speed and performance for the sidecar process.

## Files

- `icon.svg` - Source SVG file (16x16 pixel grid, scalable)
- `icon-{size}.png` - Generated PNG files at various sizes (16, 32, 48, 64, 128, 256)
- `icon.ico` - Windows ICO file (multi-resolution)
- `icon.png` - Main PNG (256x256)

## Generation

Icons are automatically generated during the build process:

```bash
npm run icons        # Generate icons from SVG
npm run binary       # Build binary with icons
npm run binary:all   # Build for all platforms with icons
```

## Manual Generation

To regenerate icons manually:

```bash
node generate-icons.js
```

This will:
1. Convert the SVG to PNG files at multiple sizes
2. Bundle PNGs into a Windows ICO file
3. Copy the 256x256 PNG as the main icon

## Dependencies

- `sharp` - High-performance image processing
- `to-ico` - Convert PNG to ICO format
- `rcedit` - Apply icons to Windows executables

## Customization

To customize the icon, edit `icon.svg` and run `npm run icons` to regenerate all formats.

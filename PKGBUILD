# Maintainer: Your Name <your@email.com>
pkgname=apinox
pkgver=0.43.352
pkgrel=1
pkgdesc="A visual SOAP client desktop application"
arch=('x86_64')
options=('strip' '!debug')
url="https://github.com/slapperjoe/apinox"
license=('MIT')
depends=(
    'webkit2gtk-4.1'
    'gtk3'
    'libsoup3'
    'openssl'
)
# No makedepends needed - binary is pre-built by tauri:build
source=()
sha256sums=()

pkgver() {
    grep '^version' "$startdir/src-tauri/Cargo.toml" | head -1 | sed 's/version = "//;s/"//'
}

build() {
    # Binary is already compiled by `npm run tauri:build` - nothing to do here
    local _binary="$startdir/target/release/apinox"
    if [ ! -f "$_binary" ]; then
        echo "ERROR: Binary not found at $_binary"
        echo "Run 'npm run tauri:build' first."
        return 1
    fi
}

package() {
    local _root="$startdir"
    local _binary="$_root/target/release/apinox"
    local _icon_dir="$_root/src-tauri/icons"

    # Binary
    install -Dm755 "$_binary" "$pkgdir/usr/bin/apinox"

    # Icons
    install -Dm644 "$_icon_dir/32x32.png"   "$pkgdir/usr/share/icons/hicolor/32x32/apps/apinox.png"
    install -Dm644 "$_icon_dir/64x64.png"   "$pkgdir/usr/share/icons/hicolor/64x64/apps/apinox.png"
    install -Dm644 "$_icon_dir/128x128.png" "$pkgdir/usr/share/icons/hicolor/128x128/apps/apinox.png"
    install -Dm644 "$_icon_dir/icon.png"    "$pkgdir/usr/share/icons/hicolor/256x256/apps/apinox.png"

    # .desktop file
    install -Dm644 /dev/stdin "$pkgdir/usr/share/applications/apinox.desktop" <<EOF
[Desktop Entry]
Name=APInox
Comment=API Testing & Discovery
Exec=apinox
Icon=apinox
Terminal=false
Type=Application
Categories=Development;Network;
StartupWMClass=apinox
EOF

    # License
    install -Dm644 "$_root/LICENSE.md" "$pkgdir/usr/share/licenses/$pkgname/LICENSE"
}

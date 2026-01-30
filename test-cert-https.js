// Test Node.js HTTPS Server with APInox Certificate
// This will help diagnose if the certificate works with Node.js

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('APInox Certificate Test\n========================\n');

const certPath = path.join(os.tmpdir(), 'apinox-proxy.cer');
const keyPath = path.join(os.tmpdir(), 'apinox-proxy.key');

// Check if files exist
if (!fs.existsSync(certPath)) {
    console.error('❌ Certificate not found at:', certPath);
    console.log('\nPlease start APInox proxy first to generate the certificate.');
    process.exit(1);
}

if (!fs.existsSync(keyPath)) {
    console.error('❌ Key not found at:', keyPath);
    console.log('\nPlease start APInox proxy first to generate the key.');
    process.exit(1);
}

console.log('✓ Certificate file found:', certPath);
console.log('✓ Key file found:', keyPath);
console.log();

// Read the certificate and key
let cert, key;
try {
    cert = fs.readFileSync(certPath, 'utf8');
    key = fs.readFileSync(keyPath, 'utf8');
    console.log('✓ Certificate and key loaded successfully');
} catch (err) {
    console.error('❌ Failed to read certificate/key:', err.message);
    process.exit(1);
}

// Validate PEM format
console.log('\nValidating certificate format...');
if (!cert.includes('-----BEGIN CERTIFICATE-----')) {
    console.error('❌ Certificate is not in PEM format!');
    console.log('First 100 chars:', cert.substring(0, 100));
    process.exit(1);
}
console.log('✓ Certificate is in PEM format');

if (!key.includes('-----BEGIN')) {
    console.error('❌ Key is not in PEM format!');
    console.log('First 100 chars:', key.substring(0, 100));
    process.exit(1);
}
console.log('✓ Key is in PEM format');

// Try to create an HTTPS server
console.log('\nCreating test HTTPS server on port 9999...');
try {
    const server = https.createServer({
        key: key,
        cert: cert,
        // Add these to help with compatibility
        secureProtocol: 'TLS_method',
        minVersion: 'TLSv1.2'
    }, (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('APInox Test Server - Certificate is working!\n');
    });

    server.listen(9999, () => {
        console.log('✓ HTTPS server started successfully on port 9999');
        console.log('\nTest the server with:');
        console.log('  curl -k https://localhost:9999');
        console.log('\nIf this works, the problem is with APInox proxy configuration.');
        console.log('If this fails, the certificate itself is bad.\n');
        console.log('Press Ctrl+C to stop the test server.');
    });

    server.on('error', (err) => {
        console.error('❌ Server error:', err.message);
        if (err.code === 'ERR_OSSL_X509_KEY_VALUES_MISMATCH') {
            console.log('\n⚠️  Certificate and key do NOT match!');
            console.log('The certificate was regenerated but the key is old (or vice versa).');
            console.log('\nSolution: Delete both files and restart APInox proxy:');
            console.log('  del', certPath);
            console.log('  del', keyPath);
        } else if (err.code === 'EADDRINUSE') {
            console.log('\n⚠️  Port 9999 is already in use. Stop APInox proxy and try again.');
        }
        process.exit(1);
    });

    server.on('tlsClientError', (err) => {
        console.error('❌ TLS handshake error:', err.message);
        console.log('\nThis means clients cannot establish a secure connection.');
        console.log('The certificate may be malformed or incompatible.');
    });

} catch (err) {
    console.error('❌ Failed to create HTTPS server:', err.message);
    console.log('\nStack:', err.stack);
    process.exit(1);
}

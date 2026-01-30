# APInox Proxy HTTPS Certificate Installation Guide

When using APInox's proxy/mock server with HTTPS targets, you need to:
1. **Trust the certificate** (install to Trusted Root CA)
2. **Bind the certificate to the port** (Windows HTTP.SYS requirement for .NET/WCF)

## The Windows HTTP.SYS Issue

On Windows, **.NET/WCF applications** require certificates to be bound to ports using `netsh`. Simply trusting the certificate is **NOT enough**!

### Error: "The server certificate is not configured properly with HTTP.SYS"

This error means you need to bind the certificate to the port. Follow the binding steps below.

---

## Complete Setup (Windows)

### Step 1: Trust the Certificate

First, install the certificate to your trust store:

**Option A: Automated Script**
```powershell
# Open PowerShell as Administrator
.\install-proxy-cert.ps1
```

**Option B: Manual Installation**
1. Click the Shield icon (🛡️) in APInox Server tab
2. Click "Install Certificate"
3. Select "Local Machine" → "Trusted Root Certification Authorities"

### Step 2: Bind Certificate to Port (REQUIRED for .NET/WCF)

**This is the critical step most people miss!**

```powershell
# Open PowerShell as Administrator
.\bind-proxy-cert.ps1

# If using a different port:
.\bind-proxy-cert.ps1 -Port 9001
```

This script uses `netsh http add sslcert` to bind the certificate to the proxy port, which is required by HTTP.SYS.

### Step 3: Restart Everything

1. Restart the APInox proxy
2. Restart your .NET/WCF application

---

## Quick Installation (Windows - All Steps)

## Quick Installation (Windows - All Steps)

**Run these commands as Administrator:**

```powershell
cd path\to\apinox

# Step 1: Start APInox and start the proxy with HTTPS target
# (Do this first so the certificate is generated)

# Step 2: Install certificate to trust store
.\install-proxy-cert.ps1

# Step 3: Bind certificate to port (REQUIRED for .NET/WCF)
.\bind-proxy-cert.ps1

# Step 4: Restart the proxy and your application
```

---

## What's the Difference?

| Step | What It Does | Required For |
|------|-------------|--------------|
| **Install Certificate** | Adds cert to Windows trust store | All HTTPS connections |
| **Bind Certificate** | Registers cert with HTTP.SYS for specific port | .NET/WCF applications |

**If you only did Step 1**, you'll still get the HTTP.SYS error with .NET apps!

---

### Option 1: Automated PowerShell Script

1. **Start the APInox proxy** with an HTTPS target URL (e.g., `https://localhost:8080`)
2. **Open PowerShell as Administrator**:
   - Press `Win + X`
   - Select "Windows PowerShell (Admin)" or "Terminal (Admin)"
3. **Run the installation script**:
   ```powershell
   cd path\to\apinox
   .\install-proxy-cert.ps1
   ```
4. **Restart your application** (the one making requests through the proxy)

### Option 2: Manual Installation

1. **Start the APInox proxy** with an HTTPS target URL
2. **Click the Shield icon** (🛡️) in the Server tab to open the certificate
3. **Install the certificate**:
   - Click "Install Certificate"
   - Select "Local Machine" (requires Administrator privileges)
   - Click "Next"
   - Select "Place all certificates in the following store"
   - Click "Browse" and select **"Trusted Root Certification Authorities"**
   - Click "Next" and "Finish"
4. **Restart your application**

## Certificate Location

The certificate is automatically generated at:
- **Windows**: `%TEMP%\apinox-proxy.cer`
- **macOS/Linux**: `/tmp/apinox-proxy.cer`

## Troubleshooting

### Error: "Maximum call stack size exceeded"
This error in the APInox logs is unrelated to certificates. It's a React hook dependency issue that's being investigated.

### Error: "The server certificate is not configured properly with HTTP.SYS"
This error means your .NET/WCF application doesn't trust the proxy's certificate.

**Solution**: Install the certificate using one of the methods above.

### Error: "Certificate file not found"
The certificate is only generated when you:
1. Set an HTTPS target URL (starts with `https://`)
2. Start the proxy server

Make sure the proxy has been started at least once.

### Application still can't connect after installing certificate
1. **Verify certificate is installed**:
   ```powershell
   certmgr.msc
   ```
   - Navigate to: Trusted Root Certification Authorities > Certificates
   - Look for "APInox Proxy" or "localhost"

2. **Restart your application** completely (not just the proxy)

3. **Check your application's certificate validation**:
   - Some .NET applications have custom certificate validation
   - You may need to bypass certificate validation in your app's code:
   ```csharp
   ServicePointManager.ServerCertificateValidationCallback = 
       (sender, cert, chain, sslPolicyErrors) => true; // ONLY FOR DEVELOPMENT
   ```

## Security Notes

⚠️ **The APInox proxy certificate is self-signed and should only be used for development/testing.**

- Do not use this certificate in production environments
- Remove the certificate when you're done testing:
  ```powershell
  # Run as Administrator
  Get-ChildItem Cert:\LocalMachine\Root | Where-Object {$_.Subject -like "*APInox*"} | Remove-Item
  ```

## Platform-Specific Notes

### macOS
```bash
# Add certificate to keychain
sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain /tmp/apinox-proxy.cer
```

### Linux
```bash
# Copy certificate to trusted store
sudo cp /tmp/apinox-proxy.cer /usr/local/share/ca-certificates/apinox-proxy.crt
sudo update-ca-certificates
```

## Need Help?

If you're still having issues, please check:
- The APInox logs for specific error messages
- Your firewall/antivirus settings
- Your application's SSL/TLS configuration

For more help, open an issue on GitHub with:
- The exact error message
- Your target URL (redacted if sensitive)
- Your operating system
- Whether the certificate appears in your trust store

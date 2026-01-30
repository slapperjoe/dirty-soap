# APInox Proxy Certificate Installation Script
# This script installs the APInox self-signed certificate to the Windows certificate store
# so that .NET applications can trust HTTPS connections to the proxy.

param(
    [string]$CertPath = "$env:TEMP\apinox-proxy.cer"
)

Write-Host "APInox Proxy Certificate Installer" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Write-Host "To run as Administrator:" -ForegroundColor Yellow
    Write-Host "1. Right-click PowerShell" -ForegroundColor Yellow
    Write-Host "2. Select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "3. Run this script again" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

# Check if certificate file exists
if (-not (Test-Path $CertPath)) {
    Write-Host "ERROR: Certificate file not found at: $CertPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure the proxy has generated the certificate by:" -ForegroundColor Yellow
    Write-Host "1. Starting APInox" -ForegroundColor Yellow
    Write-Host "2. Going to Server tab" -ForegroundColor Yellow
    Write-Host "3. Setting an HTTPS target URL" -ForegroundColor Yellow
    Write-Host "4. Starting the proxy server" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Certificate file found: $CertPath" -ForegroundColor Green
Write-Host ""

try {
    # Import the certificate using constructor (Import is immutable in newer .NET)
    Write-Host "Installing certificate to Trusted Root Certification Authorities..." -ForegroundColor Yellow
    
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)
    
    $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
    $store.Open("ReadWrite")
    
    # Check if certificate already exists
    $existingCert = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
    
    if ($existingCert) {
        Write-Host "Certificate is already installed!" -ForegroundColor Green
    } else {
        $store.Add($cert)
        Write-Host "Certificate installed successfully!" -ForegroundColor Green
    }
    
    $store.Close()
    
    Write-Host ""
    Write-Host "Certificate Details:" -ForegroundColor Cyan
    Write-Host "  Subject: $($cert.Subject)" -ForegroundColor White
    Write-Host "  Issuer: $($cert.Issuer)" -ForegroundColor White
    Write-Host "  Valid From: $($cert.NotBefore)" -ForegroundColor White
    Write-Host "  Valid Until: $($cert.NotAfter)" -ForegroundColor White
    Write-Host "  Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
    Write-Host ""
    Write-Host "SUCCESS! Certificate installed to Trusted Root CA." -ForegroundColor Green
    Write-Host ""
    Write-Host "IMPORTANT: For .NET/WCF applications, you MUST also bind the certificate:" -ForegroundColor Yellow
    Write-Host "  .\bind-proxy-cert.ps1" -ForegroundColor White
    Write-Host ""
    
} catch {
    Write-Host "ERROR: Failed to install certificate!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Please try the manual installation method:" -ForegroundColor Yellow
    Write-Host "1. Double-click the certificate file: $CertPath" -ForegroundColor Yellow
    Write-Host "2. Click 'Install Certificate'" -ForegroundColor Yellow
    Write-Host "3. Select 'Local Machine' (requires admin)" -ForegroundColor Yellow
    Write-Host "4. Select 'Place all certificates in the following store'" -ForegroundColor Yellow
    Write-Host "5. Click 'Browse' and select 'Trusted Root Certification Authorities'" -ForegroundColor Yellow
    Write-Host "6. Click 'Next' and 'Finish'" -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Read-Host "Press Enter to exit"

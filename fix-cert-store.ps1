# APInox Certificate Store Diagnostic and Fix
# Checks where the certificate is installed and moves it to LocalMachine if needed

param(
    [string]$Thumbprint = "E77F392EAB2E923BB24E8431ADBF09A0F493423F",
    [string]$CertPath = "$env:TEMP\apinox-proxy.cer"
)

Write-Host "APInox Certificate Store Diagnostic" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if running as Administrator
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERROR: This script must be run as Administrator!" -ForegroundColor Red
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "Searching for certificate with thumbprint: $Thumbprint" -ForegroundColor Yellow
Write-Host ""

# Check CurrentUser\Root
Write-Host "Checking CurrentUser\Root..." -ForegroundColor Yellow
$userCert = Get-ChildItem Cert:\CurrentUser\Root | Where-Object { $_.Thumbprint -eq $Thumbprint }

if ($userCert) {
    Write-Host "  ✓ Found in CurrentUser\Root" -ForegroundColor Green
    Write-Host "    Subject: $($userCert.Subject)" -ForegroundColor White
} else {
    Write-Host "  ✗ Not found in CurrentUser\Root" -ForegroundColor Gray
}

# Check LocalMachine\Root
Write-Host "Checking LocalMachine\Root..." -ForegroundColor Yellow
$machineCert = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $Thumbprint }

if ($machineCert) {
    Write-Host "  ✓ Found in LocalMachine\Root" -ForegroundColor Green
    Write-Host "    Subject: $($machineCert.Subject)" -ForegroundColor White
    Write-Host ""
    Write-Host "Certificate is correctly installed! The binding should work." -ForegroundColor Green
    Write-Host "If binding still fails, try:" -ForegroundColor Yellow
    Write-Host "  1. Stop the APInox proxy" -ForegroundColor White
    Write-Host "  2. Run: .\bind-proxy-cert.ps1" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 0
} else {
    Write-Host "  ✗ Not found in LocalMachine\Root" -ForegroundColor Red
}

Write-Host ""

# If found in CurrentUser but not LocalMachine, offer to move it
if ($userCert -and -not $machineCert) {
    Write-Host "PROBLEM FOUND: Certificate is in CurrentUser store, but netsh requires LocalMachine store!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Would you like to install it to LocalMachine\Root? (Y/N)" -ForegroundColor Yellow
    $response = Read-Host
    
    if ($response -eq 'Y' -or $response -eq 'y') {
        try {
            Write-Host "Installing certificate to LocalMachine\Root..." -ForegroundColor Yellow
            
            $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
            $store.Open("ReadWrite")
            $store.Add($userCert)
            $store.Close()
            
            Write-Host "✓ Certificate installed to LocalMachine\Root successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Now run the binding script:" -ForegroundColor Cyan
            Write-Host "  .\bind-proxy-cert.ps1" -ForegroundColor White
            Write-Host ""
        } catch {
            Write-Host "✗ Failed to install certificate!" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    }
    
    Read-Host "Press Enter to exit"
    exit 0
}

# If not found anywhere, try to load from file
if (-not $userCert -and -not $machineCert) {
    Write-Host "Certificate not found in any store!" -ForegroundColor Red
    Write-Host ""
    
    if (Test-Path $CertPath) {
        Write-Host "Certificate file found at: $CertPath" -ForegroundColor Yellow
        Write-Host "Installing to LocalMachine\Root..." -ForegroundColor Yellow
        
        try {
            $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)
            
            Write-Host "Certificate details:" -ForegroundColor Cyan
            Write-Host "  Subject: $($cert.Subject)" -ForegroundColor White
            Write-Host "  Thumbprint: $($cert.Thumbprint)" -ForegroundColor White
            Write-Host ""
            
            $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
            $store.Open("ReadWrite")
            $store.Add($cert)
            $store.Close()
            
            Write-Host "✓ Certificate installed to LocalMachine\Root successfully!" -ForegroundColor Green
            Write-Host ""
            Write-Host "Now run the binding script:" -ForegroundColor Cyan
            Write-Host "  .\bind-proxy-cert.ps1" -ForegroundColor White
            Write-Host ""
        } catch {
            Write-Host "✗ Failed to install certificate!" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
        }
    } else {
        Write-Host "Certificate file not found at: $CertPath" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please:" -ForegroundColor Yellow
        Write-Host "1. Start APInox" -ForegroundColor White
        Write-Host "2. Start the proxy with an HTTPS target" -ForegroundColor White
        Write-Host "3. Run this script again" -ForegroundColor White
    }
}

Write-Host ""
Read-Host "Press Enter to exit"

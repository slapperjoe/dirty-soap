# APInox Proxy Certificate Binding Script
# This script binds the APInox certificate to the HTTPS port for HTTP.SYS
# Required for .NET/WCF applications to accept HTTPS connections to the proxy

param(
    [int]$Port = 9000,
    [string]$CertPath = "$env:TEMP\apinox-proxy.cer"
)

Write-Host "APInox Proxy Certificate Binding" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
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
    Write-Host "Please start the APInox proxy first to generate the certificate." -ForegroundColor Yellow
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

try {
    # Load the certificate using constructor (Import is immutable in newer .NET)
    $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($CertPath)
    
    $certHash = $cert.GetCertHashString()
    $appId = "{12345678-1234-1234-1234-123456789012}" # APInox GUID
    
    Write-Host "Certificate Details:" -ForegroundColor Cyan
    Write-Host "  Subject: $($cert.Subject)" -ForegroundColor White
    Write-Host "  Thumbprint: $certHash" -ForegroundColor White
    Write-Host "  Port: $Port" -ForegroundColor White
    Write-Host ""
    
    # Remove existing binding if it exists
    Write-Host "Checking for existing bindings on port $Port..." -ForegroundColor Yellow
    $existingBinding = netsh http show sslcert ipport=0.0.0.0:$Port 2>$null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Removing existing binding..." -ForegroundColor Yellow
        netsh http delete sslcert ipport=0.0.0.0:$Port | Out-Null
    }
    
    # Add new binding
    Write-Host "Binding certificate to port $Port..." -ForegroundColor Yellow
    Write-Host "Running: netsh http add sslcert ipport=0.0.0.0:$Port certhash=$certHash appid=$appId" -ForegroundColor Gray
    Write-Host ""
    
    # Capture output and errors
    $output = netsh http add sslcert ipport=0.0.0.0:$Port certhash=$certHash appid=$appId 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    
    Write-Host $output
    
    if ($exitCode -eq 0) {
        Write-Host ""
        Write-Host "SUCCESS! Certificate bound to port $Port" -ForegroundColor Green
        Write-Host ""
        Write-Host "The APInox proxy is now configured for HTTPS." -ForegroundColor Green
        Write-Host ""
        Write-Host "Next steps:" -ForegroundColor Cyan
        Write-Host "1. (Re)start the APInox proxy server" -ForegroundColor White
        Write-Host "2. Configure your application to use: https://localhost:$Port" -ForegroundColor White
        Write-Host "3. Test your SOAP requests through the proxy" -ForegroundColor White
        Write-Host ""
        
        # Show current binding
        Write-Host "Current binding configuration:" -ForegroundColor Cyan
        netsh http show sslcert ipport=0.0.0.0:$Port
    } else {
        throw "netsh failed with exit code: $exitCode`nOutput: $output"
    }
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to bind certificate!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Troubleshooting:" -ForegroundColor Yellow
    Write-Host "1. Make sure the certificate is installed in Trusted Root CA store" -ForegroundColor White
    Write-Host "2. Verify no other service is using port $Port" -ForegroundColor White
    Write-Host "3. Try running with a different port: .\bind-proxy-cert.ps1 -Port 9001" -ForegroundColor White
    Write-Host ""
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "To remove this binding later, run:" -ForegroundColor Yellow
Write-Host "  netsh http delete sslcert ipport=0.0.0.0:$Port" -ForegroundColor White
Write-Host ""
Read-Host "Press Enter to exit"

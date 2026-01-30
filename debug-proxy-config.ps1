# APInox Proxy Configuration Checker
# Diagnoses common proxy setup issues

Write-Host "APInox Proxy Configuration Checker" -ForegroundColor Cyan
Write-Host "===================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "This will help diagnose your proxy setup issue." -ForegroundColor Yellow
Write-Host ""

# Question 1: What's the target URL?
Write-Host "1. What is your PROXY TARGET URL in APInox?" -ForegroundColor Cyan
Write-Host "   (The actual backend service you're proxying TO)" -ForegroundColor Gray
Write-Host "   Example: https://api.example.com:8080/services" -ForegroundColor Gray
$targetUrl = Read-Host "   Enter target URL"
Write-Host ""

# Question 2: What URL is the client using?
Write-Host "2. What URL is your .NET APPLICATION configured to use?" -ForegroundColor Cyan
Write-Host "   (The URL pointing to the proxy)" -ForegroundColor Gray
Write-Host "   Example: http://localhost:9000 or https://localhost:9000" -ForegroundColor Gray
$clientUrl = Read-Host "   Enter client URL"
Write-Host ""

# Question 3: What port is the proxy on?
Write-Host "3. What PORT is the APInox proxy listening on?" -ForegroundColor Cyan
Write-Host "   (Default is 9000)" -ForegroundColor Gray
$proxyPort = Read-Host "   Enter port (or press Enter for 9000)"
if ([string]::IsNullOrWhiteSpace($proxyPort)) {
    $proxyPort = "9000"
}
Write-Host ""

Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "ANALYSIS" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

$targetIsHttps = $targetUrl.ToLower().StartsWith("https")
$clientIsHttps = $clientUrl.ToLower().StartsWith("https")

Write-Host "Target URL: $targetUrl" -ForegroundColor White
Write-Host "  Protocol: $(if ($targetIsHttps) { 'HTTPS' } else { 'HTTP' })" -ForegroundColor $(if ($targetIsHttps) { 'Green' } else { 'Yellow' })
Write-Host ""

Write-Host "Client URL: $clientUrl" -ForegroundColor White
Write-Host "  Protocol: $(if ($clientIsHttps) { 'HTTPS' } else { 'HTTP' })" -ForegroundColor $(if ($clientIsHttps) { 'Green' } else { 'Yellow' })
Write-Host ""

Write-Host "Proxy Port: $proxyPort" -ForegroundColor White
Write-Host ""

# CRITICAL ISSUE: Check if protocols match
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "DIAGNOSIS" -ForegroundColor Cyan
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""

if ($targetIsHttps -and -not $clientIsHttps) {
    Write-Host "⚠️  PROBLEM FOUND!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Your target is HTTPS but your client is using HTTP." -ForegroundColor Red
    Write-Host ""
    Write-Host "When APInox proxy targets an HTTPS service, the proxy ITSELF" -ForegroundColor Yellow
    Write-Host "becomes an HTTPS server. This means your client must also use HTTPS." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "SOLUTION:" -ForegroundColor Cyan
    Write-Host "  Change your .NET application to use: https://localhost:$proxyPort" -ForegroundColor Green
    Write-Host ""
    Write-Host "Example WCF config change:" -ForegroundColor Cyan
    Write-Host "  <endpoint address=`"https://localhost:$proxyPort/YourService`"" -ForegroundColor White
    Write-Host "            binding=`"basicHttpsBinding`"  ← Note: HTTPS binding!" -ForegroundColor White
    Write-Host "            contract=`"YourContract`" />" -ForegroundColor White
    Write-Host ""
}
elseif (-not $targetIsHttps -and $clientIsHttps) {
    Write-Host "⚠️  PROBLEM FOUND!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Your target is HTTP but your client is using HTTPS." -ForegroundColor Red
    Write-Host ""
    Write-Host "SOLUTION:" -ForegroundColor Cyan
    Write-Host "  Change your .NET application to use: http://localhost:$proxyPort" -ForegroundColor Green
    Write-Host ""
}
elseif ($targetIsHttps -and $clientIsHttps) {
    Write-Host "✓ Protocols match! Both using HTTPS." -ForegroundColor Green
    Write-Host ""
    Write-Host "If you're still getting handshake errors, check:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Is the proxy actually running?" -ForegroundColor Cyan
    Write-Host "   - Open APInox" -ForegroundColor White
    Write-Host "   - Go to Server tab" -ForegroundColor White
    Write-Host "   - Make sure it shows 'Running' with a green dot" -ForegroundColor White
    Write-Host ""
    Write-Host "2. Is the certificate trusted by your .NET app?" -ForegroundColor Cyan
    Write-Host "   - Run: Get-ChildItem Cert:\LocalMachine\Root | Where-Object {`$_.Subject -like '*localhost*'}" -ForegroundColor White
    Write-Host "   - Should show the APInox certificate" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Try bypassing certificate validation in your .NET app (DEV ONLY):" -ForegroundColor Cyan
    Write-Host "   ServicePointManager.ServerCertificateValidationCallback = " -ForegroundColor White
    Write-Host "       (sender, cert, chain, errors) => true;" -ForegroundColor White
    Write-Host ""
    Write-Host "4. Test the proxy with curl:" -ForegroundColor Cyan
    Write-Host "   curl -k https://localhost:$proxyPort" -ForegroundColor White
    Write-Host "   (Should get a response, not a connection error)" -ForegroundColor White
    Write-Host ""
}
else {
    Write-Host "✓ Protocols match! Both using HTTP." -ForegroundColor Green
    Write-Host ""
    Write-Host "Your setup looks correct. If you're still having issues:" -ForegroundColor Yellow
    Write-Host "- Make sure the proxy is running" -ForegroundColor White
    Write-Host "- Check the APInox logs for errors" -ForegroundColor White
    Write-Host "- Verify the target URL is correct" -ForegroundColor White
    Write-Host ""
}

Write-Host ""
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host "IMPORTANT: netsh binding is NOT needed!" -ForegroundColor Yellow
Write-Host "===========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "The netsh binding we tried earlier is only for IIS/HTTP.SYS servers." -ForegroundColor Yellow
Write-Host "Node.js (APInox) has its own HTTPS server that doesn't need netsh." -ForegroundColor Yellow
Write-Host ""
Write-Host "You can IGNORE the netsh binding - just make sure:" -ForegroundColor Cyan
Write-Host "  1. Certificate is in LocalMachine\Root (✓ Done)" -ForegroundColor White
Write-Host "  2. Client uses HTTPS if target is HTTPS" -ForegroundColor White
Write-Host "  3. Proxy is running" -ForegroundColor White
Write-Host ""

Read-Host "Press Enter to exit"

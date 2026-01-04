/**
 * WSDL Connectivity Diagnostic (Node.js)
 * 
 * Usage:
 *   node debug-wsdl.js <URL>
 * 
 * Description:
 *   This script attempts to connect to a WSDL endpoint.
 *   IT SETS NODE_TLS_REJECT_UNAUTHORIZED = '0' to FORCEFULLY disable SSL checks.
 */

// FORCE DISABLE SSL CHECKS GLOBALLY
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const soap = require('soap');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { HttpProxyAgent } = require('http-proxy-agent');

const url = process.argv[2];

if (!url) {
    console.error('Usage: node debug-wsdl.js <URL>');
    process.exit(1);
}

console.log('--- WSDL Connectivity Diagnostic (Node.js) ---');
console.log(`Target URL: ${url}`);
console.log('(!) NODE_TLS_REJECT_UNAUTHORIZED set to 0');

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
console.log(`Proxy Environment Variable: ${proxyUrl || 'Not Set'}`);

async function testConnection() {
    const options = {};

    // Even with the env var, we want to set up the agent correctly for the proxy
    if (proxyUrl) {
        console.log('Configuring Proxy Agent...');
        // We still pass rejectUnauthorized: false just in case, but the env var is the hammer.
        const agentOptions = { rejectUnauthorized: false };

        const agent = url.startsWith('https')
            ? new HttpsProxyAgent(proxyUrl, agentOptions)
            : new HttpProxyAgent(proxyUrl);

        options.request = axios.create({
            httpsAgent: agent,
            httpAgent: agent,
            proxy: false
        });
    } else {
        console.log('No proxy detected. Using direct connection (insecure).');
        const httpsAgent = new (require('https').Agent)({ rejectUnauthorized: false });
        options.request = axios.create({
            httpsAgent: httpsAgent,
            proxy: false
        });
    }

    try {
        console.log('Attempting soap.createClientAsync...');
        const client = await soap.createClientAsync(url, options);
        console.log('SUCCESS: Client created.');
        const services = client.describe();
        console.log('Services found:', Object.keys(services));
    } catch (error) {
        console.error('FAILURE:', error.message);
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Body:', error.response.data);
        }
        if (error.cause) {
            console.error('Cause:', error.cause);
        }
        console.error('Stack:', error.stack);
    }
}

testConnection();

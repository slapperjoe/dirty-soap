"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const soapClient_1 = require("./src/soapClient");
const path = require("path");
async function verifyLocal() {
    const cwd = process.cwd();
    const wsdlPath = path.join(cwd, 'wsdl_files', 'CountryInfoService.wsdl');
    console.log(`Testing local WSDL path: ${wsdlPath}`);
    const client = new soapClient_1.SoapClient();
    try {
        console.log('Parsing WSDL...');
        const services = await client.parseWsdl(wsdlPath);
        console.log('Services found:', services.length);
        console.log('Service Name:', services[0].name);
        console.log('Executing Request (FullCountryInfo) locally...');
        // Note: Even if WSDL is local, the endpoint in WSDL is usually remote.
        const result = await client.executeRequest(wsdlPath, 'FullCountryInfo', { sCountryISOCode: 'US' });
        console.log('Result Success:', result.success);
        if (result.success) {
            console.log('Country Name:', result.result.FullCountryInfoResult.sName);
        }
        else {
            console.error('Error:', result.error);
        }
    }
    catch (error) {
        console.error('Verification failed:', error);
    }
}
verifyLocal().catch(console.error);
//# sourceMappingURL=verify_local_soap.js.map
/**
 * Debug script to see exactly what operation data looks like
 */

const soap = require('soap');
const { WsdlParser } = require('./out/WsdlParser');

const CALCULATOR_URL = 'http://www.dneonline.com/calculator.asmx?WSDL';

async function debugCalculator() {
    console.log('Testing Calculator WSDL...\n');
    
    // Test with WsdlParser (our code)
    console.log('='.repeat(80));
    console.log('USING WsdlParser (our implementation)');
    console.log('='.repeat(80));
    
    const parser = new WsdlParser();
    const services = await parser.parseWsdl(CALCULATOR_URL);
    
    if (services.length > 0) {
        const service = services[0];
        console.log(`Service: ${service.name}`);
        console.log(`Target Namespace: ${service.targetNamespace}`);
        
        if (service.operations.length > 0) {
            const op = service.operations[0];
            console.log(`\nFirst Operation: ${op.name}`);
            console.log(`\noperation.input:`);
            console.log(JSON.stringify(op.input, null, 2));
            console.log(`\noperation.fullSchema:`);
            console.log(JSON.stringify(op.fullSchema, null, 2));
            
            // Check meaningful keys
            const METADATA_FIELDS = ['targetNSAlias', 'targetNamespace'];
            if (op.input && typeof op.input === 'object') {
                const meaningfulKeys = Object.keys(op.input).filter(key => 
                    !key.startsWith('$') && !METADATA_FIELDS.includes(key)
                );
                console.log(`\nMeaningful keys in input: ${meaningfulKeys.length}`);
                console.log(`Keys: ${meaningfulKeys.join(', ')}`);
            }
        }
    }
    
    // Test with raw node-soap
    console.log('\n' + '='.repeat(80));
    console.log('USING node-soap directly');
    console.log('='.repeat(80));
    
    const client = await soap.createClientAsync(CALCULATOR_URL);
    const description = client.describe();
    const serviceName = Object.keys(description)[0];
    const service = description[serviceName];
    const portName = Object.keys(service)[0];
    const port = service[portName];
    const opName = Object.keys(port)[0];
    const operation = port[opName];
    
    console.log(`\nOperation: ${opName}`);
    console.log(`\noperation.input (raw node-soap):`);
    console.log(JSON.stringify(operation.input, null, 2));
}

debugCalculator().catch(console.error);

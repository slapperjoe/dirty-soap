// Quick test of the actual generateInitialXmlForOperation function

const { generateInitialXmlForOperation } = require('./webview/src/utils/soapUtils.ts');

// Test with Calculator-like operation (has input, no fullSchema)
const calculatorOp = {
    name: 'Add',
    input: {
        intA: 's:int',
        intB: 's:int'
    },
    fullSchema: undefined,
    targetNamespace: 'http://tempuri.org/'
};

console.log('Testing Calculator-like operation:');
console.log('Operation:', JSON.stringify(calculatorOp, null, 2));
console.log('\nGenerated XML:');
console.log(generateInitialXmlForOperation(calculatorOp));

// Test with empty input (Country Info-like)
const countryInfoOp = {
    name: 'ListOfContinentsByName',
    input: {},
    fullSchema: {
        name: 'ListOfContinentsByName',
        kind: 'complex',
        children: []
    },
    targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo'
};

console.log('\n\nTesting Country Info-like operation:');
console.log('Operation:', JSON.stringify(countryInfoOp, null, 2));
console.log('\nGenerated XML:');
console.log(generateInitialXmlForOperation(countryInfoOp));

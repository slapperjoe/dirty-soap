import { describe, it, expect } from 'vitest';
import { getInitialXml, generateXmlFromSchema } from '../utils/soapUtils';

describe('soapUtils', () => {
    describe('getInitialXml', () => {
        it('should handle simple types', () => {
            const input = {
                intA: 'xs:int',
                intB: 'xs:int'
            };
            const result = getInitialXml(input);
            expect(result).toContain('<tem:intA>?</tem:intA>');
            expect(result).toContain('<tem:intB>?</tem:intB>');
        });

        it('should handle nested complex types', () => {
            const input = {
                sCountryISOCode: 'xs:string',
                Address: {
                    Street: 'xs:string',
                    City: 'xs:string'
                }
            };
            const result = getInitialXml(input);
            expect(result).toContain('<tem:sCountryISOCode>?</tem:sCountryISOCode>');
            expect(result).toContain('<tem:Address>');
            expect(result).toContain('<tem:Street>?</tem:Street>');
            expect(result).toContain('<tem:City>?</tem:City>');
            expect(result).toContain('</tem:Address>');
        });

        it('should handle arrays of complex types (node-soap format)', () => {
            const input = {
                Languages: {
                    'tLanguage[]': {
                        sISOCode: 'xs:string',
                        sName: 'xs:string'
                    }
                }
            };
            const result = getInitialXml(input);
            
            // Should generate tLanguage element (without [])
            expect(result).toContain('<tem:tLanguage>');
            expect(result).toContain('</tem:tLanguage>');
            expect(result).toContain('<tem:sISOCode>?</tem:sISOCode>');
            expect(result).toContain('<tem:sName>?</tem:sName>');
            
            // Should NOT contain the array notation
            expect(result).not.toContain('tLanguage[]');
        });

        it('should handle arrays of simple types', () => {
            const input = {
                Items: {
                    'string[]': 'xs:string'
                }
            };
            const result = getInitialXml(input);
            expect(result).toContain('<tem:string>?</tem:string>');
            expect(result).not.toContain('string[]');
        });

        it('should filter out metadata fields', () => {
            const input = {
                sISOCode: 'xs:string',
                sName: 'xs:string',
                targetNSAlias: 'tns',
                targetNamespace: 'http://example.com'
            };
            const result = getInitialXml(input);
            expect(result).toContain('<tem:sISOCode>?</tem:sISOCode>');
            expect(result).toContain('<tem:sName>?</tem:sName>');
            expect(result).not.toContain('targetNSAlias');
            expect(result).not.toContain('targetNamespace');
        });

        it('should handle real FullCountryInfo structure', () => {
            // Real structure from CountryInfoService WSDL
            const input = {
                sCountryISOCode: 'xs:string'
            };
            
            const outputSchema = {
                sISOCode: 'xs:string',
                sName: 'xs:string',
                sCapitalCity: 'xs:string',
                sPhoneCode: 'xs:string',
                sContinentCode: 'xs:string',
                sCurrencyISOCode: 'xs:string',
                sCountryFlag: 'xs:string',
                Languages: {
                    'tLanguage[]': {
                        sISOCode: 'xs:string',
                        sName: 'xs:string',
                        targetNSAlias: 'tns',
                        targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo'
                    },
                    targetNSAlias: 'tns',
                    targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo'
                },
                targetNSAlias: 'tns',
                targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo'
            };
            
            const inputResult = getInitialXml(input);
            expect(inputResult).toContain('<tem:sCountryISOCode>?</tem:sCountryISOCode>');
            
            const outputResult = getInitialXml(outputSchema);
            // Should contain simple fields
            expect(outputResult).toContain('<tem:sISOCode>?</tem:sISOCode>');
            expect(outputResult).toContain('<tem:sName>?</tem:sName>');
            
            // Should contain language array properly formatted
            expect(outputResult).toContain('<tem:tLanguage>');
            expect(outputResult).toContain('</tem:tLanguage>');
            expect(outputResult).not.toContain('tLanguage[]');
            
            // Should not contain metadata
            expect(outputResult).not.toContain('targetNSAlias');
            expect(outputResult).not.toContain('targetNamespace');
        });

        it('should handle empty input', () => {
            expect(getInitialXml(null)).toBe('');
            expect(getInitialXml(undefined)).toBe('');
            expect(getInitialXml({})).toBe('');
        });

        it('should skip $ prefixed properties', () => {
            const input = {
                name: 'xs:string',
                $xmlns: 'http://example.com',
                $targetNamespace: 'http://example.com'
            };
            const result = getInitialXml(input);
            expect(result).toContain('<tem:name>?</tem:name>');
            expect(result).not.toContain('$xmlns');
            expect(result).not.toContain('$targetNamespace');
        });
    });

    describe('generateXmlFromSchema', () => {
        it('should generate full SOAP envelope with simple types', () => {
            const input = {
                intA: 'xs:int',
                intB: 'xs:int'
            };
            const result = generateXmlFromSchema('Add', input, 'http://tempuri.org/');
            
            expect(result).toContain('<soapenv:Envelope');
            expect(result).toContain('xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"');
            expect(result).toContain('xmlns:web="http://tempuri.org/"');
            expect(result).toContain('<soapenv:Body>');
            expect(result).toContain('<web:Add>');
            expect(result).toContain('<intA>?</intA>');
            expect(result).toContain('<intB>?</intB>');
            expect(result).toContain('</web:Add>');
        });

        it('should handle nested complex types', () => {
            const input = {
                Person: {
                    Name: 'xs:string',
                    Age: 'xs:int'
                }
            };
            const result = generateXmlFromSchema('GetPerson', input, 'http://example.com');
            
            expect(result).toContain('<Person>');
            expect(result).toContain('<Name>?</Name>');
            expect(result).toContain('<Age>?</Age>');
            expect(result).toContain('</Person>');
        });

        it('should handle arrays with proper element names', () => {
            const input = {
                'Items[]': {
                    Name: 'xs:string',
                    Price: 'xs:decimal'
                }
            };
            const result = generateXmlFromSchema('GetItems', input, 'http://example.com');
            
            expect(result).toContain('<Items>');
            expect(result).not.toContain('Items[]');
            expect(result).toContain('<Name>?</Name>');
            expect(result).toContain('<Price>?</Price>');
        });

        it('should filter out metadata fields', () => {
            const input = {
                sCode: 'xs:string',
                targetNSAlias: 'tns',
                targetNamespace: 'http://example.com'
            };
            const result = generateXmlFromSchema('GetCode', input, 'http://example.com');
            
            expect(result).toContain('<sCode>?</sCode>');
            expect(result).not.toContain('targetNSAlias');
            expect(result).not.toContain('targetNamespace');
        });

        it('should handle real FullCountryInfo output structure', () => {
            const outputSchema = {
                sISOCode: 'xs:string',
                Languages: {
                    'tLanguage[]': {
                        sISOCode: 'xs:string',
                        sName: 'xs:string',
                        targetNSAlias: 'tns',
                        targetNamespace: 'http://www.oorsprong.org/websamples.countryinfo'
                    }
                }
            };
            
            const result = generateXmlFromSchema('FullCountryInfoResult', outputSchema, 'http://www.oorsprong.org/websamples.countryinfo');
            
            expect(result).toContain('<sISOCode>?</sISOCode>');
            expect(result).toContain('<Languages>');
            expect(result).toContain('<tLanguage>');
            expect(result).not.toContain('tLanguage[]');
            expect(result).not.toContain('targetNSAlias');
        });
    });
});

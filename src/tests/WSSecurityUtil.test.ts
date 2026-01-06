import { WSSecurityUtil } from '../../src/utils/WSSecurityUtil';
import { WSSecurityType, PasswordType, WSSecurityConfig } from '@shared/models';

describe('WSSecurityUtil', () => {
    describe('generateHeader', () => {
        it('should return empty string for None type', () => {
            const config: WSSecurityConfig = { type: WSSecurityType.None };
            const result = WSSecurityUtil.generateHeader(config);
            expect(result).toBe('');
        });

        it('should return empty string for undefined config', () => {
            const result = WSSecurityUtil.generateHeader(undefined as any);
            expect(result).toBe('');
        });

        it('should generate UsernameToken header with PasswordDigest', () => {
            const config: WSSecurityConfig = {
                type: WSSecurityType.UsernameToken,
                username: 'testuser',
                password: 'testpass',
                passwordType: PasswordType.PasswordDigest,
                hasNonce: true,
                hasCreated: true
            };
            const result = WSSecurityUtil.generateHeader(config);

            expect(result).toContain('wsse:Security');
            expect(result).toContain('wsse:UsernameToken');
            expect(result).toContain('<wsse:Username>testuser</wsse:Username>');
            expect(result).toContain('PasswordDigest');
            expect(result).toContain('wsse:Nonce');
            expect(result).toContain('wsu:Created');
        });

        it('should generate UsernameToken header with PasswordText', () => {
            const config: WSSecurityConfig = {
                type: WSSecurityType.UsernameToken,
                username: 'admin',
                password: 'secret123',
                passwordType: PasswordType.PasswordText,
                hasNonce: false,
                hasCreated: false
            };
            const result = WSSecurityUtil.generateHeader(config);

            expect(result).toContain('wsse:Security');
            expect(result).toContain('<wsse:Username>admin</wsse:Username>');
            expect(result).toContain('PasswordText');
            expect(result).toContain('secret123');
            expect(result).not.toContain('wsse:Nonce');
            expect(result).not.toContain('wsu:Created');
        });

        it('should escape XML special characters in credentials', () => {
            const config: WSSecurityConfig = {
                type: WSSecurityType.UsernameToken,
                username: 'user<>&"\'test',
                password: 'pass<>&"\' word',
                passwordType: PasswordType.PasswordText,
            };
            const result = WSSecurityUtil.generateHeader(config);

            expect(result).toContain('&lt;');
            expect(result).toContain('&gt;');
            expect(result).toContain('&amp;');
        });
    });

    describe('injectSecurityHeader', () => {
        it('should inject header into SOAP envelope without existing header', () => {
            const soapXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body>
        <test>content</test>
    </soap:Body>
</soap:Envelope>`;
            const securityHeader = '<wsse:Security>mock</wsse:Security>';
            const result = WSSecurityUtil.injectSecurityHeader(soapXml, securityHeader);

            expect(result).toContain('<soap:Header>');
            expect(result).toContain('</soap:Header>');
            expect(result).toContain('<wsse:Security>mock</wsse:Security>');
            // Header should come before Body
            expect(result.indexOf('<soap:Header>')).toBeLessThan(result.indexOf('<soap:Body>'));
        });

        it('should inject header into existing SOAP Header element', () => {
            const soapXml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Header>
        <existing>header</existing>
    </soap:Header>
    <soap:Body>
        <test>content</test>
    </soap:Body>
</soap:Envelope>`;
            const securityHeader = '<wsse:Security>mock</wsse:Security>';
            const result = WSSecurityUtil.injectSecurityHeader(soapXml, securityHeader);

            expect(result).toContain('<wsse:Security>mock</wsse:Security>');
            expect(result).toContain('<existing>header</existing>');
        });

        it('should handle different SOAP namespace prefixes', () => {
            const soapXml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
    <soapenv:Body><test/></soapenv:Body>
</soapenv:Envelope>`;
            const securityHeader = '<wsse:Security>mock</wsse:Security>';
            const result = WSSecurityUtil.injectSecurityHeader(soapXml, securityHeader);

            expect(result).toContain('<soapenv:Header>');
            expect(result).toContain('</soapenv:Header>');
        });

        it('should return original XML if security header is empty', () => {
            const soapXml = '<soap:Envelope><soap:Body/></soap:Envelope>';
            const result = WSSecurityUtil.injectSecurityHeader(soapXml, '');
            expect(result).toBe(soapXml);
        });
    });

    describe('applyToRequest', () => {
        it('should apply WS-Security to a SOAP request', () => {
            const soapXml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Body><test/></soap:Body>
</soap:Envelope>`;
            const config: WSSecurityConfig = {
                type: WSSecurityType.UsernameToken,
                username: 'user',
                password: 'pass',
                passwordType: PasswordType.PasswordDigest,
                hasNonce: true,
                hasCreated: true
            };
            const result = WSSecurityUtil.applyToRequest(soapXml, config);

            expect(result).toContain('wsse:Security');
            expect(result).toContain('wsse:UsernameToken');
            expect(result).toContain('<wsse:Username>user</wsse:Username>');
        });

        it('should return original XML for None security type', () => {
            const soapXml = '<soap:Envelope><soap:Body/></soap:Envelope>';
            const config: WSSecurityConfig = { type: WSSecurityType.None };
            const result = WSSecurityUtil.applyToRequest(soapXml, config);
            expect(result).toBe(soapXml);
        });

        it('should return original XML for undefined config', () => {
            const soapXml = '<soap:Envelope><soap:Body/></soap:Envelope>';
            const result = WSSecurityUtil.applyToRequest(soapXml, undefined);
            expect(result).toBe(soapXml);
        });
    });
});

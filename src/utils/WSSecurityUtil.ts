/**
 * WS-Security Utility
 * 
 * Generates WS-Security headers for SOAP requests, supporting:
 * - UsernameToken with PasswordText or PasswordDigest
 * - Certificate (X.509) signing via node-soap's WSSecurityCert
 * - Nonce and Timestamp for replay attack prevention
 */

import * as crypto from 'crypto';
import { WSSecurityCert } from 'soap';
import { WSSecurityConfig, WSSecurityType, PasswordType } from '@shared/models';

/**
 * Certificate contents for signing
 */
export interface CertificateContents {
    privateKey: string;
    publicCert: string;
    password?: string;
}

export class WSSecurityUtil {
    /**
     * Generate a WS-Security header XML string (for UsernameToken)
     */
    static generateHeader(config: WSSecurityConfig): string {
        if (!config || config.type === WSSecurityType.None) {
            return '';
        }

        if (config.type === WSSecurityType.UsernameToken) {
            return this.generateUsernameTokenHeader(config);
        }

        // Certificate is handled separately via applyCertificateToRequest
        return '';
    }

    /**
     * Generate UsernameToken header
     */
    private static generateUsernameTokenHeader(config: WSSecurityConfig): string {
        const username = config.username || '';
        const password = config.password || '';
        const passwordType = config.passwordType || PasswordType.PasswordDigest;
        const hasNonce = config.hasNonce ?? true;
        const hasCreated = config.hasCreated ?? true;

        // Generate nonce (random bytes, base64 encoded)
        const nonceBytes = crypto.randomBytes(16);
        const nonceBase64 = nonceBytes.toString('base64');

        // Generate created timestamp in UTC ISO format
        const created = new Date().toISOString();

        let passwordElement = '';
        let nonceElement = '';
        let createdElement = '';

        if (passwordType === PasswordType.PasswordDigest) {
            // PasswordDigest = Base64(SHA1(Nonce + Created + Password))
            const hash = crypto.createHash('sha1');
            hash.update(new Uint8Array(nonceBytes));
            hash.update(created);
            hash.update(password);
            const digest = hash.digest('base64');

            passwordElement = `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordDigest">${digest}</wsse:Password>`;
        } else {
            // PasswordText - send password as-is
            passwordElement = `<wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${this.escapeXml(password)}</wsse:Password>`;
        }

        if (hasNonce) {
            nonceElement = `<wsse:Nonce EncodingType="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-soap-message-security-1.0#Base64Binary">${nonceBase64}</wsse:Nonce>`;
        }

        if (hasCreated) {
            createdElement = `<wsu:Created>${created}</wsu:Created>`;
        }

        const header = `<wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd" soap:mustUnderstand="1">
    <wsse:UsernameToken wsu:Id="UsernameToken-${Date.now()}">
        <wsse:Username>${this.escapeXml(username)}</wsse:Username>
        ${passwordElement}
        ${nonceElement}
        ${createdElement}
    </wsse:UsernameToken>
</wsse:Security>`;

        return header;
    }

    /**
     * Inject WS-Security header into a SOAP envelope
     */
    static injectSecurityHeader(soapXml: string, securityHeader: string): string {
        if (!securityHeader || !soapXml) {
            return soapXml;
        }

        // Find the SOAP namespace prefix (could be 'soap', 'soapenv', 'SOAP-ENV', 's', etc.)
        const soapPrefixMatch = soapXml.match(/<(\w+):Envelope/i);
        const soapPrefix = soapPrefixMatch ? soapPrefixMatch[1] : 'soap';

        // Check if there's already a Header element
        const headerRegex = new RegExp(`<${soapPrefix}:Header[^>]*>`, 'i');
        const hasHeader = headerRegex.test(soapXml);

        if (hasHeader) {
            // Insert security header inside existing Header
            return soapXml.replace(headerRegex, (match) => {
                return `${match}\n    ${securityHeader}`;
            });
        } else {
            // Need to add Header element before Body
            const bodyRegex = new RegExp(`(<${soapPrefix}:Body)`, 'i');
            const newHeader = `<${soapPrefix}:Header>\n    ${securityHeader}\n</${soapPrefix}:Header>\n`;
            return soapXml.replace(bodyRegex, `${newHeader}$1`);
        }
    }

    /**
     * Apply WS-Security to a SOAP XML request (UsernameToken only)
     */
    static applyToRequest(soapXml: string, config: WSSecurityConfig | undefined): string {
        if (!config || config.type === WSSecurityType.None) {
            return soapXml;
        }

        if (config.type === WSSecurityType.UsernameToken) {
            const header = this.generateHeader(config);
            return this.injectSecurityHeader(soapXml, header);
        }

        // Certificate type requires file contents - use applyCertificateToRequest instead
        return soapXml;
    }

    /**
     * Apply Certificate-based WS-Security to a SOAP XML request
     * Uses node-soap's WSSecurityCert for proper X.509 signing
     */
    static applyCertificateToRequest(soapXml: string, certContents: CertificateContents): string {
        if (!certContents.privateKey || !certContents.publicCert) {
            throw new Error('Certificate authentication requires both private key and public certificate');
        }

        // Detect SOAP envelope prefix
        const soapPrefixMatch = soapXml.match(/<(\w+):Envelope/i);
        const envelopeKey = soapPrefixMatch ? soapPrefixMatch[1] : 'soap';

        // Ensure the XML has a Header element for WSSecurityCert to work with
        const headerRegex = new RegExp(`<${envelopeKey}:Header[^>]*>`, 'i');
        let xmlWithHeader = soapXml;
        if (!headerRegex.test(soapXml)) {
            const bodyRegex = new RegExp(`(<${envelopeKey}:Body)`, 'i');
            xmlWithHeader = soapXml.replace(bodyRegex, `<${envelopeKey}:Header></${envelopeKey}:Header>\n$1`);
        }

        try {
            // Create WSSecurityCert instance
            const wsSecurity = new WSSecurityCert(
                certContents.privateKey,
                certContents.publicCert,
                certContents.password || ''
            );

            // Apply the certificate security (signs and adds BinarySecurityToken)
            const signedXml = wsSecurity.postProcess(xmlWithHeader, envelopeKey);
            return signedXml;
        } catch (error: any) {
            throw new Error(`Failed to apply certificate security: ${error.message}`);
        }
    }

    /**
     * Escape special XML characters
     */
    private static escapeXml(str: string): string {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    }
}

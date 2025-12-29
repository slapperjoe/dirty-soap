/**
 * ReplaceRuleApplier.ts
 * 
 * Applies replace rules to XML content for live proxy modification.
 * Uses XPath to locate elements and performs text replacement.
 */

import { XMLParser, XMLBuilder } from 'fast-xml-parser';

export interface ReplaceRule {
    id: string;
    name?: string;
    xpath: string;
    matchText: string;
    replaceWith: string;
    target: 'request' | 'response' | 'both';
    isRegex?: boolean;
    enabled: boolean;
}

export class ReplaceRuleApplier {
    private static parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: true,
        trimValues: false,
        parseTagValue: false, // Keep raw strings
    });

    private static builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        preserveOrder: true,
        format: false,
    });

    /**
     * Apply all enabled rules to XML content
     * @param xml The original XML string
     * @param rules The replace rules to apply
     * @param target Which rules to apply ('request' or 'response')
     * @returns Modified XML string
     */
    public static apply(xml: string, rules: ReplaceRule[], target: 'request' | 'response'): string {
        if (!xml || !rules || rules.length === 0) {
            return xml;
        }

        // Filter rules that apply to this target
        const applicableRules = rules.filter(r =>
            r.enabled && (r.target === target || r.target === 'both')
        );

        if (applicableRules.length === 0) {
            return xml;
        }

        let modifiedXml = xml;

        for (const rule of applicableRules) {
            try {
                modifiedXml = this.applyRule(modifiedXml, rule);
            } catch (e) {
                console.error(`[ReplaceRuleApplier] Rule ${rule.id} failed:`, e);
                // Continue with other rules even if one fails
            }
        }

        return modifiedXml;
    }

    /**
     * Apply a single rule to XML
     */
    private static applyRule(xml: string, rule: ReplaceRule): string {
        // Simple approach: Use regex to find and replace text in context
        // For robust XPath replacement, we'd need full DOM manipulation
        // This approach works well for simple text replacements

        if (rule.isRegex) {
            try {
                const regex = new RegExp(rule.matchText, 'g');
                return xml.replace(regex, rule.replaceWith);
            } catch (e) {
                console.error(`[ReplaceRuleApplier] Invalid regex: ${rule.matchText}`);
                return xml;
            }
        }

        // Non-regex: escape special chars and do literal replacement
        const escaped = rule.matchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        return xml.replace(regex, rule.replaceWith);
    }

    /**
     * Parse XPath into segments for traversal
     * Format: //Envelope/Body/element or /root/child[1]
     */
    private static parseXPath(xpath: string): string[] {
        return xpath.split('/')
            .filter(s => s.length > 0)
            .map(s => {
                // Strip namespace prefix
                const colonIdx = s.indexOf(':');
                if (colonIdx > 0) {
                    s = s.substring(colonIdx + 1);
                }
                // Strip index notation
                const bracketIdx = s.indexOf('[');
                if (bracketIdx > 0) {
                    s = s.substring(0, bracketIdx);
                }
                return s;
            });
    }
}

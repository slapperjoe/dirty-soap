import { XMLParser } from 'fast-xml-parser';

export class BackendXPathEvaluator {
    private static parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        removeNSPrefix: true, // Simplified matching
    });

    public static evaluate(xml: string, xpath: string): string | null {
        if (!xml || !xpath) return null;

        try {
            const jsonObj = this.parser.parse(xml);

            // Handle explicit "Exists" check: count(xpath) > 0
            const countMatch = xpath.match(/^count\((.+)\)\s*>\s*0$/);
            if (countMatch) {
                const innerPath = countMatch[1].trim();
                const result = this.evaluate(xml, innerPath);
                return result !== null ? 'true' : 'false';
            }

            // Normalize XPath: Remove namespaces from segments for matching
            // //m:CountryNameResult -> [ "", "m:CountryNameResult" ]
            const segments = xpath.split('/');

            let current: any = jsonObj;

            for (let i = 0; i < segments.length; i++) {
                const segment = segments[i];

                // Case 1: Empty segment (caused by // or leading /)
                if (segment === '') {
                    // If it's the first one (leading /), just continue.
                    // If it's in middle (//), it implies recursive search for NEXT segment.
                    if (i > 0 && i + 1 < segments.length) {
                        // RECURSIVE SEARCH for segments[i+1]
                        const nextSegment = segments[i + 1];
                        const { key, index } = this.parseSegment(nextSegment);

                        const found = this.findRecursive(current, key);
                        if (found !== undefined) {
                            current = found; // The parent of the value? No, findRecursive returns the VALUE.
                            // But wait, if found is array, we might need index.
                            // findRecursive returns the Object/Value found under that key.

                            // Handle Index on the found item
                            if (Array.isArray(current)) {
                                if (index >= 0 && index < current.length) {
                                    current = current[index];
                                } else {
                                    return null;
                                }
                            } else {
                                if (index > 0) return null;
                            }

                            i++; // Skip the next segment loop as we processed it
                            continue;
                        } else {
                            return null; // Deep search failed
                        }
                    }
                    continue;
                }

                if (!current) return null;

                const { key, index } = this.parseSegment(segment);

                // Direct Child Search
                if (current[key] !== undefined) {
                    current = current[key];
                } else {
                    return null;
                }

                // Handle Array/Index
                if (Array.isArray(current)) {
                    if (index >= 0 && index < current.length) {
                        current = current[index];
                    } else {
                        return null;
                    }
                } else {
                    if (index > 0) return null;
                }
            }

            if (typeof current === 'object' && current !== null) {
                if ('#text' in current) return String(current['#text']);
                // If pure object and user asked for it, return JSON?
                // Usually Extractor expects string.
                // Return first value?
                return JSON.stringify(current);
            }

            return String(current);

        } catch (e) {
            console.error('BackendXPathEvaluator error:', e);
            return null;
        }
    }

    private static parseSegment(segment: string): { key: string, index: number } {
        const match = segment.match(/^([^\[]+)(?:\[(\d+)\])?$/);
        const rawName = match ? match[1] : segment;
        const index = match && match[2] ? parseInt(match[2], 10) - 1 : 0;

        // Strip namespace from key if present
        const key = rawName.includes(':') ? rawName.split(':')[1] : rawName;

        return { key, index };
    }

    private static findRecursive(obj: any, targetKey: string): any | undefined {
        if (typeof obj !== 'object' || obj === null) return undefined;

        // Check direct children
        if (obj[targetKey] !== undefined) {
            return obj[targetKey];
        }

        // Iterate children
        for (const k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                const child = obj[k];
                if (typeof child === 'object') {
                    const found = this.findRecursive(child, targetKey);
                    if (found !== undefined) return found;
                }
            }
        }
        return undefined;
    }
}

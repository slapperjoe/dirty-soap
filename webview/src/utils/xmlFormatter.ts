
export function formatXml(xml: string, alignAttributes: boolean = false): string {
    // Basic indentation (2 spaces)
    // If alignAttributes is true: Attributes on new lines vertically aligned.
    // If alignAttributes is false: Attributes on same line (Compact/Standard).

    let formatted = '';
    let pad = 0;

    // Split by tags, preserving content
    // Regex matches: <[^>]*> OR [^<]+
    // Normalize newlines in the input to avoid weird artifacts before processing
    // Also remove existing indentation if possible, but regex split handles tokens well.
    const tokens = xml.replace(/>\s*</g, '><').match(/(<[^>]+>)|([^<]+)/g) || [];

    tokens.forEach(token => {
        if (token.startsWith('<')) {
            // It's a tag
            if (token.startsWith('</')) {
                // Closing tag
                pad -= 2;
                formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
            } else if (token.startsWith('<?') || token.startsWith('<!')) {
                // Meta tags (process attributes if needed, but usually short)
                formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
            } else {
                // Opening or Self-closing tag
                const match = token.match(/^<([^\s>]+)([\s\S]*?)(\/?>)$/);
                if (match) {
                    const tagName = match[1];
                    let attrsString = match[2];
                    const closing = match[3]; // > or />

                    if (!attrsString.trim()) {
                        formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                    } else {
                        // Extract attributes
                        const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
                        const attrs: string[] = [];
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                            const key = attrMatch[1];
                            const val = attrMatch[2] !== undefined ? `"${attrMatch[2]}"` : `'${attrMatch[3]}'`;
                            attrs.push(`${key}=${val}`);
                        }

                        if (attrs.length === 0) {
                            formatted += ' '.repeat(Math.max(0, pad)) + `<${tagName}${attrsString}${closing}\n`;
                        } else {
                            // Construct
                            let line = ' '.repeat(Math.max(0, pad)) + `<${tagName}`;

                            if (alignAttributes) {
                                // Vertically Aligned
                                line += ` ${attrs[0]}`;
                                const indentSize = pad + 1 + tagName.length + 1;
                                for (let i = 1; i < attrs.length; i++) {
                                    line += '\n' + ' '.repeat(indentSize) + attrs[i];
                                }
                            } else {
                                // Compact (Standard)
                                attrs.forEach(attr => {
                                    line += ` ${attr}`;
                                });
                            }

                            line += closing + '\n';
                            formatted += line;
                        }
                    }

                    if (!token.endsWith('/>') && !token.startsWith('<?') && !token.startsWith('<!')) {
                        pad += 2;
                    }
                } else {
                    formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                }
            }
        } else {
            // Content
            if (token.trim()) {
                formatted += ' '.repeat(Math.max(0, pad)) + token.trim() + '\n';
            }
        }
    });

    return formatted;
}

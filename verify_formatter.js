
function formatXml(xml, alignAttributes = false) {
    let formatted = '';
    let pad = 0;

    // Split by tags, preserving content
    const tokens = xml.replace(/>\s*</g, '><').match(/(<[^>]+>)|([^<]+)/g) || [];

    tokens.forEach(token => {
        if (token.startsWith('<')) {
            if (token.startsWith('</')) {
                pad -= 2;
                formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
            } else if (token.startsWith('<?') || token.startsWith('<!')) {
                formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
            } else {
                const match = token.match(/^<([^\s>]+)([\s\S]*?)(\/?>)$/);
                if (match) {
                    const tagName = match[1];
                    let attrsString = match[2];
                    const closing = match[3];

                    if (!attrsString.trim()) {
                        formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                    } else {
                        const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
                        const attrs = [];
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                            const key = attrMatch[1];
                            const val = attrMatch[2] !== undefined ? `"${attrMatch[2]}"` : `'${attrMatch[3]}'`;
                            attrs.push(`${key}=${val}`);
                        }

                        if (attrs.length === 0) {
                            // Fallback if parsing failed but attrsString wasn't empty
                            // This handles cases where regex might not match
                            formatted += ' '.repeat(Math.max(0, pad)) + token + '\n'; // Use original token
                            // Wait, if regex failed, we shouldn't potentially duplicate or mess up.
                            // Original logic:
                            // formatted += ' '.repeat(Math.max(0, pad)) + `<${tagName}${attrsString}${closing}\n`;
                            // But my deployed file has this:
                            // formatted += ' '.repeat(Math.max(0, pad)) + `<${tagName}${attrsString}${closing}\n`;
                            // Actually let's check what I wrote in step 2747...
                            // I wrote: formatted += ' '.repeat(Math.max(0, pad)) + `<${tagName}${attrsString}${closing}\n`;
                            // Wait, attrsString contains the newlines!
                            // If `attrRegex` fails to find matches (maybe due to some character?), `attrs.length` is 0.
                            // Then it returns `<${tagName}${attrsString}${closing}\n`.
                            // attrsString IS THE ORIGINAL string with newlines.
                            // So if attribute parsing fails, it preserves newlines.
                        } else {
                            let line = ' '.repeat(Math.max(0, pad)) + `<${tagName}`;

                            if (alignAttributes) {
                                line += ` ${attrs[0]}`;
                                const indentSize = pad + 1 + tagName.length + 1;
                                for (let i = 1; i < attrs.length; i++) {
                                    line += '\n' + ' '.repeat(indentSize) + attrs[i];
                                }
                            } else {
                                attrs.forEach(attr => {
                                    line += ` ${attr}`;
                                });
                            }

                            line += closing + '\n';
                            formatted += line;
                        }
                    }

                    if (!token.endsWith('/>')) {
                        pad += 2;
                    }
                } else {
                    formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                }
            }
        } else {
            if (token.trim()) {
                formatted += ' '.repeat(Math.max(0, pad)) + token.trim() + '\n';
            }
        }
    });

    return formatted;
}

const inputAligned = `<tag attr1="val"
     attr2="val">`;
const inputSimple = `<tag attr1="val" attr2="val">`;

console.log("--- Test 1: Compacting Aligned XML ---");
console.log(formatXml(inputAligned, false));

console.log("\n--- Test 2: Formatting Simple XML ---");
console.log(formatXml(inputSimple, true));

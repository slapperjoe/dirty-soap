
export function stripCausalityData(xml: string): string {
    if (!xml) return '';
    let processedXml = xml;
    processedXml = processedXml.replace(/(?:\r\n|\r|\n)?<!--[\s\S]*?VsDebuggerCausalityData[\s\S]*?-->/gi, '');
    processedXml = processedXml.replace(/(?:\r\n|\r|\n)?<(\w+:)?VsDebuggerCausalityData[\s\S]*?<\/(\w+:)?VsDebuggerCausalityData>/gi, '');
    return processedXml;
}

export function formatXml(xml: string, alignAttributes: boolean = false, inlineElementValues: boolean = false, hideCausalityData: boolean = false): string {
    if (typeof xml !== 'string') return '';

    let formatted = '';
    let pad = 0;

    let processedXml = xml;
    if (hideCausalityData) {
        processedXml = stripCausalityData(processedXml);
    }

    // Remove existing formatting to clean up
    // We want to be careful not to merge content that shouldn't be merged, but generally stripping newlines between tags is safe?
    // Regex based simple tokenizer limits us.
    // Let's refine the tokens to capture whitespace if it's significant? No, for SOAP/XML usually pretty print ignores whitespace between tags.
    // But content whitespace matters.
    const tokens = processedXml.replace(/>\s*</g, '><').match(/(<[^>]+>)|([^<]+)/g) || [];

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.startsWith('<')) {
            // It's a tag
            if (token.startsWith('</')) {
                // Closing tag
                // If we did an inline content previously, we should be on the SAME line?
                // We need to track if the previous token was inline content.
                // Actually, if we decide to print inline, we consume future tokens?
                // Or we look behind?

                // Let's look behind. 
                // Unfortunately formatted string is hard to check.
                // Let's use a flag?
                // Or: Better approach: When handling Opening Tag, peek ahead.

                // Check if last char was \n. If not, we are inline, so don't indent or newline.
                if (formatted.endsWith('\n')) {
                    pad -= 2;
                    formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                } else {
                    // Inline closing
                    formatted += token + '\n';
                }

            } else if (token.startsWith('<?') || token.startsWith('<!')) {
                formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
            } else {
                // Opening Tag
                // Peek ahead for Inline Candidate:
                // Pattern: <Tag> + Content + </Tag>
                let isInline = false;
                if (inlineElementValues && i + 2 < tokens.length) {
                    const nextToken = tokens[i + 1];
                    const nextNextToken = tokens[i + 2];

                    // Check if next is text content (not a tag)
                    if (!nextToken.startsWith('<') && nextToken.trim().length > 0) {
                        // Check if nextNext is closing tag
                        if (nextNextToken.startsWith('</')) {
                            // Verify matching tag names?
                            // token: <Foo attr="..."> or <Foo>
                            // nextNextToken: </Foo>
                            const openName = token.match(/^<([^\s>]+)/)?.[1];
                            const closeName = nextNextToken.match(/^<\/([^>]+)>/)?.[1];
                            if (openName === closeName) {
                                isInline = true;
                            }
                        }
                    }
                    // Handle empty element <A></A> as inline?
                    if (tokens[i + 1].startsWith('</')) {
                        const openName = token.match(/^<([^\s>]+)/)?.[1];
                        const closeName = tokens[i + 1].match(/^<\/([^>]+)>/)?.[1];
                        if (openName === closeName) {
                            // Empty element, maybe <A></A>
                            // Should we inline? Yes.
                            // But my loop logic handles content.
                            // Let's handle <A></A> case:
                            // isInline = true works if we treat "no content" as special?  No my look ahead expects content.
                        }
                    }
                }

                // Parse Attributes
                const match = token.match(/^<([^\s>]+)([\s\S]*?)(\/?>)$/);
                if (match) {
                    const tagName = match[1];
                    let attrsString = match[2];
                    const closing = match[3];

                    let tagString = '';
                    if (!attrsString.trim()) {
                        tagString = token;
                    } else {
                        // Reconstruct attributes
                        const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
                        const attrs: string[] = [];
                        let attrMatch;
                        while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
                            const key = attrMatch[1];
                            const val = attrMatch[2] !== undefined ? `"${attrMatch[2]}"` : `'${attrMatch[3]}'`;
                            attrs.push(`${key}=${val}`);
                        }

                        if (attrs.length === 0) {
                            tagString = `<${tagName}${attrsString}${closing}`;
                        } else {
                            let line = `<${tagName}`;
                            if (alignAttributes && attrs.length > 1) {
                                line += ` ${attrs[0]}`;
                                const indentSize = pad + 1 + tagName.length + 1; // Relative to start of tag, but we print indent before
                                // Actually we want to align to the start of the first attribute?
                                // If we put indent before tag, then indentSize needs to account for that? 
                                // No, the newline should just have Spaces.
                                // My previous logic:
                                // pad spaces + <Tag + space + attr0
                                // newline + space(pad + <Tag length + 1?)
                                // No, previous logic used 'indentSize' relative to line start?
                                // "pad + 1 + tagName.length + 1"
                                // ' '.repeat(indentSize) is ABSOLUTE from start of line.
                                // It seems correct assuming 'pad' is the tag's indentation.

                                for (let k = 1; k < attrs.length; k++) {
                                    line += '\n' + ' '.repeat(indentSize) + attrs[k];
                                }
                            } else {
                                attrs.forEach(attr => line += ` ${attr}`);
                            }
                            line += closing;
                            tagString = line;
                        }
                    }

                    // Print Opening Tag
                    if (formatted.endsWith('\n') || formatted === '') {
                        formatted += ' '.repeat(Math.max(0, pad)) + tagString;
                    } else {
                        // This shouldn't happen for opening tags usually unless coming from inline?
                        // But opening tags start new blocks.
                        formatted += tagString;
                    }

                    if (!token.endsWith('/>') && !token.startsWith('<?') && !token.startsWith('<!')) {
                        if (isInline) {
                            // Do NOT newline.
                            // Do NOT increase pad.
                            // The content token will be consumed next iteration.
                            // But wait, if I don't newline, my loop will see content next.
                            // Content logic says: formatted += ' '.repeat(pad) + token + '\n';
                            // I need to change content logic.
                        } else {
                            formatted += '\n';
                            pad += 2;
                        }
                    } else {
                        formatted += '\n';
                    }
                } else {
                    formatted += ' '.repeat(Math.max(0, pad)) + token + '\n';
                }
            }
        } else {
            // Content
            if (token.trim()) {
                if (formatted.endsWith('\n')) {
                    formatted += ' '.repeat(Math.max(0, pad)) + token.trim() + '\n';
                } else {
                    // We are inline
                    formatted += token.trim();
                    // closing tag comes next.
                    // The closing tag logic checks 'formatted.endsWith(\n)'.
                    // If it doesn't, it appends token + '\n'.
                }
            }
        }
    }

    return formatted;
}

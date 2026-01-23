export class XPathGenerator {

    /**
     * Generates an XPath for the element/text at the given text offset.
     * @param xml The full XML string
     * @param offset The character index in the string
     */
    public static getPath(xml: string, offset: number): string | null {
        // Regex for XML tags: <TAG ... >, </TAG>, <TAG ... />, <!-- -->
        // We need to tokenize manually to allow "contains offset" check

        const stack: { tagName: string, index: number }[] = [];
        const siblingCounts: { [key: string]: { [tag: string]: number } } = {}; // 'path' -> 'tag' -> count

        // Root scope
        siblingCounts[''] = {};

        // Helper to generate current path string
        const getCurrentPath = () => {
            return '/' + stack.map(item => {
                // We default to [1] if multiple exists, but standard is usually explicit [1] or omitted if unique?
                // Simplest is always append [index]
                return `${item.tagName}[${item.index}]`;
            }).join('/');
        };

        const regex = /<(\/?)([\w:.-]+)([^>]*)>/g;
        let match;

        // We need to reconstruct the stream. 
        // regex.exec updates lastIndex.
        // We check if offset is BEFORE the match (Text Node).

        let lastMatchEnd = 0;

        while ((match = regex.exec(xml)) !== null) {
            const tagStart = match.index;
            const tagEnd = regex.lastIndex;
            const isClosing = match[1] === '/';
            const tagName = match[2];
            const attributes = match[3];
            const isSelfClosing = attributes.trim().endsWith('/');

            // Check if offset is in the text node BEFORE this tag
            if (offset >= lastMatchEnd && offset < tagStart) {
                // We are in text content of the *current* top of stack
                // But wait, if stack is empty, we are outside root?
                if (stack.length > 0) {
                    return getCurrentPath(); // Text content of parent
                }
            }

            // Check if offset is INSIDE this tag definition (attributes etc)
            if (offset >= tagStart && offset < tagEnd) {
                // We are inside the tag, maybe selecting attribute?
                // For now return the element path
                if (isClosing) {
                    // We are in closing tag of TOP.
                    // Return path of TOP (which is about to be popped)
                    return getCurrentPath();
                }
                // If opening/self-closing, we are defining a NEW child.
                // We need to calculate its index first.

                const parentPath = stack.length > 0 ? getCurrentPath() : '';
                if (!siblingCounts[parentPath]) siblingCounts[parentPath] = {};

                const currentCount = (siblingCounts[parentPath][tagName] || 0) + 1;
                // Don't update Global count yet if we assume we are selecting THIS node?
                // Yes we are.

                // If self closing, it is a node.
                // If Open, it is a node.
                return parentPath + `/${tagName}[${currentCount}]`;
            }

            // Handle Structure
            if (isClosing) {
                if (stack.length > 0 && stack[stack.length - 1].tagName === tagName) {
                    stack.pop();
                }
            } else if (isSelfClosing) {
                const parentPath = stack.length > 0 ? getCurrentPath() : '';
                if (!siblingCounts[parentPath]) siblingCounts[parentPath] = {};
                const count = (siblingCounts[parentPath][tagName] || 0) + 1;
                siblingCounts[parentPath][tagName] = count;
                // It opens and closes immediately. Stack doesn't change.
            } else {
                // Opening Tag
                const parentPath = stack.length > 0 ? getCurrentPath() : '';
                if (!siblingCounts[parentPath]) siblingCounts[parentPath] = {};
                const count = (siblingCounts[parentPath][tagName] || 0) + 1;
                siblingCounts[parentPath][tagName] = count;

                stack.push({ tagName, index: count });
            }

            lastMatchEnd = tagEnd;

            // Optimization: If we passed offset, and stack is empty, we are done?
            // No, offset could be far ahead.
            if (lastMatchEnd > offset) {
                // We found the structure around the offset.
                // If we returned already, good. 
                // If not, we might have missed it? 
                // The logic above handles "Before Tag" and "In Tag".
                // What if it is "After Tag"?
            }
        }

        // Trailing text
        if (offset >= lastMatchEnd && stack.length > 0) {
            return getCurrentPath();
        }

        return null;
    }
}

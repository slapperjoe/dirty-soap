import * as monaco from 'monaco-editor';

/**
 * Finds all line ranges for XML elements matching the given element names.
 * Returns an array of {startLine, endLine} objects for folding.
 */
export function findElementRanges(content: string, elementNames: string[]): Array<{ startLine: number; endLine: number }> {
    if (!content || !elementNames || elementNames.length === 0) {
        return [];
    }

    const lines = content.split('\n');
    const ranges: Array<{ startLine: number; endLine: number }> = [];
    const stack: Array<{ name: string; line: number }> = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNum = i + 1; // Monaco uses 1-based line numbers

        // Match opening tags: <tagName> or <prefix:tagName>
        const openMatch = line.match(/<(\w+:)?(\w+)(?:\s|>)/);
        if (openMatch && !line.includes('</')) {
            const tagName = openMatch[2]; // Get the tag name without prefix

            // Check if this tag should be auto-folded
            if (elementNames.some(name => tagName.toLowerCase() === name.toLowerCase())) {
                // Check if it's a self-closing tag
                if (!line.trim().endsWith('/>')) {
                    stack.push({ name: tagName, line: lineNum });
                }
            }
        }

        // Match closing tags: </tagName> or </prefix:tagName>
        const closeMatch = line.match(/<\/(\w+:)?(\w+)>/);
        if (closeMatch) {
            const tagName = closeMatch[2];

            // Find matching opening tag in stack
            for (let j = stack.length - 1; j >= 0; j--) {
                if (stack[j].name.toLowerCase() === tagName.toLowerCase()) {
                    const openLine = stack[j].line;
                    const closeLine = lineNum;

                    // Only add if there's content to fold (more than 1 line)
                    if (closeLine > openLine) {
                        ranges.push({ startLine: openLine, endLine: closeLine });
                    }

                    stack.splice(j, 1);
                    break;
                }
            }
        }
    }

    return ranges;
}

/**
 * Applies auto-folding to the Monaco editor for specified XML elements.
 * @param editor The Monaco editor instance
 * @param content The XML content
 * @param elementNames Array of element names to auto-fold (e.g., ["Security", "Header"])
 * @param onComplete Optional callback when folding is complete (for hiding/showing editor)
 */
export function applyAutoFolding(
    editor: monaco.editor.IStandaloneCodeEditor,
    content: string,
    elementNames: string[],
    onComplete?: () => void
): void {
    if (!editor || !content || !elementNames || elementNames.length === 0) {
        onComplete?.();
        return;
    }

    // Wait for the editor to finish rendering and folding to be available
    setTimeout(() => {
        const ranges = findElementRanges(content, elementNames);

        if (ranges.length === 0) {
            onComplete?.();
            return;
        }

        try {
            const model = editor.getModel();
            if (!model) {
                onComplete?.();
                return;
            }

            // Access the folding controller via contribution
            const foldingController = editor.getContribution('editor.contrib.folding') as any;

            if (foldingController && typeof foldingController.getFoldingModel === 'function') {
                foldingController.getFoldingModel().then((foldingModel: any) => {
                    if (!foldingModel) {
                        onComplete?.();
                        return;
                    }

                    // Collect all regions to collapse
                    const regionsToCollapse: any[] = [];

                    ranges.forEach((r) => {
                        try {
                            const region = foldingModel.getRegionAtLine(r.startLine);
                            if (region && !region.isCollapsed) {
                                regionsToCollapse.push(region);
                            }
                        } catch (e) {
                            console.error(`[xmlFoldingUtils] Error finding region at line ${r.startLine}:`, e);
                        }
                    });

                    if (regionsToCollapse.length > 0) {
                        // Use toggleCollapseState to collapse regions
                        try {
                            foldingModel.toggleCollapseState(regionsToCollapse);
                        } catch (e) {
                            // Fallback: try setCollapseStateAtRegion
                            try {
                                regionsToCollapse.forEach(region => {
                                    foldingModel.setCollapseStateAtRegion?.(region, true);
                                });
                            } catch (e2) {
                                console.error('[xmlFoldingUtils] Folding fallback failed:', e2);
                            }
                        }
                    }

                    onComplete?.();
                }).catch((err: any) => {
                    console.error('[xmlFoldingUtils] Error getting folding model:', err);
                    onComplete?.();
                });
            } else {
                // Fallback: try the action API
                const foldAction = editor.getAction('editor.foldAll');
                if (foldAction) {
                    foldAction.run();
                }
                onComplete?.();
            }
        } catch (error) {
            console.error('[xmlFoldingUtils] Error during folding:', error);
            onComplete?.();
        }
    }, 300); // Timeout to ensure folding provider is ready
}

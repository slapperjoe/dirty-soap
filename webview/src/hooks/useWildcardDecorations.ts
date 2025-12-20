import { useRef, useEffect } from 'react';
import { Monaco } from '@monaco-editor/react';

export const useWildcardDecorations = (editor: any, monaco: Monaco | null, value: string) => {
    const decorationsRef = useRef<string[]>([]);

    const updateDecorations = () => {
        // console.log('updateDecorations called', { editor: !!editor, monaco: !!monaco, valueLength: value ? value.length : 0 });
        if (!editor || !monaco) return;

        try {
            const model = editor.getModel();
            if (!model || model.isDisposed()) return;

            const text = model.getValue();
            console.log('useWildcardDecorations: text length', text.length);

            const regex = /\{\{[^}]+\}\}/g; // Matches {{...}}
            const matches: any[] = [];
            let match;

            while ((match = regex.exec(text)) !== null) {
                if (!match || typeof match[0] !== 'string') {
                    console.error('useWildcardDecorations: Invalid match', match);
                    continue;
                }

                // console.log('useWildcardDecorations: match found', match[0]);

                const startPos = model.getPositionAt(match.index);
                const endPos = model.getPositionAt(match.index + match[0].length);

                matches.push({
                    range: new monaco.Range(
                        startPos.lineNumber,
                        startPos.column,
                        endPos.lineNumber,
                        endPos.column
                    ),
                    options: {
                        isWholeLine: false,
                        className: 'wildcard-tag-decoration',
                        inlineClassName: 'wildcard-tag-text',
                        hoverMessage: { value: 'Wildcard Tag' }
                    }
                });
            }

            // Verify editor is still alive before applying
            if (editor.getModel() === model) {
                decorationsRef.current = editor.deltaDecorations(
                    decorationsRef.current,
                    matches
                );
            }
        } catch (e) {
            console.warn('Wildcard decoration update failed', e);
        }
    };

    useEffect(() => {
        // Debounce slightly or just run
        updateDecorations();
    }, [value, editor, monaco]);

    return { updateDecorations };
};

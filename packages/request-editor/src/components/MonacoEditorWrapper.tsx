import React, { useRef, useEffect, useState } from "react";
import * as monaco from "monaco-editor";
import "../monaco-env"; // R1: registers MonacoEnvironment.getWorker (web workers) before any editor is created

// Unique instance counter for per-editor model URIs
let _monacoWrapperId = 0;

// Monaco type alias for consumers
export type Monaco = typeof monaco;

export interface MonacoEditorWrapperProps {
  /** Height of the editor container. Default: "100%" */
  height?: string;
  /** Width of the editor container. Default: "100%" */
  width?: string;
  /** Default language for the editor */
  defaultLanguage?: string;
  /** Initial value */
  defaultValue?: string;
  /** Controlled value */
  value?: string;
  /** Current language (can change dynamically) */
  language?: string;
  /** Editor theme */
  theme?: string;
  /** Loading text shown before editor is ready */
  loading?: React.ReactNode;
  /** Called when editor is first mounted */
  onMount?: (editor: any, monacoInstance: Monaco) => void;
  /** Called when value changes */
  onChange?: (value: string | undefined) => void;
  /** Editor options */
  options?: any;
  /** CSS class for the wrapper element */
  className?: string;
  /** Additional wrapper props */
  wrapperProps?: React.HTMLAttributes<HTMLDivElement>;
}

interface MonacoEditorWrapperHandle {
  getEditor(): any;
  getModel(): any;
}

/**
 * Thin React wrapper around `monaco-editor` that eliminates the
 * `@monaco-editor/loader` (no CDN, no network calls).
 *
 * Uses `monaco.editor.create()` directly.
 */
export const MonacoEditorWrapper = React.forwardRef<
  MonacoEditorWrapperHandle,
  MonacoEditorWrapperProps
>(
  function MonacoEditorWrapper(
    {
      height = "100%",
      width = "100%",
      defaultLanguage = "text",
      defaultValue = "",
      value,
      language,
      theme = "vs-dark",
      loading = "Loading...",
      onMount,
      onChange,
      options = {},
      className,
      wrapperProps,
    },
    ref
  ) {
    const editorHostRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<any>(null);
    const modelRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);

    // Create model helper - each editor gets a unique URI via instance ID
    const createModel = (
      text: string,
      lang: string,
      instanceId: number
    ): any => {
      const uriPath = `editor://monaco-wrapper-${instanceId}`;
      return monaco.editor.createModel(text, lang, monaco.Uri.parse(uriPath));
    };

    // Initialize editor on mount
    useEffect(() => {
      if (!editorHostRef.current) return;

      if (editorRef.current?.isDisposed?.()) {
        editorRef.current = null;
      }

      if (modelRef.current?.isDisposed?.()) {
        modelRef.current = null;
      }

      if (editorRef.current) return;

      const instanceId = _monacoWrapperId;
      _monacoWrapperId += 1;
      const initialLang = language || defaultLanguage;
      const initialText = value !== undefined ? value : defaultValue;
      const model = createModel(initialText, initialLang, instanceId);
      modelRef.current = model;

      const editor = monaco.editor.create(editorHostRef.current, {
        model,
        automaticLayout: true,
        ...options,
      });
      editorRef.current = editor;

      // Apply theme
      monaco.editor.setTheme(theme);
      setIsReady(true);

      // Call onMount callback
      if (onMount) {
        onMount(editor, monaco);
      }
    }, []);

    // Sync value changes from parent
    useEffect(() => {
      if (!editorRef.current || value === undefined) return;
      const editor = editorRef.current;
      const model = editor.getModel();
      if (!model || model.isDisposed()) return;

      const readOnly = editor.getOption(monaco.editor.EditorOption.readOnly);
      if (readOnly) {
        editor.setValue(value);
      } else {
        const current = editor.getValue();
        if (value !== current) {
          editor.executeEdits("wrapper", [
            {
              range: model.getFullModelRange(),
              text: value,
              forceMoveMarkers: true,
            },
          ]);
          editor.pushUndoStop();
        }
      }
    }, [value]);

    // Sync language changes
    useEffect(() => {
      if (!editorRef.current || !language) return;
      const model = editorRef.current.getModel();
      if (model && !model.isDisposed()) {
        monaco.editor.setModelLanguage(model, language);
      }
    }, [language]);

    // Sync theme changes
    useEffect(() => {
      if (theme) {
        monaco.editor.setTheme(theme);
      }
    }, [theme]);

    // Sync options changes
    useEffect(() => {
      if (!editorRef.current || !options) return;
      editorRef.current.updateOptions(options);
    }, [options]);

    // R2 (MONACO_LAG_ROOT_CAUSE.md): keep the latest onChange in a ref and
    // subscribe onDidChangeModelContent once on mount. Callers may pass
    // unstable inline callbacks (e.g. `onChange={(v) => setXml(v)}`) without
    // the wrapper tearing down and re-subscribing the listener on every
    // render — that churn was 200 dispose/re-subscribe cycles per 40-key burst.
    const onChangeRef = useRef<MonacoEditorWrapperProps["onChange"]>(onChange);
    onChangeRef.current = onChange;

    // Handle editor content changes (subscribed once; the handler always
    // reads the latest callback through onChangeRef)
    useEffect(() => {
      if (!editorRef.current) return;
      const editor = editorRef.current;

      const listener = editor.onDidChangeModelContent(() => {
        const handler = onChangeRef.current;
        if (handler) {
          handler(editor.getValue());
        }
      });

      return () => {
        listener.dispose();
      };
    }, []);

    // Expose imperative handle
    useEffect(() => {
      if (ref) {
        if (typeof ref === "object" && "current" in ref) {
          (ref as React.MutableRefObject<MonacoEditorWrapperHandle>).current = {
            getEditor: () => editorRef.current,
            getModel: () => modelRef.current,
          };
        }
      }
    }, [isReady]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        const editor = editorRef.current;
        if (editor) {
          const model = editor.getModel();
          if (model && !model.isDisposed?.()) model.dispose();
          editor.dispose();
        } else if (modelRef.current && !modelRef.current.isDisposed?.()) {
          modelRef.current.dispose();
        }

        if (editorHostRef.current) {
          editorHostRef.current.replaceChildren();
        }

        editorRef.current = null;
        modelRef.current = null;
      };
    }, []);

    const wrapperStyle: React.CSSProperties = {
      display: "flex",
      position: "relative",
      textAlign: "initial",
      width,
      height,
      overflow: "hidden",
    };

    const loadingStyle: React.CSSProperties = {
      display: "flex",
      position: "absolute",
      inset: 0,
      height: "100%",
      width: "100%",
      justifyContent: "center",
      alignItems: "center",
      pointerEvents: "none",
      zIndex: 1,
    };

    const editorContainerStyle: React.CSSProperties = {
      height: "100%",
      width: "100%",
    };

    return (
      <div
        className={className}
        style={wrapperStyle}
        {...wrapperProps}
      >
        {!isReady && (
          <div style={loadingStyle}>{loading}</div>
        )}
        <div ref={editorHostRef} style={editorContainerStyle} />
      </div>
    );
  }
);

export default MonacoEditorWrapper;

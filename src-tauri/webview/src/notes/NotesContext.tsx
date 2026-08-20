import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { NoteEntry, NoteLanguage } from "@shared/models";
import { captureLog } from "../utils/logger";
import { detectLanguage, DetectedLanguage } from "./detectLanguage";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NoteViewMode = "interactive" | "raw" | "preview";

export interface ActiveNote {
  entry: NoteEntry;
  /** Text content for non-binary notes */
  content: string;
  /** Raw bytes for binary notes */
  bytes?: Uint8Array;
  /** Content as it was last saved — used for dirty check */
  savedContent: string;
  savedBytes?: Uint8Array;
  detected: DetectedLanguage;
  viewMode: NoteViewMode;
  /** timestamp of file on disk at last load — for external-change detection */
  loadedAt: number;
}

interface NotesState {
  notes: NoteEntry[];
  activeNote: ActiveNote | null;
  isLoading: boolean;
  error: string | null;
}

interface NotesActions {
  loadIndex: () => Promise<void>;
  openNote: (entry: NoteEntry) => Promise<void>;
  newNote: (name?: string) => Promise<void>;
  openFileDialog: () => Promise<void>;
  saveActive: () => Promise<void>;
  saveAsDialog: () => Promise<void>;
  closeActive: () => void;
  deleteNote: (id: string) => Promise<void>;
  renameNote: (id: string, newName: string) => Promise<void>;
  updateContent: (content: string) => void;
  updateByte: (offset: number, value: number) => void;
  setViewMode: (mode: NoteViewMode) => void;
  setLanguageOverride: (lang: NoteLanguage) => void;
  checkExternalChange: () => Promise<void>;
}

type NotesContextValue = NotesState & NotesActions;

// ─── Context ──────────────────────────────────────────────────────────────────

const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotes(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used inside NotesProvider");
  return ctx;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesEqual(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function isNoteDirty(note: ActiveNote): boolean {
  if (note.detected.isBinary) return !bytesEqual(note.bytes, note.savedBytes);
  return note.content !== note.savedContent;
}

/** "external" = user-owned file (needs explicit save), "managed" = auto-saved scratch note */
export function noteDirtyKind(note: ActiveNote): "external" | "managed" | null {
  if (!isNoteDirty(note)) return null;
  return note.entry.isManaged ? "managed" : "external";
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const NotesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [activeNote, setActiveNote] = useState<ActiveNote | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-save timer ref
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Index ────────────────────────────────────────────────────────────────

  const loadIndex = useCallback(async () => {
    try {
      const index = await invoke<{ entries: NoteEntry[] }>("load_notes_index");
      setNotes(index.entries ?? []);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => { loadIndex(); }, [loadIndex]);

  // ── Open ─────────────────────────────────────────────────────────────────

  const openNote = useCallback(async (entry: NoteEntry) => {
    setIsLoading(true);
    setError(null);
    try {
      // Sniff binary first
      const sniff = await invoke<{ isBinary: boolean }>("sniff_file_type", { filePath: entry.filePath });
      const isBin = sniff.isBinary;

      if (isBin) {
        const b64 = await invoke<string>("load_note_bytes", { filePath: entry.filePath });
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        setActiveNote({
          entry,
          content: "",
          bytes,
          savedContent: "",
          savedBytes: new Uint8Array(bytes),
          detected: { language: "binary", isMarkdown: false, isBinary: true },
          viewMode: "raw",
          loadedAt: Date.now(),
        });
      } else {
        const content = await invoke<string>("load_note_content", { filePath: entry.filePath });
        const langOverride = entry.language ?? null;
        const detected = detectLanguage(entry.filePath, content, false);
        const finalDetected: DetectedLanguage = langOverride && langOverride !== "plaintext"
          ? { language: langOverride as NoteLanguage, isMarkdown: langOverride === "markdown", isBinary: false }
          : detected;

        setActiveNote({
          entry,
          content,
          savedContent: content,
          detected: finalDetected,
          viewMode: finalDetected.isMarkdown ? "interactive" : "raw",
          loadedAt: Date.now(),
        });
      }

      await invoke("add_recent_note_path", { filePath: entry.filePath });
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // ── New ──────────────────────────────────────────────────────────────────

  const newNote = useCallback(async (name?: string) => {
    const notesDir = await invoke<string>("get_notes_dir_path");
    const safeName = (name ?? "Untitled").replace(/[^a-zA-Z0-9_\- ]/g, "_");
    const fileName = `${safeName}.txt`;
    const filePath = `${notesDir}/${fileName}`;

    const entry: NoteEntry = {
      id: crypto.randomUUID(),
      name: safeName,
      filePath,
      language: "plaintext",
      lastModified: new Date().toISOString(),
      isBinary: false,
      isManaged: true,
      createdAt: new Date().toISOString(),
    };

    await invoke("save_note", { filePath, content: "" });
    await invoke("upsert_note_index", { entry });

    setNotes((prev) => [entry, ...prev.filter((n) => n.id !== entry.id)]);
    setActiveNote({
      entry,
      content: "",
      savedContent: "",
      detected: { language: "plaintext", isMarkdown: false, isBinary: false },
      viewMode: "raw",
      loadedAt: Date.now(),
    });
  }, []);

  // ── Open File Dialog ─────────────────────────────────────────────────────

  const openFileDialog = useCallback(async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      // No filters = native dialog shows all files (wildcards are unreliable on macOS)
      const selected = await open({
        title: "Open File",
        multiple: false,
      });
      if (!selected || typeof selected !== "string") return;

      const name = selected.split(/[/\\]/).pop() ?? selected;
      const entry: NoteEntry = {
        id: crypto.randomUUID(),
        name,
        filePath: selected,
        language: "plaintext",
        lastModified: new Date().toISOString(),
        isBinary: false,
        isManaged: false,
        createdAt: new Date().toISOString(),
      };
      await invoke("upsert_note_index", { entry });
      setNotes((prev) => [entry, ...prev.filter((n) => n.filePath !== selected)]);
      await openNote(entry);
    } catch (e) {
      setError(String(e));
    }
  }, [openNote]);

  // ── Save ─────────────────────────────────────────────────────────────────

  const saveActive = useCallback(async () => {
    if (!activeNote) return;
    try {
      if (activeNote.detected.isBinary && activeNote.bytes) {
        const b64 = btoa(String.fromCharCode(...activeNote.bytes));
        await invoke("save_note_bytes", { filePath: activeNote.entry.filePath, dataB64: b64 });
        setActiveNote((prev) => prev ? { ...prev, savedBytes: new Uint8Array(prev.bytes!) } : prev);
      } else {
        await invoke("save_note", { filePath: activeNote.entry.filePath, content: activeNote.content });
        setActiveNote((prev) => prev ? { ...prev, savedContent: prev.content } : prev);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [activeNote]);

  // ── Save As ──────────────────────────────────────────────────────────────

  const saveAsDialog = useCallback(async () => {
    if (!activeNote) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const dest = await save({
        title: "Save As",
        defaultPath: activeNote.entry.name,
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (!dest) return;

      const name = dest.split(/[/\\]/).pop() ?? dest;
      const updatedEntry: NoteEntry = {
        ...activeNote.entry,
        name,
        filePath: dest,
        lastModified: new Date().toISOString(),
      };

      if (activeNote.detected.isBinary && activeNote.bytes) {
        const b64 = btoa(String.fromCharCode(...activeNote.bytes));
        await invoke("save_note_bytes", { filePath: dest, dataB64: b64 });
      } else {
        await invoke("save_note", { filePath: dest, content: activeNote.content });
      }

      await invoke("upsert_note_index", { entry: updatedEntry });
      setNotes((prev) => prev.map((n) => n.id === updatedEntry.id ? updatedEntry : n));
      setActiveNote((prev) =>
        prev ? { ...prev, entry: updatedEntry, savedContent: prev.content, savedBytes: prev.detected.isBinary && prev.bytes ? new Uint8Array(prev.bytes) : prev.savedBytes } : prev
      );
    } catch (e) {
      setError(String(e));
    }
  }, [activeNote]);

  // ── Close ────────────────────────────────────────────────────────────────

  const closeActive = useCallback(() => {
    setActiveNote(null);
  }, []);

  // ── Delete ───────────────────────────────────────────────────────────────

  const deleteNote = useCallback(async (id: string) => {
    const entry = notes.find((n) => n.id === id);
    if (!entry) return;
    try {
      await invoke("delete_note", { id });
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeNote?.entry.id === id) setActiveNote(null);
    } catch (e) {
      setError(String(e));
    }
  }, [notes, activeNote]);

  // ── Rename ───────────────────────────────────────────────────────────────

  const renameNote = useCallback(async (id: string, newName: string) => {
    const entry = notes.find((n) => n.id === id);
    if (!entry) return;
    try {
      const dir = entry.filePath.substring(0, Math.max(entry.filePath.lastIndexOf("/"), entry.filePath.lastIndexOf("\\")));
      const ext = entry.filePath.substring(entry.filePath.lastIndexOf("."));
      const newPath = `${dir}/${newName}${ext}`;
      await invoke("rename_note", { oldPath: entry.filePath, newPath });
      setNotes((prev) => prev.map((n) => n.id === id ? { ...n, name: newName, filePath: newPath } : n));
      if (activeNote?.entry.id === id) {
        setActiveNote((prev) => prev ? { ...prev, entry: { ...prev.entry, name: newName, filePath: newPath } } : prev);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [notes, activeNote]);

  // ── Content updates ──────────────────────────────────────────────────────

  const updateContent = useCallback((content: string) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      // If content reverts to what's on disk, cancel any pending auto-save — no write needed
      if (content === prev.savedContent && autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = null;
      }
      return { ...prev, content };
    });

    // Auto-save: text notes only, 2s debounce
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      setActiveNote((prev) => {
        if (!prev || prev.detected.isBinary) return prev;
        // Skip write if nothing changed since last disk save
        if (prev.content === prev.savedContent) return prev;
        invoke("save_note", { filePath: prev.entry.filePath, content: prev.content })
          .then(() => setActiveNote((p) => p ? { ...p, savedContent: p.content } : p))
          .catch((err) => {
              captureLog('error', '[Notes] Auto-save failed', err);
          });
        return prev;
      });
    }, 2000);
  }, []);

  const updateByte = useCallback((offset: number, value: number) => {
    setActiveNote((prev) => {
      if (!prev?.bytes) return prev;
      const next = new Uint8Array(prev.bytes);
      next[offset] = value;
      return { ...prev, bytes: next };
    });
  }, []);

  // ── View mode / language override ────────────────────────────────────────

  const setViewMode = useCallback((mode: NoteViewMode) => {
    setActiveNote((prev) => prev ? { ...prev, viewMode: mode } : prev);
  }, []);

  const setLanguageOverride = useCallback(async (lang: NoteLanguage) => {
    setActiveNote((prev) => {
      if (!prev) return prev;
      const detected: DetectedLanguage = {
        language: lang,
        isMarkdown: lang === "markdown",
        isBinary: lang === "binary",
      };
      return { ...prev, detected };
    });
    // Persist the override in the index
    if (activeNote) {
      const updated = { ...activeNote.entry, language: lang };
      await invoke("upsert_note_index", { entry: updated });
      setNotes((prev) => prev.map((n) => n.id === updated.id ? updated : n));
    }
  }, [activeNote]);

  // ── External change detection ────────────────────────────────────────────

  const checkExternalChange = useCallback(async () => {
    if (!activeNote) return;
    try {
      const result = await invoke<{ lastModified: string }>("sniff_file_type", {
        filePath: activeNote.entry.filePath,
      });
      // Compare timestamps: convert ISO lastModified to epoch ms
      const diskMtime = new Date(result.lastModified).getTime();
      if (diskMtime > activeNote.loadedAt) {
        // Prompt handled by UI — just surface via error channel with sentinel
        setError(`__external_change__:${activeNote.entry.filePath}`);
      }
    } catch {
      // file may not exist yet (new unsaved note) — ignore
    }
  }, [activeNote]);

  // Check for external changes when window regains focus
  useEffect(() => {
    const handler = () => { checkExternalChange(); };
    window.addEventListener("focus", handler);
    return () => window.removeEventListener("focus", handler);
  }, [checkExternalChange]);

  const value: NotesContextValue = {
    notes, activeNote, isLoading, error,
    loadIndex, openNote, newNote, openFileDialog,
    saveActive, saveAsDialog, closeActive,
    deleteNote, renameNote,
    updateContent, updateByte,
    setViewMode, setLanguageOverride,
    checkExternalChange,
  };

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
};

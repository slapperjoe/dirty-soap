import "@testing-library/jest-dom";

// ─────────────────────────────────────────────────────────────────────────────
// jsdom environment polyfills (vitest v4 jsdom does not provide these)
//
// 1. localStorage — several contexts read/write it unconditionally
//    (e.g. NavigationContext.shouldShowWelcomeOnStartup). jsdom without
//    --localstorage-file leaves `localStorage` undefined, so provide a
//    minimal in-memory Storage when (and only when) it is missing.
// 2. document.queryCommandSupported — monaco-editor's clipboard contribution
//    calls it at module load; jsdom does not implement it.
// ─────────────────────────────────────────────────────────────────────────────

function createMemoryStorage(): Storage {
    const store = new Map<string, string>();
    return {
        get length() {
            return store.size;
        },
        clear: () => {
            store.clear();
        },
        getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
        key: (index: number) => Array.from(store.keys())[index] ?? null,
        removeItem: (key: string) => {
            store.delete(key);
        },
        setItem: (key: string, value: string) => {
            store.set(String(key), String(value));
        },
    };
}

const g = globalThis as unknown as { localStorage?: Storage; window?: Window & typeof globalThis };

if (typeof g.localStorage === "undefined") {
    // Writable so tests can swap in their own mock storage object
    // (strict-mode assignment throws on a getter-only property).
    let backing = createMemoryStorage();
    Object.defineProperty(g, "localStorage", {
        configurable: true,
        enumerable: true,
        get: () => backing,
        set: (value: Storage) => {
            backing = value;
        },
    });
}

if (typeof document !== "undefined" && !document.queryCommandSupported) {
    document.queryCommandSupported = () => true;
}

// 3. window.matchMedia — monaco's StandaloneThemeService calls it on init;
//    jsdom does not implement it. Return a minimal no-op media-query handle.
if (typeof window !== "undefined" && !window.matchMedia) {
    window.matchMedia = (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

// 4. navigator.clipboard — monaco's clipboard service calls
//    navigator.clipboard.write(...) on copy/cut in the editor; jsdom has no
//    clipboard API. A no-op stub keeps editor interactions from throwing.
if (typeof navigator !== "undefined" && !navigator.clipboard) {
    Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
            write: async () => {},
            writeText: async () => {},
            read: async () => [],
            readText: async () => "",
        },
    });
}

// 5. ResizeObserver — monaco's editor config observes element size on mount;
//    jsdom has no ResizeObserver. A no-op keeps editor creation from throwing.
if (typeof globalThis !== "undefined" && !globalThis.ResizeObserver) {
    (globalThis as any).ResizeObserver = class {
        observe() {}
        unobserve() {}
        disconnect() {}
    };
}

// 6. ClipboardItem — referenced by monaco's clipboard service on copy/cut;
//    jsdom has no ClipboardItem constructor.
if (typeof globalThis !== "undefined" && !(globalThis as any).ClipboardItem) {
    (globalThis as any).ClipboardItem = class {
        constructor(public data: Record<string, any>) {}
        getType() { return Object.keys((this as any).data)[0] || "text/plain"; }
        async types() { return Object.keys((this as any).data); }
        async get(type: string) { return (this as any).data[type] ?? null; }
    };
}

// 7. Canvas 2D context — monaco's PixelRatioMonitor reads
//    document.createElement('canvas').getContext('2d') and its
//    *BackingStorePixelRatio. jsdom implements getContext but returns null
//    for '2d', so override it with a minimal stub (only the fields monaco
//    touches).
if (typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined") {
    (HTMLCanvasElement.prototype as any).getContext = (type: string) => {
        if (type !== '2d') return null;
        return {
            webkitBackingStorePixelRatio: 1,
            fillRect: () => {},
            clearRect: () => {},
            getImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            putImageData: () => {},
            createImageData: (w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) }),
            setTransform: () => {},
            drawImage: () => {},
            save: () => {},
            restore: () => {},
            beginPath: () => {},
            moveTo: () => {},
            lineTo: () => {},
            closePath: () => {},
            stroke: () => {},
            fill: () => {},
            arc: () => {},
            rect: () => {},
            translate: () => {},
            scale: () => {},
            rotate: () => {},
            measureText: (text: string) => ({ width: String(text).length * 7 }),
            fillText: () => {},
            strokeText: () => {},
            canvas: undefined,
        };
    };
}

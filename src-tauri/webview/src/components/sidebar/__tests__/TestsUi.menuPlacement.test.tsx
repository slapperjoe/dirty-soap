import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestsUi, TestsUiProps } from "../TestsUi";
import { ApinoxProject } from "@shared/models";

// t_5a771ccd regression tests: the "Add Test Suite" dropdown must render in
// viewport coordinates (position: fixed) ABOVE the sidebar rail, never
// clipped/hidden behind the sidebar strip.
//
// Root cause + strategy: docs/MENU_SIDEBAR_STACKING_DIAGNOSIS.md (t_8de3fefc).
// The bug was an in-panel absolute (right:0) menu growing leftward past the
// panel edge into the rail zone, clipped by overflow:hidden on SidebarContent.
// The fix (t_894bcad3) moved AddSuiteMenu to position: fixed at viewport
// coordinates computed from the trigger button's rect (SidebarContextMenu
// pattern), z-index 1001.
//
// Note on sidebar expand/collapse: TestsUi has no expand/collapse state of
// its own — the rail/panel geometry belongs to Sidebar.tsx, which the fix
// deliberately does not touch. The regression guard here is that the menu's
// placement is viewport-anchored (independent of the panel's clipping box),
// so any rail/panel width change cannot re-clip it.
//
// No visual-regression tooling exists in the webview package (no
// playwright/cypress/puppeteer), so these are DOM geometry assertions
// instead of screenshots.

// Mock Lucide icons (same set as TestsUi.test.tsx; SidebarContextMenu
// re-exports Pencil from lucide-react and renders it as an item icon).
vi.mock("lucide-react", () => ({
    Play: () => <span data-testid="icon-play" />,
    Plus: () => <span data-testid="icon-plus" />,
    Trash2: () => <span data-testid="icon-trash" />,
    ChevronDown: () => <span data-testid="icon-chevron-down" />,
    ChevronRight: () => <span data-testid="icon-chevron-right" />,
    FlaskConical: () => <span data-testid="icon-flask" />,
    FolderOpen: () => <span data-testid="icon-folder" />,
    ListChecks: () => <span data-testid="icon-list-checks" />,
    Edit2: () => <span data-testid="icon-edit" />,
    Clock: () => <span data-testid="icon-clock" />,
    FileCode: () => <span data-testid="icon-file-code" />,
    ArrowRight: () => <span data-testid="icon-arrow-right" />,
    FileText: () => <span data-testid="icon-file-text" />,
    Pencil: () => <span data-testid="icon-pencil" />
}));

const mockProject: ApinoxProject = {
    name: "Project 1",
    fileName: "project1.json",
    readOnly: false,
    interfaces: [],
    testSuites: []
};

const defaultProps: TestsUiProps = {
    projects: [mockProject],
    onAddSuite: vi.fn(),
    onDeleteSuite: vi.fn(),
    onRunSuite: vi.fn(),
    onAddTestCase: vi.fn(),
    onDeleteTestCase: vi.fn(),
    onRenameTestCase: vi.fn(),
    onRunCase: vi.fn(),
    onSelectSuite: vi.fn(),
    onSelectTestCase: vi.fn(),
    onToggleSuiteExpand: vi.fn(),
    onToggleCaseExpand: vi.fn(),
    onSelectTestStep: vi.fn(),
    onRenameTestStep: vi.fn(),
    deleteConfirm: null
};

// The trigger is a <button> (title="Add Test Suite"); the ref for the
// placement math lives on it. The "Add suite to project:" text sits in
// AddSuiteMenuTitle (a div); the AddSuiteMenu wrapper — the element that
// carries position:fixed and the inline top/left — is its parent.
const getTriggerButton = () => screen.getByTitle("Add Test Suite") as HTMLButtonElement;

const getAddSuiteMenu = () =>
    (screen.getByText("Add suite to project:").closest("div") as HTMLElement).parentElement as HTMLElement;

// jsdom reports zero rects and getComputedStyle() does not resolve
// stylesheet classes (styled-components injects <style> tags), so the
// placement math must be driven by a stubbed rect and the CSS must be
// asserted by finding the injected rule for the element's class.
const stubButtonRect = (right: number, bottom: number) => {
    const btn = getTriggerButton();
    vi.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 0,
        left: right - 30,
        right,
        bottom,
        width: 30,
        height: 30,
        x: right - 30,
        y: 0
    } as DOMRect);
};

const openMenu = () => {
    stubButtonRect(230, 80);
    fireEvent.click(getTriggerButton());
    return getAddSuiteMenu();
};

const cssForElement = (el: HTMLElement): string => {
    const classes = el.className.split(/\s+/);
    const text: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
            rules = sheet.cssRules;
        } catch {
            continue;
        }
        for (const rule of Array.from(rules)) {
            const t = (rule as CSSStyleRule).selectorText || "";
            const body = (rule as CSSStyleRule).cssText || "";
            if (classes.some(c => t.split(",").some(sel => sel.trim().includes(`.${c}`)))) {
                text.push(body);
            }
        }
    }
    return text.join(" ");
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe("TestsUi Add Suite menu placement (t_5a771ccd regression)", () => {
    it("renders the menu as position:fixed (regression guard against the panel's overflow clipping)", () => {
        render(<TestsUi {...defaultProps} />);
        const menu = openMenu();

        // absolute-in-panel + SidebarContent overflow:hidden is the bug;
        // fixed (viewport) placement escapes the clipping box.
        expect(cssForElement(menu)).toMatch(/position:\s*fixed/);
        // And it must NOT have reverted to in-panel absolute anchoring.
        expect(cssForElement(menu)).not.toMatch(/position:\s*absolute/);
    });

    it("sits at z-index >= 1001 (above the mobile drawer's 1000)", () => {
        render(<TestsUi {...defaultProps} />);
        const menu = openMenu();

        const match = cssForElement(menu).match(/z-index:\s*(\d+)/i);
        expect(match).not.toBeNull();
        expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(1001);
    });

    it("places the menu below the trigger, right-aligned to it, in viewport coordinates", () => {
        render(<TestsUi {...defaultProps} />);
        stubButtonRect(230, 80); // button right edge at x=230, bottom at y=80

        fireEvent.click(getTriggerButton());
        const menu = getAddSuiteMenu();

        // top = rect.bottom + 4 = 84
        expect(menu.style.top).toBe("84px");
        // left = max(8, rect.right - 200) = max(8, 230 - 200) = 30
        expect(menu.style.left).toBe("30px");
    });

    it("clamps the menu's left edge to the viewport edge when the button is near the left", () => {
        render(<TestsUi {...defaultProps} />);
        stubButtonRect(100, 80); // rect.right - 200 = -100 -> clamp to 8

        fireEvent.click(getTriggerButton());
        const menu = getAddSuiteMenu();

        expect(menu.style.top).toBe("84px");
        expect(menu.style.left).toBe("8px");
    });

    it("closes on outside click", () => {
        render(<TestsUi {...defaultProps} />);
        openMenu();
        expect(screen.getByText("Add suite to project:")).toBeInTheDocument();

        fireEvent.mouseDown(document.body);

        expect(screen.queryByText("Add suite to project:")).not.toBeInTheDocument();
    });

    it("closes on Escape", () => {
        render(<TestsUi {...defaultProps} />);
        openMenu();
        expect(screen.getByText("Add suite to project:")).toBeInTheDocument();

        fireEvent.keyDown(document, { key: "Escape" });

        expect(screen.queryByText("Add suite to project:")).not.toBeInTheDocument();
    });

    it("keeps menu items keyboard-operable (real <button> elements)", () => {
        render(<TestsUi {...defaultProps} />);
        openMenu();

        const item = screen.getByText("Project 1").closest("button");
        expect(item).toBeInstanceOf(HTMLButtonElement);
        expect(item!.type).toBe("button");
    });
});

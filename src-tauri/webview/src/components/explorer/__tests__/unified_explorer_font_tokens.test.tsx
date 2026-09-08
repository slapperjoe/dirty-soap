import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnifiedExplorerSidebar, TreeItem, type TreeItemProps } from "../UnifiedExplorerSidebar";

/**
 * Font-size tokens: the unified explorer sidebar's project/operation/request
 * rows must render at the standardized quick-request baseline sizes
 * (docs/FONT_SIZE_TOKENS.md, kanban t_8f2b97a4).
 *
 *   project rows    --apinox-fs-md   (12px)
 *   operation rows  --apinox-fs-sm   (11px)
 *   request rows    --apinox-fs-sm   (11px)
 *
 * Regression guard: without the per-type font-size the rows inherit the
 * 13px app base, which is what broke the baseline before this change.
 */

describe("explorer tree rows use the shared font-size tokens", () => {
  it.each([
    { type: "project", token: "var(--apinox-fs-md)" },
    { type: "operation", token: "var(--apinox-fs-sm)" },
    { type: "request", token: "var(--apinox-fs-sm)" },
  ])("renders %s rows at %s", ({ type, token }) => {
    const props: TreeItemProps = {
      label: `a-${type}-row`,
      type: type as TreeItemProps["type"],
    };
    render(<TreeItem {...props} />);
    const row = screen.getByText(`a-${type}-row`).closest("div")!;
    expect(row.style.fontSize).toBe(token);
  });

  it("does not shrink request rows to the 10px badge size", () => {
    const props: TreeItemProps = { label: "a-request-row", type: "request" };
    render(<TreeItem {...props} />);
    const row = screen.getByText("a-request-row").closest("div")!;
    expect(row.style.fontSize).not.toBe("var(--apinox-fs-xs)");
  });
});

describe("UnifiedExplorerSidebar tree row tokens", () => {
  const makeProject = () => ({
    id: "p1",
    name: "Proj",
    displayName: "Proj",
    operations: [
      {
        id: "op1",
        name: "Op",
        displayName: "Op",
        requests: [
          { id: "r1", name: "Req", displayName: "Req" },
          { id: "r2", name: "Req2", displayName: "Req2" },
        ],
      },
    ],
  });

  const renderSidebar = (projects: unknown[]) => {
    const onSelectNode = vi.fn();
    const onToggle = vi.fn();
    const onDrop = vi.fn();
    const onReorderOperation = vi.fn();
    const onReorderRequest = vi.fn();
    const onCreateProject = vi.fn();
    return render(
      <UnifiedExplorerSidebar
        projects={projects}
        selectedProject={null}
        onSelectProject={onSelectNode}
        selectedOperation={null}
        onSelectOperation={onSelectNode}
        selectedRequest={null}
        onSelectRequest={onSelectNode}
        onNavigate={onSelectNode}
        onCreateProject
        onDeleteProject={vi.fn()}
        onToggleOperation={onToggle}
        onToggleProject={onToggle}
        onDrop
        onReorderOperation
        onReorderRequest
        onCreateRequest={vi.fn()}
        onDeleteRequest={vi.fn()}
      />
    );
  };

  it("renders project/operation/request rows at the baseline tokens", () => {
    renderSidebar([makeProject()]);
    const projectRow = screen.getByText("Proj").closest("div")!;
    expect(projectRow.style.fontSize).toBe("var(--apinox-fs-md)");
    // Operation/request rows live behind the expand chevron; the TreeItem
    // unit tests above cover their token values.
    expect(screen.queryByText("Op")).toBeNull();
  });
});

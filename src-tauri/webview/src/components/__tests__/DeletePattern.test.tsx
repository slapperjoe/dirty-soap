import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectList } from '../sidebar/ProjectList';
import { ApinoxProject } from '@shared/models';

describe('Delete Pattern - Sidebar', () => {
    const mockProjects: ApinoxProject[] = [
        {
            id: 'p1',
            name: 'Test Project',
            interfaces: [],
            folders: [],
            expanded: true
        }
    ];

    const defaultProps = {
        projects: mockProjects,
        savedProjects: new Set<string>(),
        onAddProject: vi.fn(),
        loadProject: vi.fn(),
        saveProject: vi.fn(),
        onUpdateProject: vi.fn(),
        closeProject: vi.fn(),
        toggleProjectExpand: vi.fn(),
        toggleInterfaceExpand: vi.fn(),
        toggleOperationExpand: vi.fn(),
        setSelectedProjectName: vi.fn(),
        selectedProjectName: 'Test Project',
        selectedInterface: null,
        setSelectedInterface: vi.fn(),
        selectedOperation: null,
        setSelectedOperation: vi.fn(),
        selectedRequest: null,
        setSelectedRequest: vi.fn(),
        setResponse: vi.fn(),
        handleContextMenu: vi.fn(),
        deleteConfirm: null,
        setDeleteConfirm: vi.fn()
    };

    it('should show delete icon for selected project', () => {
        render(<ProjectList {...defaultProps} />);
        const deleteButton = screen.getByTitle('Close Project');
        expect(deleteButton).toBeInTheDocument();
    });

    it('should turn red and shake on first click', () => {
        const setDeleteConfirm = vi.fn();
        const { rerender } = render(<ProjectList {...defaultProps} setDeleteConfirm={setDeleteConfirm} />);

        const deleteButton = screen.getByTitle('Close Project');
        fireEvent.click(deleteButton);

        expect(setDeleteConfirm).toHaveBeenCalledWith('Test Project');

        // Simulate state update from parent
        rerender(<ProjectList {...defaultProps} deleteConfirm="Test Project" setDeleteConfirm={setDeleteConfirm} />);

        const shakingButton = screen.getByTitle('Click again to Confirm Delete');
        expect(shakingButton).toHaveStyle('color: var(--vscode-errorForeground)');
        // Checking for animation is harder in JSDOM, but we can check the prop if we exposed it or just trust the style
    });

    it('should call delete handler on second click', () => {
        const closeProject = vi.fn();
        const setDeleteConfirm = vi.fn();

        // Start with confirmation active
        render(
            <ProjectList
                {...defaultProps}
                deleteConfirm="Test Project"
                setDeleteConfirm={setDeleteConfirm}
                closeProject={closeProject}
            />
        );

        const deleteButton = screen.getByTitle('Click again to Confirm Delete');
        fireEvent.click(deleteButton);

        expect(closeProject).toHaveBeenCalledWith('Test Project');
    });

    it('should follow delete pattern for interfaces', () => {
        const onDeleteInterface = vi.fn();
        const setDeleteConfirm = vi.fn();
        const mockProjectWithInterface: ApinoxProject = {
            ...mockProjects[0],
            interfaces: [{ name: 'Test Interface', operations: [], expanded: true } as any]
        };

        const { rerender } = render(
            <ProjectList
                {...defaultProps}
                projects={[mockProjectWithInterface]}
                selectedInterface={mockProjectWithInterface.interfaces[0]}
                setDeleteConfirm={setDeleteConfirm}
                onDeleteInterface={onDeleteInterface}
            />
        );

        const deleteButton = screen.getByTitle('Delete Interface');
        fireEvent.click(deleteButton);
        expect(setDeleteConfirm).toHaveBeenCalledWith('Test Interface');

        rerender(
            <ProjectList
                {...defaultProps}
                projects={[mockProjectWithInterface]}
                deleteConfirm="Test Interface"
                selectedInterface={mockProjectWithInterface.interfaces[0]}
                setDeleteConfirm={setDeleteConfirm}
                onDeleteInterface={onDeleteInterface}
            />
        );

        const shakingButton = screen.getByTitle('Click again to Confirm Delete');
        fireEvent.click(shakingButton);
        expect(onDeleteInterface).toHaveBeenCalled();
    });

    it('should follow delete pattern for folders', () => {
        const onDeleteFolder = vi.fn();
        const setDeleteConfirm = vi.fn();
        const mockProjectWithFolder: ApinoxProject = {
            ...mockProjects[0],
            folders: [{ id: 'f1', name: 'Test Folder', requests: [], folders: [], expanded: true }]
        };

        const { rerender } = render(
            <ProjectList
                {...defaultProps}
                projects={[mockProjectWithFolder]}
                onDeleteFolder={onDeleteFolder}
                setDeleteConfirm={setDeleteConfirm}
                // Mock selection to show buttons
                selectedProjectName="Test Project"
            />
        );

        // Folders need selection to show buttons
        const folderItem = screen.getByText('Test Folder');
        fireEvent.click(folderItem);

        rerender(
            <ProjectList
                {...defaultProps}
                projects={[mockProjectWithFolder]}
                onDeleteFolder={onDeleteFolder}
                setDeleteConfirm={setDeleteConfirm}
            />
        );

        const deleteButton = screen.getByTitle('Delete Folder');
        fireEvent.click(deleteButton);
        expect(setDeleteConfirm).toHaveBeenCalledWith('f1');

        rerender(
            <ProjectList
                {...defaultProps}
                projects={[mockProjectWithFolder]}
                deleteConfirm="f1"
                onDeleteFolder={onDeleteFolder}
                setDeleteConfirm={setDeleteConfirm}
            />
        );

        const shakingButton = screen.getByTitle('Click again to Confirm');
        fireEvent.click(shakingButton);
        expect(onDeleteFolder).toHaveBeenCalledWith('Test Project', 'f1');
    });
});

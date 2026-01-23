
import { renderHook, act } from '@testing-library/react';
import { useFolderManager } from '../useFolderManager';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApinoxProject, ApiRequest } from '@shared/models';

describe('useFolderManager', () => {
    let mockProjects: ApinoxProject[];
    let setProjects: ReturnType<typeof vi.fn>;
    let setWorkspaceDirty: ReturnType<typeof vi.fn>;
    let setSelectedRequest: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockProjects = [
            {
                id: 'p1',
                name: 'Project 1',
                interfaces: [],
                folders: [
                    {
                        id: 'f1',
                        name: 'Folder 1',
                        requests: [],
                        folders: [],
                        expanded: true
                    }
                ]
            }
        ];
        setProjects = vi.fn((updateFn) => {
            if (typeof updateFn === 'function') {
                mockProjects = updateFn(mockProjects);
            } else {
                mockProjects = updateFn;
            }
        });
        setWorkspaceDirty = vi.fn();
        setSelectedRequest = vi.fn();
    });

    it('should add a folder to the root', () => {
        const { result } = renderHook(() => useFolderManager({
            setProjects: setProjects as unknown as React.Dispatch<React.SetStateAction<ApinoxProject[]>>,
            setWorkspaceDirty: setWorkspaceDirty as unknown as React.Dispatch<React.SetStateAction<boolean>>,
            setSelectedRequest: setSelectedRequest as unknown as (req: ApiRequest) => void
        }));

        act(() => {
            result.current.handleAddFolder('Project 1');
        });

        expect(setProjects).toHaveBeenCalled();
        expect(setWorkspaceDirty).toHaveBeenCalledWith(true);
        const project = mockProjects.find(p => p.name === 'Project 1');
        expect(project?.folders?.length).toBe(2);
        expect(project?.folders?.[1].name).toBe('New Folder');
    });

    it('should add a folder to a parent folder', () => {
        const { result } = renderHook(() => useFolderManager({
            setProjects: setProjects as unknown as React.Dispatch<React.SetStateAction<ApinoxProject[]>>,
            setWorkspaceDirty: setWorkspaceDirty as unknown as React.Dispatch<React.SetStateAction<boolean>>,
            setSelectedRequest: setSelectedRequest as unknown as (req: ApiRequest) => void
        }));

        act(() => {
            result.current.handleAddFolder('Project 1', 'f1');
        });

        const project = mockProjects.find(p => p.name === 'Project 1');
        const parentFolder = project?.folders?.find(f => f.id === 'f1');
        expect(parentFolder?.folders?.length).toBe(1);
        expect(parentFolder?.folders?.[0].name).toBe('New Folder');
    });

    it('should delete a folder', () => {
        const { result } = renderHook(() => useFolderManager({
            setProjects: setProjects as unknown as React.Dispatch<React.SetStateAction<ApinoxProject[]>>,
            setWorkspaceDirty: setWorkspaceDirty as unknown as React.Dispatch<React.SetStateAction<boolean>>,
            setSelectedRequest: setSelectedRequest as unknown as (req: ApiRequest) => void
        }));

        act(() => {
            result.current.handleDeleteFolder('Project 1', 'f1');
        });

        const project = mockProjects.find(p => p.name === 'Project 1');
        expect(project?.folders?.length).toBe(0);
    });

    it('should toggle folder expansion', () => {
        const { result } = renderHook(() => useFolderManager({
            setProjects: setProjects as unknown as React.Dispatch<React.SetStateAction<ApinoxProject[]>>,
            setWorkspaceDirty: setWorkspaceDirty as unknown as React.Dispatch<React.SetStateAction<boolean>>,
            setSelectedRequest: setSelectedRequest as unknown as (req: ApiRequest) => void
        }));

        act(() => {
            result.current.handleToggleFolderExpand('Project 1', 'f1');
        });

        const project = mockProjects.find(p => p.name === 'Project 1');
        const folder = project?.folders?.find(f => f.id === 'f1');
        expect(folder?.expanded).toBe(false);
    });

    it('should add a request to a folder', () => {
        const { result } = renderHook(() => useFolderManager({
            setProjects: setProjects as unknown as React.Dispatch<React.SetStateAction<ApinoxProject[]>>,
            setWorkspaceDirty: setWorkspaceDirty as unknown as React.Dispatch<React.SetStateAction<boolean>>,
            setSelectedRequest: setSelectedRequest as unknown as (req: ApiRequest) => void
        }));

        act(() => {
            result.current.handleAddRequestToFolder('Project 1', 'f1');
        });

        const project = mockProjects.find(p => p.name === 'Project 1');
        const folder = project?.folders?.find(f => f.id === 'f1');
        expect(folder?.requests.length).toBe(1);
        expect(folder?.requests[0].name).toBe('New Request');
        expect(setSelectedRequest).toHaveBeenCalled();
    });
});

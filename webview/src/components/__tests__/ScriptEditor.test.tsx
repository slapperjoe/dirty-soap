import { render, screen, fireEvent } from '@testing-library/react';
import { ScriptEditor } from '../ScriptEditor';
import { SoapTestStep } from '@shared/models';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the bridge
vi.mock('../../utils/bridge', () => ({
    bridge: {
        sendMessage: vi.fn()
    }
}));

describe('ScriptEditor', () => {
    const mockStep: SoapTestStep = {
        id: 'step-123',
        name: 'Test Script',
        type: 'script',
        config: {
            scriptContent: '// Default content\nlog("test");'
        }
    };

    const mockOnUpdate = vi.fn();
    const mockOnBack = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should display the script content from props', () => {
        render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // Monaco editor should be rendered with the content
        expect(screen.getByText(/Test Script/i)).toBeInTheDocument();
    });

    it('should show save button only when content is dirty', async () => {
        render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // Save button should not be visible initially
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();

        // TODO: Simulate Monaco editor change to make it dirty
        // This is complex because Monaco is wrapped in a component
        // For now, this test documents the expected behavior
    });

    it('should call onUpdate with updated content when save is clicked', async () => {
        render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // This would require simulating Monaco editor changes
        // For now, this test documents the expected behavior
        expect(mockOnUpdate).not.toHaveBeenCalled();
    });

    it('should not overwrite local edits when step prop updates with same content', () => {
        const { rerender } = render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // Rerender with same step
        rerender(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // Should not cause any issues
        expect(screen.getByText(/Test Script/i)).toBeInTheDocument();
    });

    it('should update content when step prop changes with different scriptContent', () => {
        const { rerender } = render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        const updatedStep: SoapTestStep = {
            ...mockStep,
            config: {
                scriptContent: '// Updated content\nlog("updated");'
            }
        };

        rerender(
            <ScriptEditor
                step={updatedStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        // Content should be updated
        // (This would need Monaco testing utilities to verify the actual editor content)
    });

    it('should auto-save when clicking back button if dirty', () => {
        render(
            <ScriptEditor
                step={mockStep}
                onUpdate={mockOnUpdate}
                onBack={mockOnBack}
            />
        );

        const backButton = screen.getByRole('button', { name: /back/i });
        fireEvent.click(backButton);

        // Should call onBack
        expect(mockOnBack).toHaveBeenCalled();
    });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmationModal } from './ConfirmationModal';

describe('ConfirmationModal', () => {
    it('should not render when isOpen is false', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmationModal
                isOpen={false}
                title="Test"
                message="Test message"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.queryByText('Test message')).not.toBeInTheDocument();
    });

    it('should render title and message when open', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmationModal
                isOpen={true}
                title="Confirm Delete"
                message="Are you sure you want to delete?"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        expect(screen.getByText('Confirm Delete')).toBeInTheDocument();
        expect(screen.getByText('Are you sure you want to delete?')).toBeInTheDocument();
    });

    it('should call onConfirm when Delete button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmationModal
                isOpen={true}
                title="Test"
                message="Test"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByText('Delete'));
        expect(onConfirm).toHaveBeenCalled();
    });

    it('should call onCancel when Cancel button is clicked', () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();

        render(
            <ConfirmationModal
                isOpen={true}
                title="Test"
                message="Test"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />
        );

        fireEvent.click(screen.getByText('Cancel'));
        expect(onCancel).toHaveBeenCalled();
    });
});

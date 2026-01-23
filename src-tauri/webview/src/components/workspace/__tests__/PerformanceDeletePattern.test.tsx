import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PerformanceSuiteEditor } from '../PerformanceSuiteEditor';
import { PerformanceSuite } from '@shared/models';

describe('Delete Pattern - PerformanceSuiteEditor', () => {
    const mockSuite: PerformanceSuite = {
        id: 's1',
        name: 'Test Suite',
        requests: [
            { id: 'r1', name: 'Test Request', order: 0, method: 'POST', endpoint: 'http://test.com', soapAction: '', requestBody: '', headers: {}, extractors: [] }
        ],
        delayBetweenRequests: 0,
        iterations: 1,
        concurrency: 1,
        warmupRuns: 0,
        createdAt: 0,
        modifiedAt: 0
    };

    const defaultProps = {
        suite: mockSuite,
        onUpdate: vi.fn(),
        onRun: vi.fn(),
        onStop: vi.fn(),
        isRunning: false,
        onDeleteRequest: vi.fn(),
        onUpdateRequest: vi.fn(),
        onSelectRequest: vi.fn(),
        onImportFromWorkspace: vi.fn()
    };

    it('should follow delete pattern for requests', () => {
        const onDeleteRequest = vi.fn();
        render(<PerformanceSuiteEditor {...defaultProps} onDeleteRequest={onDeleteRequest} />);

        const deleteButton = screen.getByTitle('Remove Request');
        fireEvent.click(deleteButton);

        // Should not have called onDeleteRequest yet
        expect(onDeleteRequest).not.toHaveBeenCalled();

        // Should change title
        expect(screen.getByTitle('Click again to Confirm')).toBeInTheDocument();

        // Second click
        fireEvent.click(screen.getByTitle('Click again to Confirm'));
        expect(onDeleteRequest).toHaveBeenCalledWith('s1', 'r1');
    });

    it('should follow delete pattern for schedules', () => {
        const onDeleteSchedule = vi.fn();
        const schedules = [
            { id: 'sch1', suiteId: 's1', suiteName: 'Test Suite', cronExpression: '0 0 * * *', enabled: true, lastRun: 0, createdAt: 0 }
        ];

        render(
            <PerformanceSuiteEditor
                {...defaultProps}
                schedules={schedules}
                onDeleteSchedule={onDeleteSchedule}
            />
        );

        const deleteButton = screen.getByTitle('Delete Schedule');
        fireEvent.click(deleteButton);

        expect(onDeleteSchedule).not.toHaveBeenCalled();
        expect(screen.getByTitle('Click again to Confirm')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Click again to Confirm'));
        expect(onDeleteSchedule).toHaveBeenCalledWith('sch1');
    });
});

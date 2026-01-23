import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExtractorsPanel } from '../components/ExtractorsPanel';

// Mock the xpathEvaluator
vi.mock('../utils/xpathEvaluator', () => ({
    CustomXPathEvaluator: {
        evaluate: vi.fn(() => 'mocked-value')
    }
}));

describe('ExtractorsPanel', () => {
    it('should render empty state when no extractors', () => {
        const onChange = vi.fn();
        render(<ExtractorsPanel extractors={[]} onChange={onChange} />);

        expect(screen.getByText(/No extractors defined/i)).toBeInTheDocument();
    });

    it('should render extractor with variable name', () => {
        const onChange = vi.fn();
        const extractors = [{
            id: 'ext-1',
            type: 'XPath' as const,
            source: 'body' as const,
            path: '//result',
            variable: 'myVar'
        }];
        render(<ExtractorsPanel extractors={extractors} onChange={onChange} />);

        expect(screen.getByText('myVar')).toBeInTheDocument();
        expect(screen.getByText('//result')).toBeInTheDocument();
    });

    it('should show source type', () => {
        const onChange = vi.fn();
        const extractors = [{
            id: 'ext-2',
            type: 'XPath' as const,
            source: 'body' as const,
            path: '//data',
            variable: 'testVar'
        }];
        render(<ExtractorsPanel extractors={extractors} onChange={onChange} />);

        expect(screen.getByText('body')).toBeInTheDocument();
    });

    it('should call onChange when delete button is clicked', () => {
        const onChange = vi.fn();
        const extractors = [{
            id: 'ext-3',
            type: 'XPath' as const,
            source: 'body' as const,
            path: '//test',
            variable: 'deleteMe'
        }];
        render(<ExtractorsPanel extractors={extractors} onChange={onChange} />);

        const deleteButton = screen.getByTitle('Delete Extractor');
        fireEvent.click(deleteButton);

        expect(onChange).toHaveBeenCalledWith([]);
    });

    it('should show preview when rawResponse is provided', () => {
        const onChange = vi.fn();
        const extractors = [{
            id: 'ext-4',
            type: 'XPath' as const,
            source: 'body' as const,
            path: '//value',
            variable: 'previewVar'
        }];
        const rawResponse = '<root><value>test</value></root>';
        render(<ExtractorsPanel extractors={extractors} onChange={onChange} rawResponse={rawResponse} />);

        expect(screen.getByText('Preview:')).toBeInTheDocument();
    });

    it('should render multiple extractors', () => {
        const onChange = vi.fn();
        const extractors = [
            { id: 'ext-a', type: 'XPath' as const, source: 'body' as const, path: '//a', variable: 'varA' },
            { id: 'ext-b', type: 'XPath' as const, source: 'body' as const, path: '//b', variable: 'varB' }
        ];
        render(<ExtractorsPanel extractors={extractors} onChange={onChange} />);

        expect(screen.getByText('varA')).toBeInTheDocument();
        expect(screen.getByText('varB')).toBeInTheDocument();
    });

    it('should render header text', () => {
        const onChange = vi.fn();
        render(<ExtractorsPanel extractors={[]} onChange={onChange} />);

        expect(screen.getByText(/Context Variables extracted/i)).toBeInTheDocument();
    });
});

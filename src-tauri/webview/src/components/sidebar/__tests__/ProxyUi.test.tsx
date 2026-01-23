import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProxyUi, ProxyUiProps } from '../ProxyUi';
import { WatcherEvent } from '@shared/models';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Play: () => <span data-testid="icon-play" />,
    Square: () => <span data-testid="icon-square" />,
    Shield: () => <span data-testid="icon-shield" />,
    Trash2: () => <span data-testid="icon-trash" />,
    FolderOpen: () => <span data-testid="icon-folder" />,
    Network: () => <span data-testid="icon-network" />,
    FileCode: () => <span data-testid="icon-file-code" />,
    FileDown: () => <span data-testid="icon-file-down" />,
    Bug: () => <span data-testid="icon-bug" />,
    Plus: () => <span data-testid="icon-plus" />,
    Edit2: () => <span data-testid="icon-edit" />,
    ToggleLeft: () => <span data-testid="icon-toggle-left" />,
    ToggleRight: () => <span data-testid="icon-toggle-right" />,
    X: () => <span data-testid="icon-x" />
}));

// Mock child modals
vi.mock('../../modals/BreakpointModal', () => ({
    BreakpointModal: ({ open, onClose, onSave }: any) => open ? (
        <div data-testid="breakpoint-modal">
            <button onClick={onClose}>Close</button>
            <button onClick={() => onSave({ id: 'new-bp', name: 'New BP' })}>Save</button>
        </div>
    ) : null
}));

describe('ProxyUi', () => {
    const defaultProps: ProxyUiProps = {
        isRunning: false,
        config: { port: 9000, target: 'http://example.com' },
        history: [],
        onStart: vi.fn(),
        onStop: vi.fn(),
        onUpdateConfig: vi.fn(),
        onClear: vi.fn(),
        onSelectEvent: vi.fn(),
        onSaveHistory: vi.fn(),
        configPath: null,
        onSelectConfigFile: vi.fn(),
        onInjectProxy: vi.fn(),
        onRestoreProxy: vi.fn(),
        breakpoints: [],
        onUpdateBreakpoints: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render basic proxy controls', () => {
        render(<ProxyUi {...defaultProps} />);

        expect(screen.getByText('Local Port')).toBeInTheDocument();
        expect(screen.getByDisplayValue('9000')).toBeInTheDocument();

        expect(screen.getByText('Target URL')).toBeInTheDocument();
        expect(screen.getByDisplayValue('http://example.com')).toBeInTheDocument();

        expect(screen.getByTitle('Start Proxy')).toBeInTheDocument();
    });

    it('should call onUpdateConfig when inputs change', () => {
        render(<ProxyUi {...defaultProps} />);

        // Change Port
        fireEvent.change(screen.getByDisplayValue('9000'), { target: { value: '9001' } });
        expect(defaultProps.onUpdateConfig).toHaveBeenCalledWith({ ...defaultProps.config, port: 9001 });

        // Change Target
        fireEvent.change(screen.getByDisplayValue('http://example.com'), { target: { value: 'http://test.com' } });
        expect(defaultProps.onUpdateConfig).toHaveBeenCalledWith({ ...defaultProps.config, target: 'http://test.com' });
    });

    it('should call onStart/onStop handlers', () => {
        const { rerender } = render(<ProxyUi {...defaultProps} />);

        fireEvent.click(screen.getByTitle('Start Proxy'));
        expect(defaultProps.onStart).toHaveBeenCalled();

        // Rerender as running
        rerender(<ProxyUi {...defaultProps} isRunning={true} />);

        const stopBtn = screen.getByTitle('Stop Proxy');
        expect(stopBtn).toBeInTheDocument();
        fireEvent.click(stopBtn);
        expect(defaultProps.onStop).toHaveBeenCalled();
    });

    it('should render Config Switcher controls when configPath is set', () => {
        render(<ProxyUi {...defaultProps} configPath="/path/to/web.config" />);

        expect(screen.getByText('Config Switcher')).toBeInTheDocument();
        expect(screen.getByText('web.config')).toBeInTheDocument();

        expect(screen.getByTitle('Inject Proxy Address')).toBeInTheDocument();
        expect(screen.getByTitle('Restore Original Config')).toBeInTheDocument();

        fireEvent.click(screen.getByTitle('Inject Proxy Address'));
        expect(defaultProps.onInjectProxy).toHaveBeenCalled();

        fireEvent.click(screen.getByTitle('Restore Original Config'));
        expect(defaultProps.onRestoreProxy).toHaveBeenCalled();
    });

    it('should render traffic history and handle selection', () => {
        const event: WatcherEvent = { id: '1', method: 'GET', url: '/api', status: 200, timestamp: 123, timestampLabel: '10:00' };
        render(<ProxyUi {...defaultProps} history={[event]} />);

        expect(screen.getByText('Traffic (1)')).toBeInTheDocument();
        expect(screen.getByText('GET')).toBeInTheDocument();
        expect(screen.getByText('/api')).toBeInTheDocument();

        fireEvent.click(screen.getByText('/api'));
        expect(defaultProps.onSelectEvent).toHaveBeenCalledWith(event);

        // Save report button
        fireEvent.click(screen.getByTitle('Save Request Log'));
        expect(defaultProps.onSaveHistory).toHaveBeenCalled();
    });
});

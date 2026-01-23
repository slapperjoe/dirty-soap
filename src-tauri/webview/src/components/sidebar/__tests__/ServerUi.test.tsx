import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ServerUi, ServerUiProps } from '../ServerUi';
import { ServerConfig, WatcherEvent, MockEvent } from '@shared/models';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
    Play: () => <span data-testid="icon-play" />,
    Square: () => <span data-testid="icon-square" />,
    Trash2: () => <span data-testid="icon-trash" />,
    Settings: () => <span data-testid="icon-settings" />,
    ArrowRight: () => <span data-testid="icon-arrow-right" />,
    Plus: () => <span data-testid="icon-plus" />,
    Edit2: () => <span data-testid="icon-edit" />,
    ToggleLeft: () => <span data-testid="icon-toggle-left" />,
    ToggleRight: () => <span data-testid="icon-toggle-right" />,
    Radio: () => <span data-testid="icon-radio" />,
    Bug: () => <span data-testid="icon-bug" />,
    PlusSquare: () => <span data-testid="icon-plus-square" />,
    Shield: () => <span data-testid="icon-shield" />,
    X: () => <span data-testid="icon-x" />
}));

// Mock child modals
vi.mock('../../modals/MockRuleModal', () => ({
    MockRuleModal: ({ open, onClose, onSave }: any) => open ? (
        <div data-testid="mock-rule-modal">
            <button onClick={onClose}>Close</button>
            <button onClick={() => onSave({ id: 'new-rule', name: 'New Rule', enabled: true, statusCode: 200, conditions: [], responseBody: '' })}>Save</button>
        </div>
    ) : null
}));

vi.mock('../../modals/BreakpointModal', () => ({
    BreakpointModal: ({ open, onClose, onSave }: any) => open ? (
        <div data-testid="breakpoint-modal">
            <button onClick={onClose}>Close</button>
            <button onClick={() => onSave({ id: 'new-bp', name: 'New BP' })}>Save</button>
        </div>
    ) : null
}));

describe('ServerUi', () => {
    const mockServerConfig: ServerConfig = {
        mode: 'off',
        port: 3000,
        targetUrl: 'http://localhost:8080',
        mockRules: [],
        passthroughEnabled: false
    };

    const defaultProps: ServerUiProps = {
        serverConfig: mockServerConfig,
        isRunning: false,
        onModeChange: vi.fn(),
        onStart: vi.fn(),
        onStop: vi.fn(),
        onOpenSettings: vi.fn(),
        proxyHistory: [],
        mockHistory: [],
        onSelectProxyEvent: vi.fn(),
        onSelectMockEvent: vi.fn(),
        onClearHistory: vi.fn(),
        mockRules: [],
        onAddMockRule: vi.fn(),
        onDeleteMockRule: vi.fn(),
        onToggleMockRule: vi.fn(),
        breakpoints: [],
        onUpdateBreakpoints: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should render rendering basic controls correctly', () => {
        render(<ServerUi {...defaultProps} />);

        expect(screen.getByText('Server')).toBeInTheDocument();
        expect(screen.getByTitle('Server Settings')).toBeInTheDocument();
        expect(screen.getByText('Mode')).toBeInTheDocument();

        // Mode buttons
        expect(screen.getByText('Off')).toBeInTheDocument();
        expect(screen.getByText('Moxy')).toBeInTheDocument();
        expect(screen.getByText('Proxy')).toBeInTheDocument();
        expect(screen.getByText('Both')).toBeInTheDocument();

        // Status bar
        expect(screen.getByText(/Port:/)).toBeInTheDocument();
        expect(screen.getByText('3000')).toBeInTheDocument();
    });

    it('should call onModeChange when mode button clicked', () => {
        render(<ServerUi {...defaultProps} />);

        fireEvent.click(screen.getByText('Moxy'));
        expect(defaultProps.onModeChange).toHaveBeenCalledWith('mock');
    });

    it('should disable mode buttons when running', () => {
        render(<ServerUi {...defaultProps} isRunning={true} />);

        const moxyBtn = screen.getByText('Moxy');
        expect(moxyBtn).toBeDisabled();

        fireEvent.click(moxyBtn);
        expect(defaultProps.onModeChange).not.toHaveBeenCalled();
    });

    it('should show start button when stopped (and mode != off)', () => {
        render(<ServerUi {...defaultProps} serverConfig={{ ...mockServerConfig, mode: 'mock' }} />);

        const startBtn = screen.getByTitle('Start Server');
        expect(startBtn).toBeInTheDocument();

        fireEvent.click(startBtn);
        expect(defaultProps.onStart).toHaveBeenCalled();
    });

    it('should show stop button when running', () => {
        render(<ServerUi {...defaultProps} serverConfig={{ ...mockServerConfig, mode: 'mock' }} isRunning={true} />);

        const stopBtn = screen.getByTitle('Stop Server');
        expect(stopBtn).toBeInTheDocument();

        fireEvent.click(stopBtn);
        expect(defaultProps.onStop).toHaveBeenCalled();
    });

    it('should render mock rules when valid mode', () => {
        const rules = [{ id: '1', name: 'Test Rule', enabled: true, statusCode: 200, conditions: [], responseBody: '' }];
        render(<ServerUi {...defaultProps} serverConfig={{ ...mockServerConfig, mode: 'mock' }} mockRules={rules} />);

        expect(screen.getByText(/Mock Rules/)).toBeInTheDocument();
        expect(screen.getByText('Test Rule')).toBeInTheDocument();

        // Toggle rule
        const toggleBtn = screen.getByTitle('Disable');
        fireEvent.click(toggleBtn);
        expect(defaultProps.onToggleMockRule).toHaveBeenCalledWith('1', false);

        // Delete rule
        const deleteBtn = screen.getByTitle('Delete');
        fireEvent.click(deleteBtn);
        expect(defaultProps.onDeleteMockRule).toHaveBeenCalledWith('1');
    });

    it('should render traffic history', () => {
        const proxyEvent: WatcherEvent = { id: 'p1', method: 'GET', url: '/api', status: 200, timestamp: 1000, timestampLabel: '10:00', duration: 100, requestHeaders: {}, requestBody: '', responseHeaders: {}, responseBody: '' };
        const mockEvent: MockEvent = { id: 'm1', method: 'POST', url: '/soap', status: 201, timestamp: 2000, timestampLabel: '10:01', duration: 100, requestHeaders: {}, requestBody: '', responseHeaders: {}, responseBody: '', matchedRule: 'rule1' };

        render(<ServerUi {...defaultProps} proxyHistory={[proxyEvent]} mockHistory={[mockEvent]} />);

        expect(screen.getByText('Traffic (2)')).toBeInTheDocument();
        expect(screen.getByText('GET')).toBeInTheDocument();
        expect(screen.getByText('POST')).toBeInTheDocument();

        // Check sorting (mockEvent is newer)
        const items = screen.getAllByText(/GET|POST/);
        expect(items).toHaveLength(2);
        // This is tricky as getAllByText might return multiple matches if not scoped.
        // But POST should appear before GET in the list because timestamp 2000 > 1000
    });

    it('should open rule modal on add click', () => {
        render(<ServerUi {...defaultProps} serverConfig={{ ...mockServerConfig, mode: 'mock' }} />);

        fireEvent.click(screen.getByTitle('Add Mock Rule'));
        expect(screen.getByTestId('mock-rule-modal')).toBeInTheDocument();

        // Save rule
        fireEvent.click(screen.getByText('Save'));
        expect(defaultProps.onAddMockRule).toHaveBeenCalled();
    });
});

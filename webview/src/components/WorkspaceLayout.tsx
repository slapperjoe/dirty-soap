import React from 'react';
import { Layout as LayoutIcon, ListOrdered, Play, Loader2, RotateCcw, WrapText, Bug, AlignLeft, Braces, ChevronLeft, ListChecks, Replace, Cloud, PlusSquare } from 'lucide-react';
// Models imported via props.ts indirections, specific enums kept if needed locally (TestStepType is used in code?)
// Checking code: TestStepType is used in props interface but not local var?
// Actually TestStepType is used in onAddStep signature but onAddStep comes from props.
// Let's remove them and add back if needed.
import { SidebarView } from '@shared/models';
// ... imports
import emptyServerImg from '../assets/empty-server.png';
import emptyWsdlImg from '../assets/empty-wsdl.png';
import emptyWatcherImg from '../assets/empty-watcher.png';
import emptyPerformanceImg from '../assets/empty-performance.png';
import emptyProjectImg from '../assets/empty-project.png';
import { MonacoRequestEditor, MonacoRequestEditorHandle } from './MonacoRequestEditor';
import { MonacoResponseViewer } from './MonacoResponseViewer';
import { AssertionsPanel } from './AssertionsPanel';
import { HeadersPanel } from './HeadersPanel';
import { SecurityPanel } from './SecurityPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ExtractorsPanel } from './ExtractorsPanel';
// ReactMarkdown moved to WelcomePanel
import { MonacoSingleLineInput, MonacoSingleLineInputHandle } from './MonacoSingleLineInput';
import { formatXml, stripCausalityData } from '@shared/utils/xmlFormatter';
import { XPathGenerator } from '../utils/xpathGenerator';
import { WelcomePanel, BreakpointOverlay, TestCaseView, EmptyTestCase } from './workspace';
import { PerformanceSuiteEditor } from './workspace/PerformanceSuiteEditor';
import { ScriptEditor } from './ScriptEditor';

// Styled components extracted to styles file
// unused models removed
import { createMockRuleFromSource } from '../utils/mockUtils';
import {
    Content,
    Toolbar,
    InfoBar,
    InfoBarMethod,
    InfoBarUrl,
    ToolbarButton,
    ToolbarSelect,
    MainFooter,
    IconButton,
    EmptyStateImage
} from '../styles/WorkspaceLayout.styles';


// Prop Groups
import {
    WorkspaceLayoutProps
} from '../types/props';

// WorkspaceBreakpointState moved to props.ts


// Local definition removed, using imported WorkspaceLayoutProps


// Helper Components
const EmptyState: React.FC<{ title: string; message: string; icon?: React.ElementType; image?: string }> = ({ title, message, icon: Icon, image }) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--vscode-descriptionForeground)', padding: 20, textAlign: 'center' }}>
        {image ? (
            <EmptyStateImage src={image} alt={title} />
        ) : (
            Icon && <Icon size={48} style={{ marginBottom: 20, opacity: 0.5 }} />
        )}
        <h2 style={{ marginBottom: 10, color: 'var(--vscode-foreground)' }}>{title}</h2>
        <p>{message}</p>
    </div>
);

const EmptyFileWatcher: React.FC = () => (
    <EmptyState
        title="File Watcher"
        message="The File Watcher monitors your project files for changes. Events will appear in the sidebar."
        image={emptyWatcherImg}
    />
);

const EmptyWsdlExplorer: React.FC = () => (
    <EmptyState
        title="WSDL Explorer"
        message="Load a WSDL file to browse its interfaces, operations, and requests."
        image={emptyWsdlImg}
    />
);

const EmptyServer: React.FC = () => (
    <EmptyState
        title="Dirty SOAP Server"
        message="Configure a local proxy server to inspect traffic or mock responses."
        image={emptyServerImg}
    />
);

const ProjectSummary: React.FC<{ project: import('@shared/models').SoapUIProject; onSelectInterface?: (i: import('@shared/models').SoapUIInterface) => void }> = ({ project, onSelectInterface }) => {
    // Calculate statistics
    const totalOperations = project.interfaces.reduce((sum, iface) => sum + iface.operations.length, 0);
    const totalRequests = project.interfaces.reduce((sum, iface) =>
        sum + iface.operations.reduce((opSum, op) => opSum + op.requests.length, 0), 0
    );

    return (
        <div style={{ padding: 40, color: 'var(--vscode-foreground)', overflowY: 'auto', flex: 1 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 30 }}>
                <div>
                    <h1 style={{ margin: 0 }}>Project: {project.name}</h1>
                    {project.description && <p style={{ fontSize: '1.1em', opacity: 0.8, margin: '8px 0 0 0' }}>{project.description}</p>}
                </div>
                {/* Action buttons could go here - placeholder for now since we need to wire up handlers */}
            </div>

            {/* Statistics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20, marginTop: 20 }}>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Interfaces</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{project.interfaces.length}</span>
                </div>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Test Suites</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{project.testSuites?.length || 0}</span>
                </div>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Operations</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{totalOperations}</span>
                </div>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Requests</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{totalRequests}</span>
                </div>
            </div>

            {/* Interfaces List */}
            <h2 style={{ marginTop: 40, borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 10 }}>Interfaces</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 15 }}>
                {project.interfaces.map(iface => (
                    <div
                        key={iface.name}
                        onClick={() => onSelectInterface && onSelectInterface(iface)}
                        style={{
                            padding: 15,
                            background: 'var(--vscode-list-hoverBackground)',
                            borderRadius: 4,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                    >
                        <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 'bold', fontSize: '1.1em' }}>{iface.name}</span>
                            <div style={{ fontSize: '0.8em', opacity: 0.7, marginTop: 4 }}>{iface.operations.length} operations</div>
                            {iface.definition && (
                                <div style={{ fontSize: '0.75em', opacity: 0.5, marginTop: 4, fontFamily: 'monospace' }}>
                                    {iface.definition}
                                </div>
                            )}
                        </div>
                        <ChevronLeft size={16} style={{ transform: 'rotate(180deg)', opacity: 0.5 }} />
                    </div>
                ))}
            </div>
        </div>
    );
};


const InterfaceSummary: React.FC<{ interface: import('@shared/models').SoapUIInterface; onSelectOperation?: (o: import('@shared/models').SoapUIOperation) => void }> = ({ interface: iface, onSelectOperation }) => {
    // Get endpoint from first operation if available
    const firstEndpoint = iface.operations[0]?.requests[0]?.endpoint;

    return (
        <div style={{ padding: 40, color: 'var(--vscode-foreground)', overflowY: 'auto', flex: 1 }}>
            <h1>Interface: {iface.name}</h1>
            <div style={{ marginTop: 20, padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                    <div><strong>WSDL:</strong> <a href="#" style={{ color: 'var(--vscode-textLink-foreground)' }}>{iface.definition}</a></div>
                    <div><strong>SOAP Version:</strong> {iface.soapVersion}</div>
                    {iface.bindingName && <div><strong>Binding:</strong> {iface.bindingName}</div>}
                    {firstEndpoint && <div><strong>Endpoint:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{firstEndpoint}</span></div>}
                    <div><strong>Operations:</strong> {iface.operations.length}</div>
                </div>
            </div>
            <h2 style={{ marginTop: 30, borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 10 }}>Operations</h2>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
                {iface.operations.map(op => (
                    <li
                        key={op.name}
                        onClick={() => onSelectOperation && onSelectOperation(op)}
                        style={{
                            padding: '12px 10px',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <div>
                            <span>{op.name}</span>
                            <span style={{ marginLeft: 10, fontSize: '0.85em', opacity: 0.6 }}>({op.requests.length} request{op.requests.length !== 1 ? 's' : ''})</span>
                        </div>
                        <ChevronLeft size={14} style={{ transform: 'rotate(180deg)', opacity: 0.3 }} />
                    </li>
                ))}
            </ul>
        </div>
    );
};

const TestSuiteSummary: React.FC<{ suite: import('@shared/models').SoapTestSuite; onSelectTestCase?: (c: import('@shared/models').SoapTestCase) => void }> = ({ suite, onSelectTestCase }) => {
    // Calculate total steps
    const totalSteps = suite.testCases.reduce((sum, tc) => sum + tc.steps.length, 0);

    return (
        <div style={{ padding: 40, color: 'var(--vscode-foreground)', overflowY: 'auto', flex: 1 }}>
            <h1>Test Suite: {suite.name}</h1>

            {/* Statistics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 20, marginTop: 30 }}>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Test Cases</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{suite.testCases.length}</span>
                </div>
                <div style={{ padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
                    <div style={{ fontSize: '0.85em', opacity: 0.7, marginBottom: 8 }}>Total Steps</div>
                    <span style={{ fontSize: '2em', fontWeight: 'bold' }}>{totalSteps}</span>
                </div>
            </div>

            <h2 style={{ marginTop: 40, borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 10 }}>Test Cases</h2>
            <ul style={{ listStyle: 'none', padding: 0, marginTop: 10 }}>
                {suite.testCases.map(tc => (
                    <li
                        key={tc.id}
                        onClick={() => onSelectTestCase && onSelectTestCase(tc)}
                        style={{
                            padding: '12px 10px',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--vscode-list-hoverBackground)'}
                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                        <div>
                            <span>{tc.name}</span>
                            <span style={{ marginLeft: 10, fontSize: '0.85em', opacity: 0.6 }}>({tc.steps.length} step{tc.steps.length !== 1 ? 's' : ''})</span>
                        </div>
                        <ChevronLeft size={14} style={{ transform: 'rotate(180deg)', opacity: 0.3 }} />
                    </li>
                ))}
            </ul>
        </div>
    );
};

const OperationSummary: React.FC<{ operation: import('@shared/models').SoapUIOperation; onSelectRequest?: (r: import('@shared/models').SoapUIRequest) => void }> = ({ operation, onSelectRequest }) => (
    <div style={{ padding: 40, color: 'var(--vscode-foreground)', overflowY: 'auto', flex: 1 }}>
        <h1>Operation: {operation.name}</h1>

        {/* Metadata */}
        <div style={{ marginTop: 20, padding: 20, background: 'var(--vscode-editor-inactiveSelectionBackground)', borderRadius: 6 }}>
            <div style={{ display: 'grid', gap: 12 }}>
                {operation.action && <div><strong>Action:</strong> <span style={{ fontFamily: 'monospace', fontSize: '0.9em' }}>{operation.action}</span></div>}
                <div><strong>Requests:</strong> {operation.requests.length}</div>
            </div>
        </div>

        <h2 style={{ marginTop: 30, borderBottom: '1px solid var(--vscode-panel-border)', paddingBottom: 10 }}>Requests</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 15, marginTop: 15 }}>
            {operation.requests.map(req => (
                <div
                    key={req.id}
                    onClick={() => onSelectRequest && onSelectRequest(req)}
                    style={{
                        padding: 15,
                        background: 'var(--vscode-list-hoverBackground)',
                        borderRadius: 6,
                        cursor: 'pointer',
                        border: '1px solid var(--vscode-panel-border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}
                >
                    <span style={{ fontWeight: '500' }}>{req.name}</span>
                    <ChevronLeft size={14} style={{ transform: 'rotate(180deg)', opacity: 0.5 }} />
                </div>
            ))}
        </div>
    </div>
);


export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    selectionState,
    requestActions,
    viewState,
    configState,
    stepActions,
    toolsActions,
    breakpointState,
    onUpdateSuite,
    onRunSuite,
    onStopRun: onStopPerformanceRun,
    onAddPerformanceRequest,
    onDeletePerformanceRequest,
    onSelectPerformanceRequest,
    onUpdatePerformanceRequest,
    onImportFromWorkspace,
    performanceProgress,
    performanceHistory,
    onBackToSuite,
    // Coordinator props
    coordinatorStatus,
    onStartCoordinator,
    onStopCoordinator,
    navigationActions
}) => {
    // Destructure groups
    const {
        project: selectedProject,
        interface: selectedInterface,
        operation: selectedOperation,
        request: selectedRequest,
        testCase: selectedTestCase,
        testSuite: selectedTestSuite,
        testStep: selectedStep,
        performanceSuite: selectedPerformanceSuite
    } = selectionState;

    const {
        onExecute,
        onCancel,
        onUpdate: rawOnUpdateRequest,
        onReset,
        response,
        loading
    } = requestActions;

    // Wrapper to add logging for debugging
    const onUpdateRequest = React.useCallback((updated: any) => {
        console.log('[WorkspaceLayout] onUpdateRequest called:', { requestName: updated?.name, requestId: updated?.id });
        rawOnUpdateRequest(updated);
    }, [rawOnUpdateRequest]);
    const {
        activeView, // Now available
        layoutMode, showLineNumbers, splitRatio, isResizing, onToggleLayout, onToggleLineNumbers, onStartResizing,
        inlineElementValues, onToggleInlineElementValues, hideCausalityData, onToggleHideCausalityData
    } = viewState;
    const { config, defaultEndpoint, changelog, onChangeEnvironment, isReadOnly } = configState;
    const {
        onRunTestCase, onOpenStepRequest, onBackToCase, onAddStep, testExecution,
        onUpdateStep, onSelectStep, onDeleteStep, onMoveStep
    } = stepActions;
    const {
        onAddExtractor, onEditExtractor, onAddAssertion, onAddExistenceAssertion, onAddReplaceRule, onAddMockRule, onOpenDevOps
    } = toolsActions;

    // Performance Actions extracted in props destructuring above



    const [alignAttributes, setAlignAttributes] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'request' | 'headers' | 'assertions' | 'auth' | 'extractors' | 'attachments'>('request');
    const [showVariables, setShowVariables] = React.useState(false);

    // Breakpoint State
    const [breakpointContent, setBreakpointContent] = React.useState<string>('');
    const [breakpointTimeRemaining, setBreakpointTimeRemaining] = React.useState<number>(0);

    // ... imports

    // Initialize breakpoint content when breakpoint becomes active - format the XML for readability
    React.useEffect(() => {
        if (breakpointState?.activeBreakpoint) {
            const rawContent = breakpointState.activeBreakpoint.content;
            // Format XML for user readability
            const formatted = rawContent.trim().startsWith('<')
                ? formatXml(rawContent, false, true)
                : rawContent;
            setBreakpointContent(formatted);
        }
    }, [breakpointState?.activeBreakpoint]);

    // Countdown timer for breakpoint
    React.useEffect(() => {
        if (!breakpointState?.activeBreakpoint) {
            setBreakpointTimeRemaining(0);
            return;
        }

        const updateTimer = () => {
            const elapsed = Date.now() - breakpointState.activeBreakpoint!.startTime;
            const remaining = Math.max(0, breakpointState.activeBreakpoint!.timeoutMs - elapsed);
            setBreakpointTimeRemaining(remaining);
        };

        updateTimer();
        const interval = setInterval(updateTimer, 1000);
        return () => clearInterval(interval);
    }, [breakpointState?.activeBreakpoint]);

    // Editor Refs for insertion
    const urlEditorRef = React.useRef<MonacoSingleLineInputHandle>(null);
    const bodyEditorRef = React.useRef<MonacoRequestEditorHandle>(null);
    const lastFocusedRef = React.useRef<MonacoSingleLineInputHandle | MonacoRequestEditorHandle | null>(null);
    const [selection, setSelection] = React.useState<{ text: string, offset: number } | null>(null);
    const [currentXPath, setCurrentXPath] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (selection && response?.rawResponse) {
            // Calculate XPath on selection change to determine button visibility
            const path = XPathGenerator.getPath(response.rawResponse, selection.offset);
            setCurrentXPath(path);
        } else {
            setCurrentXPath(null);
        }
    }, [selection, response]);

    // Reset selection when step changes or re-runs
    React.useEffect(() => {
        setSelection(null);
        setCurrentXPath(null);
        if (selectedStep?.config.request?.assertions) {
            console.log("WorkspaceLayout: Step Updated. Assertions:", selectedStep.config.request.assertions.length);
        }
    }, [selectedStep?.id, response, selectedStep?.config.request?.assertions]);

    const handleCreateExtractor = () => {
        if (!selection || !response || !onAddExtractor) return;

        let path: string | null = null;
        const source = 'body';

        if (response.rawResponse) {
            path = XPathGenerator.getPath(response.rawResponse, selection.offset);
        }

        if (path) {
            onAddExtractor({ xpath: path, value: selection.text, source });
        } else {
            console.warn("Could not determine XPath for selection");
        }
    };

    const handleCreateAssertion = () => {
        console.log("WorkspaceLayout: Match Clicked. XPath:", currentXPath, "Selection:", selection?.text);
        if (!selection || !response || !onAddAssertion || !currentXPath) {
            console.warn("WorkspaceLayout: Match aborted. Missing deps:", { hasSelection: !!selection, hasResponse: !!response, hasHandler: !!onAddAssertion, hasPath: !!currentXPath });
            return;
        }

        onAddAssertion({ xpath: currentXPath, expectedContent: selection.text });
        setActiveTab('assertions');
    };

    const handleCreateExistenceAssertion = () => {
        if (!selection || !response || !onAddExistenceAssertion || !currentXPath) return;

        onAddExistenceAssertion({ xpath: currentXPath });
        setActiveTab('assertions');
    };

    const handleCreateReplaceRule = (target: 'request' | 'response') => {
        if (!selection || !currentXPath || !onAddReplaceRule) return;

        onAddReplaceRule({ xpath: currentXPath, matchText: selection.text, target });
    };

    const handleCreateMockRule = () => {
        if (!selectedRequest || !response || !onAddMockRule) {
            console.warn('[WorkspaceLayout] handleCreateMockRule aborted: missing data or callback');
            return;
        }

        const newRule = createMockRuleFromSource({
            url: selectedRequest.endpoint || '',
            statusCode: response.status || 200,
            responseBody: response.rawResponse || '',
            responseHeaders: response.headers || {},
            // Include request body for SOAP operation name extraction
            requestBody: selectedRequest.request || ''
        });

        onAddMockRule(newRule);
    };
    // Reset active tab if it's assertions or extractors and we are in read-only mode (e.g. Watcher/Proxy)
    React.useEffect(() => {
        if (isReadOnly && (activeTab === 'assertions' || activeTab === 'extractors')) {
            setActiveTab('request');
        }
    }, [isReadOnly, activeTab]);

    // Breakpoint Overlay - takes over the entire workspace when active
    if (breakpointState?.activeBreakpoint) {
        return (
            <BreakpointOverlay
                breakpoint={breakpointState.activeBreakpoint}
                content={breakpointContent}
                onContentChange={setBreakpointContent}
                timeRemaining={breakpointTimeRemaining}
                onResolve={breakpointState.onResolve}
                config={config}
            />
        );
    }

    // FORCE HOME VIEW if active
    if (activeView === SidebarView.HOME) {
        return <WelcomePanel changelog={changelog} />;
    }

    // PERFORMANCE VIEW
    if (activeView === SidebarView.PERFORMANCE) {
        if (!selectedRequest) {
            if (selectedPerformanceSuite) {
                return (
                    <PerformanceSuiteEditor
                        suite={selectedPerformanceSuite}
                        onUpdate={onUpdateSuite!}
                        onRun={onRunSuite!}
                        onStop={onStopPerformanceRun!}
                        isRunning={!!performanceProgress}
                        progress={performanceProgress}
                        history={performanceHistory?.filter(r => r.suiteId === selectedPerformanceSuite.id) || []}
                        onAddRequest={onAddPerformanceRequest}
                        onDeleteRequest={onDeletePerformanceRequest}
                        onSelectRequest={onSelectPerformanceRequest}
                        onUpdateRequest={onUpdatePerformanceRequest}
                        onImportFromWorkspace={onImportFromWorkspace}
                        coordinatorStatus={coordinatorStatus}
                        onStartCoordinator={onStartCoordinator}
                        onStopCoordinator={onStopCoordinator}
                    />
                );
            }
            return <EmptyState title="No Performance Suite Selected" message="Select a suite from the sidebar or create a new one." image={emptyPerformanceImg} />;
        }
    }

    // TESTS VIEW
    if (activeView === SidebarView.TESTS) {
        if (selectedTestSuite && !selectedTestCase) {
            return <TestSuiteSummary suite={selectedTestSuite} onSelectTestCase={navigationActions?.onSelectTestCase} />;
        }

        if (selectedStep && selectedStep.type === 'delay' && !isReadOnly && onUpdateStep) {
            return (
                <Content>
                    <Toolbar>
                        {onBackToCase && (
                            <ToolbarButton onClick={onBackToCase} title="Back to Test Case">
                                <ChevronLeft size={14} /> Back
                            </ToolbarButton>
                        )}
                        <span style={{ fontWeight: 'bold', marginLeft: 10 }}>Delay Configuration</span>
                    </Toolbar>
                    <div style={{ padding: 20, color: 'var(--vscode-editor-foreground)', fontFamily: 'var(--vscode-font-family)' }}>
                        <h2>Step: {selectedStep.name}</h2>
                        <div style={{ marginTop: 20 }}>
                            <label style={{ display: 'block', marginBottom: 5 }}>Delay Duration (milliseconds):</label>
                            <input
                                type="number"
                                style={{
                                    background: 'var(--vscode-input-background)',
                                    color: 'var(--vscode-input-foreground)',
                                    border: '1px solid var(--vscode-input-border)',
                                    padding: '5px',
                                    fontSize: '1em',
                                    width: '100px'
                                }}
                                value={selectedStep.config.delayMs || 0}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    onUpdateStep({ ...selectedStep, config: { ...selectedStep.config, delayMs: val } });
                                }}
                            />
                        </div>
                    </div>
                </Content>
            );
        }

        if (selectedTestCase && !selectedStep) {
            return (
                <TestCaseView
                    testCase={selectedTestCase}
                    testExecution={testExecution}
                    onRunTestCase={onRunTestCase}
                    onAddStep={onAddStep}
                    onSelectStep={onSelectStep}
                    onMoveStep={onMoveStep}
                    onDeleteStep={onDeleteStep}
                    onOpenStepRequest={onOpenStepRequest}
                />
            );
        }

        if (!selectedTestCase) {
            return <EmptyTestCase />;
        }
    }

    // PROJECTS VIEW
    if (activeView === SidebarView.PROJECTS) {
        if (!selectedRequest) {
            if (selectedOperation) return <OperationSummary operation={selectedOperation} onSelectRequest={navigationActions?.onSelectRequest} />;
            if (selectedInterface) return <InterfaceSummary interface={selectedInterface} onSelectOperation={navigationActions?.onSelectOperation} />;
            if (selectedProject) return <ProjectSummary project={selectedProject} onSelectInterface={navigationActions?.onSelectInterface} />;
            return <EmptyState title="No Project Selected" message="Select a project, interface, or operation to view details." image={emptyProjectImg} />;
        }
        // If request IS selected, fall through to Request Editor
    }

    // EXPLORER VIEW
    if (activeView === SidebarView.EXPLORER) {
        // If a request is selected, fall through to main render
        if (!selectedRequest) {
            return <EmptyWsdlExplorer />;
        }
    }

    // WATCHER VIEW
    if (activeView === SidebarView.WATCHER) {
        // If an event is selected (it's a request), it will have been handled by selectedRequest above?
        // Wait, selectedRequest handles everything. If we are here, it means !selectedRequest.
        if (!selectedRequest) {
            return <EmptyFileWatcher />;
        }
    }

    // SERVER VIEW
    if (activeView === SidebarView.SERVER) {
        // If a request is selected (from Proxy/Mock history), it falls through to main render
        if (!selectedRequest) {
            return <EmptyServer />;
        }
    }

    // Fallback for other views that usually show Welcome if no request selected
    if (!selectedRequest) {
        if (selectedStep && selectedStep.type === 'script' && onUpdateStep) {
            return (
                <ScriptEditor
                    step={selectedStep}
                    onUpdate={onUpdateStep}
                    isReadOnly={isReadOnly}
                    onBack={onBackToCase}
                />
            );
        }
        return <WelcomePanel changelog={changelog} />;
    }

    return (
        <Content>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                {/* Toolbar */}
                {isReadOnly && selectedRequest.endpoint && (
                    <InfoBar>
                        <InfoBarMethod>{selectedRequest.method || 'POST'}</InfoBarMethod>
                        <InfoBarUrl title={selectedRequest.endpoint}>{selectedRequest.endpoint}</InfoBarUrl>
                    </InfoBar>
                )}
                {!isReadOnly && (
                    <Toolbar>
                        {selectedTestCase && onBackToCase && (
                            <>
                                <ToolbarButton onClick={onBackToCase} title="Back to Test Case">
                                    <ChevronLeft size={14} /> Back
                                </ToolbarButton>
                                <div style={{ width: 1, height: 20, background: 'var(--vscode-panel-border)', margin: '0 5px' }} />
                            </>
                        )}

                        {!selectedTestCase && selectedPerformanceSuite && onBackToSuite && (
                            <>
                                <ToolbarButton onClick={onBackToSuite} title="Back to Performance Suite">
                                    <ChevronLeft size={14} /> Back
                                </ToolbarButton>
                                <div style={{ width: 1, height: 20, background: 'var(--vscode-panel-border)', margin: '0 5px' }} />
                            </>
                        )}

                        {/* Method */}
                        <ToolbarSelect
                            value={selectedRequest.method || 'POST'}
                            onChange={(e) => onUpdateRequest({ ...selectedRequest, method: e.target.value })}
                            title="HTTP Method"
                        >
                            <option value="POST">POST</option>
                            <option value="GET">GET</option>
                        </ToolbarSelect>


                        {/* URL */}
                        <div style={{ flex: 1, minWidth: '150px' }}>
                            <MonacoSingleLineInput
                                ref={urlEditorRef}
                                value={selectedRequest.endpoint || defaultEndpoint || ''}
                                onChange={(val) => onUpdateRequest({ ...selectedRequest, endpoint: val })}
                                placeholder="Endpoint URL"
                                onFocus={() => lastFocusedRef.current = urlEditorRef.current}
                            />
                        </div>

                        {/* Content Type */}
                        <ToolbarSelect
                            value={selectedRequest.contentType || 'application/soap+xml'}
                            onChange={(e) => onUpdateRequest({ ...selectedRequest, contentType: e.target.value })}
                            title="Content Type"
                        >
                            <option value="text/xml">text/xml</option>
                            <option value="application/soap+xml">application/soap+xml</option>
                            <option value="application/xml">application/xml</option>
                        </ToolbarSelect>

                        {/* Actions */}
                        {!selectedTestCase && (
                            <IconButton onClick={onReset} title="Revert to Default XML">
                                <RotateCcw size={16} />
                            </IconButton>
                        )}

                        {loading ? (
                            <ToolbarButton onClick={onCancel} style={{ backgroundColor: 'var(--vscode-errorForeground)' }}>
                                <Loader2 size={14} className="spin" /> Cancel
                            </ToolbarButton>
                        ) : (
                            <ToolbarButton onClick={() => onExecute(selectedRequest.request)} title="Run Request" style={{ color: 'var(--vscode-testing-iconPassed)' }}>
                                <Play size={14} /> Run
                            </ToolbarButton>
                        )}

                        <div style={{ width: 1, height: 20, background: 'var(--vscode-panel-border)', margin: '0 5px' }} />

                        {/* Environment Selector */}
                        {config && config.environments && (
                            <ToolbarSelect
                                value={config.activeEnvironment}
                                onChange={(e) => onChangeEnvironment && onChangeEnvironment(e.target.value)}
                                title="Active Environment"
                                style={{ minWidth: 100 }}
                            >
                                {Object.keys(config.environments).map(env => (
                                    <option key={env} value={env}>{env}</option>
                                ))}
                            </ToolbarSelect>
                        )}

                        {/* Variables Inserter */}
                        {selectedTestCase && selectedStep && (
                            <div style={{ position: 'relative' }}>
                                <ToolbarButton onClick={() => setShowVariables(!showVariables)} title="Insert/View Variables from Previous Steps">
                                    <Braces size={14} />
                                    <span style={{ marginLeft: 5 }}>Variables</span>
                                </ToolbarButton>
                                {showVariables && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '100%',
                                        right: 0,
                                        marginTop: 5,
                                        background: 'var(--vscode-editor-background)',
                                        border: '1px solid var(--vscode-dropdown-border)',
                                        borderRadius: 3,
                                        zIndex: 100,
                                        boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                                        minWidth: 250,
                                        maxHeight: 300,
                                        overflow: 'auto'
                                    }}>
                                        <div style={{ padding: '8px', borderBottom: '1px solid var(--vscode-dropdown-border)', fontWeight: 'bold', fontSize: '0.9em' }}>
                                            Available Context Variables
                                        </div>
                                        {(() => {
                                            const idx = selectedTestCase.steps.findIndex(s => s.id === selectedStep.id);
                                            const vars: { name: string, step: string }[] = [];
                                            if (idx > 0) {
                                                selectedTestCase.steps.slice(0, idx).forEach(s => {
                                                    if (s.type === 'request' && s.config.request?.extractors) {
                                                        s.config.request.extractors.forEach(e => {
                                                            vars.push({ name: e.variable, step: s.name });
                                                        });
                                                    }
                                                });
                                            }

                                            if (vars.length === 0) {
                                                return <div style={{ padding: 10, opacity: 0.7, fontSize: '0.9em' }}>No variables defined in previous steps.</div>
                                            }

                                            return vars.map((v, i) => (
                                                <div
                                                    key={i}
                                                    style={{
                                                        padding: '6px 10px',
                                                        cursor: 'pointer',
                                                        borderBottom: '1px solid var(--vscode-panel-border)',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        gap: 2
                                                    }}
                                                    onClick={() => {
                                                        const target = lastFocusedRef.current || bodyEditorRef.current; // Default to body
                                                        if (target) {
                                                            target.insertText('${#TestCase#' + v.name + '}');
                                                        }
                                                        setShowVariables(false);
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'var(--vscode-list-hoverBackground)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    title="Click to Insert"
                                                >
                                                    <div style={{ fontWeight: 'bold', color: 'var(--vscode-textLink-foreground)' }}>{v.name}</div>
                                                    <div style={{ fontSize: '0.8em', opacity: 0.7 }}>from {v.step}</div>
                                                </div>
                                            ));
                                        })()}
                                    </div>
                                )}
                            </div>
                        )}
                    </Toolbar>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: layoutMode === 'vertical' ? 'column' : 'row', overflow: 'hidden' }}>
                    <div style={{
                        flex: (response || loading) ? `0 0 ${splitRatio * 100}% ` : '1 1 auto',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        height: 'auto',
                        width: 'auto'
                    }}>
                        {/* Title Section (Moved above tabs) */}
                        <div style={{
                            padding: '10px 15px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 5
                        }}>
                            <div style={{ fontSize: '1.2em', fontWeight: 'bold' }}>{selectedOperation?.name}</div>
                            <div style={{ fontSize: '0.9em', opacity: 0.7 }}>{selectedRequest.name}</div>
                        </div>

                        {/* Tabs Header */}
                        <div style={{
                            padding: '0 10px',
                            backgroundColor: 'var(--vscode-editor-background)',
                            borderBottom: '1px solid var(--vscode-panel-border)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 20,
                            flexShrink: 0,
                            height: 35
                        }}>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'request' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'request' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('request')}
                            >
                                Body
                            </div>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'headers' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'headers' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('headers')}
                            >
                                Headers
                                {selectedRequest.headers && Object.keys(selectedRequest.headers).length > 0 && ` (${Object.keys(selectedRequest.headers).length})`}
                            </div>

                            {!isReadOnly && (
                                <>
                                    <div
                                        style={{
                                            cursor: 'pointer',
                                            borderBottom: activeTab === 'assertions' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                            padding: '5px 0',
                                            color: activeTab === 'assertions' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                        }}
                                        onClick={() => setActiveTab('assertions')}
                                    >
                                        Assertions
                                        {selectedRequest.assertions && selectedRequest.assertions.length > 0 && ` (${selectedRequest.assertions.length})`}
                                        {response && response.assertionResults && (
                                            <span style={{ marginLeft: 5, fontSize: '0.8em' }}>
                                                {response.assertionResults.every((r: any) => r.status === 'PASS') ? '✔' : '❌'}
                                            </span>
                                        )}
                                    </div>
                                    <div
                                        style={{
                                            cursor: 'pointer',
                                            borderBottom: activeTab === 'extractors' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                            padding: '5px 0',
                                            color: activeTab === 'extractors' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                        }}
                                        onClick={() => setActiveTab('extractors')}
                                    >
                                        Extractors
                                        {selectedRequest.extractors && selectedRequest.extractors.length > 0 && ` (${selectedRequest.extractors.length})`}
                                    </div>
                                </>
                            )}
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'auth' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'auth' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('auth')}
                            >
                                Auth
                                {selectedRequest.wsSecurity && selectedRequest.wsSecurity.type !== 'none' && ' ✓'}
                            </div>
                            <div
                                style={{
                                    cursor: 'pointer',
                                    borderBottom: activeTab === 'attachments' ? '2px solid var(--vscode-textLink-foreground)' : '2px solid transparent',
                                    padding: '5px 0',
                                    color: activeTab === 'attachments' ? 'var(--vscode-foreground)' : 'var(--vscode-descriptionForeground)'
                                }}
                                onClick={() => setActiveTab('attachments')}
                            >
                                Attachments
                                {selectedRequest.attachments && selectedRequest.attachments.length > 0 && ` (${selectedRequest.attachments.length})`}
                            </div>

                            <div style={{ marginLeft: 'auto', display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.9em' }}>
                                {/* Formatting Toggles */}
                                <IconButton onClick={() => {
                                    const newValue = !alignAttributes;
                                    setAlignAttributes(newValue);
                                    if (selectedRequest.request) {
                                        onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, newValue, inlineElementValues) });
                                    }
                                }} active={alignAttributes} title="Toggle Attribute Alignment" style={{ width: 24, height: 24, padding: 2 }}>
                                    <WrapText size={14} />
                                </IconButton>

                                {onToggleInlineElementValues && (
                                    <IconButton
                                        title={inlineElementValues ? "Format: Inline Values (Compact)" : "Format: Block Values (Expanded)"}
                                        onClick={() => {
                                            if (onToggleInlineElementValues) onToggleInlineElementValues();
                                            const nextVal = !inlineElementValues;
                                            if (selectedRequest.request) {
                                                onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, alignAttributes, nextVal) });
                                            }
                                        }}
                                        active={inlineElementValues}
                                        style={{ width: 24, height: 24, padding: 2 }}
                                    >
                                        <AlignLeft size={14} />
                                    </IconButton>
                                )}
                                {onToggleHideCausalityData && (
                                    <IconButton
                                        title={hideCausalityData ? "Show Debugger Causality Data" : "Hide Debugger Causality Data"}
                                        onClick={onToggleHideCausalityData}
                                        active={hideCausalityData}
                                        style={{ width: 24, height: 24, padding: 2 }}
                                    >
                                        <Bug size={14} />
                                    </IconButton>
                                )}
                                <IconButton
                                    title="Format XML Now"
                                    onClick={() => {
                                        const formatted = formatXml(selectedRequest.request, alignAttributes, inlineElementValues);
                                        onUpdateRequest({ ...selectedRequest, request: formatted });
                                    }}
                                    style={{ width: 24, height: 24, padding: 2 }}
                                >
                                    <Braces size={14} />
                                </IconButton>

                                {onOpenDevOps && config?.azureDevOps?.project && (
                                    <IconButton
                                        title="Add to Azure DevOps"
                                        onClick={onOpenDevOps}
                                        style={{ width: 24, height: 24, padding: 2 }}
                                    >
                                        <Cloud size={14} />
                                    </IconButton>
                                )}

                                {isReadOnly && onAddMockRule && (
                                    <IconButton
                                        title="Import to Mock Rule"
                                        onClick={handleCreateMockRule}
                                        style={{ width: 24, height: 24, padding: 2, color: 'var(--vscode-charts-orange)' }}
                                    >
                                        <PlusSquare size={14} />
                                    </IconButton>
                                )}

                                <div style={{ width: 1, height: 16, background: 'var(--vscode-panel-border)', margin: '0 5px' }} />

                                <span style={{ opacity: 0.8 }}>Lines: {typeof selectedRequest.request === 'string' ? selectedRequest.request.split('\n').length : 0}</span>
                                <span style={{ opacity: 0.8 }}>Size: {typeof selectedRequest.request === 'string' ? (selectedRequest.request.length / 1024).toFixed(2) : 0} KB</span>
                            </div>
                        </div>

                        {activeTab === 'request' && (
                            <div style={{
                                position: 'relative',
                                flex: 1,
                                width: '100%',
                                height: '100%',
                                overflow: 'hidden'
                            }}>
                                <MonacoRequestEditor
                                    ref={bodyEditorRef}
                                    value={hideCausalityData ? stripCausalityData(selectedRequest.request) : selectedRequest.request}
                                    language="xml"
                                    readOnly={isReadOnly}
                                    onChange={(val) => onUpdateRequest({ ...selectedRequest, request: val })}
                                    onFocus={() => lastFocusedRef.current = bodyEditorRef.current}
                                    autoFoldElements={config?.ui?.autoFoldElements}
                                    requestId={selectedRequest.id || selectedRequest.name}
                                />
                                {/* Format Button Overlay */}

                            </div>
                        )}
                        {activeTab === 'headers' && (
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                                <div style={{ flex: 1, overflow: 'hidden', padding: isReadOnly ? '10px' : '0' }}>
                                    {!isReadOnly ? (
                                        <HeadersPanel
                                            headers={selectedRequest.headers || {}}
                                            onChange={(newHeaders) => onUpdateRequest({ ...selectedRequest, headers: newHeaders })}
                                            contentType={selectedRequest.contentType}
                                        />
                                    ) : (
                                        <div style={{ overflow: 'auto', height: '100%', backgroundColor: 'var(--vscode-editor-background)' }}>
                                            <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: '1em' }}>Request Headers</h3>
                                            {selectedRequest.headers && Object.keys(selectedRequest.headers).length > 0 ? (
                                                Object.entries(selectedRequest.headers).map(([key, value]) => (
                                                    <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 5, fontSize: '0.9em' }}>
                                                        <div style={{ fontWeight: 'bold', minWidth: 150, color: 'var(--vscode-textLink-foreground)' }}>{key}:</div>
                                                        <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{String(value)}</div>
                                                    </div>
                                                ))
                                            ) : (
                                                <div style={{ fontStyle: 'italic', opacity: 0.7 }}>No headers captured.</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {response && response.headers && (
                                    <div style={{
                                        flex: 1,
                                        borderTop: '1px solid var(--vscode-panel-border)',
                                        padding: 10,
                                        overflow: 'auto',
                                        backgroundColor: 'var(--vscode-editor-background)'
                                    }}>
                                        <h3 style={{ marginTop: 0, marginBottom: 10, fontSize: '1em' }}>Response Headers</h3>
                                        {Object.entries(response.headers).map(([key, value]) => (
                                            <div key={key} style={{ display: 'flex', gap: 10, marginBottom: 5, fontSize: '0.9em' }}>
                                                <div style={{ fontWeight: 'bold', minWidth: 150, color: 'var(--vscode-textLink-foreground)' }}>{key}:</div>
                                                <div style={{ wordBreak: 'break-all', fontFamily: 'monospace' }}>{String(value)}</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                        {activeTab === 'assertions' && (
                            <AssertionsPanel
                                assertions={selectedRequest.assertions || []}
                                onChange={(newAssertions) => onUpdateRequest({ ...selectedRequest, assertions: newAssertions })}
                                lastResult={response?.assertionResults}
                            />
                        )}
                        {activeTab === 'extractors' && (
                            <ExtractorsPanel
                                extractors={selectedRequest.extractors || []}
                                onChange={(newExtractors) => onUpdateRequest({ ...selectedRequest, extractors: newExtractors })}
                                onEdit={onEditExtractor}
                                rawResponse={response?.rawResponse}
                            />
                        )}
                        {activeTab === 'auth' && (
                            <SecurityPanel
                                security={selectedRequest.wsSecurity}
                                onChange={(newSecurity) => onUpdateRequest({ ...selectedRequest, wsSecurity: newSecurity })}
                            />
                        )}
                        {activeTab === 'attachments' && (
                            <AttachmentsPanel
                                attachments={selectedRequest.attachments || []}
                                onChange={(newAttachments) => onUpdateRequest({ ...selectedRequest, attachments: newAttachments })}
                            />
                        )}
                    </div>

                    {/* Resizer */}
                    {(response || loading) && (
                        <div
                            onMouseDown={onStartResizing}
                            style={{
                                width: layoutMode === 'horizontal' ? 5 : '100%',
                                height: layoutMode === 'vertical' ? 5 : '100%',
                                cursor: layoutMode === 'horizontal' ? 'col-resize' : 'row-resize',
                                backgroundColor: isResizing ? 'var(--vscode-focusBorder)' : 'var(--vscode-widget-shadow)',
                                zIndex: 10,
                                flex: '0 0 auto',
                                transition: 'background-color 0.2s'
                            }}
                        />
                    )}

                    {/* Response Section */}
                    {(response || loading) && (
                        <div style={{
                            flex: 1,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            borderLeft: layoutMode === 'horizontal' ? '1px solid var(--vscode-panel-border)' : 'none',
                            borderTop: layoutMode === 'vertical' ? '1px solid var(--vscode-panel-border)' : 'none',
                        }}>
                            <div style={{
                                padding: '5px 10px',
                                backgroundColor: 'var(--vscode-editor-background)',
                                borderBottom: '1px solid var(--vscode-panel-border)',
                                fontWeight: 'bold',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexShrink: 0
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                    <span>Response</span>
                                    {selection && onAddExtractor && !isReadOnly && currentXPath && (
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            {selection.text && (
                                                <>
                                                    <ToolbarButton onClick={handleCreateExtractor} style={{ fontSize: '0.8em', padding: '0 8px', height: 20 }}>
                                                        <Bug size={12} style={{ marginRight: 4 }} /> Extract
                                                    </ToolbarButton>
                                                    {onAddAssertion && (
                                                        <ToolbarButton onClick={handleCreateAssertion} style={{ fontSize: '0.8em', padding: '0 8px', height: 20 }}>
                                                            <Braces size={12} style={{ marginRight: 4 }} /> Match
                                                        </ToolbarButton>
                                                    )}
                                                </>
                                            )}
                                            {onAddExistenceAssertion && (
                                                <ToolbarButton onClick={handleCreateExistenceAssertion} style={{ fontSize: '0.8em', padding: '0 8px', height: 20 }}>
                                                    <ListChecks size={12} style={{ marginRight: 4 }} /> Exists
                                                </ToolbarButton>
                                            )}
                                        </div>
                                    )}
                                    {/* Replace Rule button for Proxy view */}
                                    {selection && selection.text && isReadOnly && onAddReplaceRule && currentXPath && (
                                        <ToolbarButton
                                            onClick={() => handleCreateReplaceRule('response')}
                                            style={{ fontSize: '0.8em', padding: '0 8px', height: 20 }}
                                            title="Create a replace rule for this selection"
                                        >
                                            <Replace size={12} style={{ marginRight: 4 }} /> Add Replace Rule
                                        </ToolbarButton>
                                    )}
                                </div>
                                {response && !isReadOnly && (
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '15px', alignItems: 'center' }}>
                                        {/* ... stats ... */}
                                        <span style={{ opacity: 0.8 }}>Lines: {response.lineCount || 0}</span>
                                        <span style={{ opacity: 0.8 }}>Time: {(response.duration || 0).toFixed(1)}s</span>
                                        <span style={{ opacity: 0.8 }}>Size: {typeof response.rawResponse === 'string' ? (response.rawResponse.length / 1024).toFixed(2) : 0} KB</span>
                                        {response.headers && response.headers['content-type'] && (
                                            <span title="Content-Type" style={{ opacity: 0.8, borderLeft: '1px solid var(--vscode-panel-border)', paddingLeft: '10px' }}>
                                                {response.headers['content-type'].split(';')[0]}
                                            </span>
                                        )}
                                        <span style={{
                                            color: response.success ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)',
                                            marginLeft: 10
                                        }}>
                                            {response.success ? '200 OK' : 'Error'}
                                        </span>
                                    </div>
                                )}
                            </div>
                            <MonacoResponseViewer
                                value={response ? (response.rawResponse ? formatXml(response.rawResponse, alignAttributes, inlineElementValues) : (response.error || '')) : ''}
                                showLineNumbers={showLineNumbers}
                                onSelectionChange={setSelection}
                                autoFoldElements={config?.ui?.autoFoldElements}
                            />
                        </div>
                    )}
                </div>
            </div >

            <MainFooter>
                <IconButton onClick={onToggleLineNumbers} active={showLineNumbers} title="Toggle Line Numbers">
                    <ListOrdered size={16} />
                </IconButton>

                <IconButton onClick={onToggleLayout} title="Toggle Layout (Vertical/Horizontal)">
                    <LayoutIcon size={16} />
                </IconButton>
            </MainFooter>
        </Content >
    );
};

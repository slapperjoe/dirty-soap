import React, { Suspense } from 'react';
import { Play, ChevronLeft, GitBranch } from 'lucide-react';
// Models imported via props.ts indirections, specific enums kept if needed locally (TestStepType is used in code?)
// Checking code: TestStepType is used in props interface but not local var?
// Actually TestStepType is used in onAddStep signature but onAddStep comes from props.
// Let's remove them and add back if needed.
import { SidebarView, RequestType, BodyType, HttpMethod, WorkflowStep, ApiRequest, TestStep } from '@shared/models';
import { bridge } from '../utils/bridge';
import { CustomXPathEvaluator } from '../utils/xpathEvaluator';
import { XPathGenerator } from '../utils/xpathGenerator';
import { useMobileLayout } from '../hooks/useMobileLayout';

import { ErrorBoundary, formatXml, stripCausalityData, formatContent, formatJson, validateUrl, validateJson, validateXml } from '@apinox/request-editor/core';
import { RequestWorkspace, MonacoRequestEditorWithToolbar as MonacoRequestEditor, MonacoResponseViewer, MonacoSingleLineInput, AssertionsPanel, HeadersPanel, SecurityPanel, AttachmentsPanel, ExtractorsPanel, VariablesPanel, QueryParamsPanel, RestAuthPanel, GraphQLVariablesPanel, ScriptEditor } from '@apinox/request-editor/monaco';
import type { ApiRequest as PackageApiRequest, ExecutionResponse as PackageExecutionResponse, Variable as PackageVariable, MonacoRequestEditorHandle, MonacoSingleLineInputHandle } from '@apinox/request-editor/monaco';
import { WelcomePanel, TestCaseView, EmptyTestCase } from './workspace';
import { WorkflowSummary } from './workspace/WorkflowSummary';
import { WorkflowEditor } from './workspace/WorkflowEditor';
import { DelayStepEditor } from './workspace/DelayStepEditor';
import { ConditionStepEditor } from './workspace/ConditionStepEditor';
import { LoopStepEditor } from './workspace/LoopStepEditor';
import { ScriptStepEditor } from './workspace/ScriptStepEditor';
import { EmptyHistory } from './workspace/EmptyStates';
import { EmptyState } from './common/EmptyState';
import { TestSuiteSummary } from './workspace/TestSuiteSummary';
import { PerformanceSuiteEditor } from './workspace/PerformanceSuiteEditor';
import { findPathToRequest } from '../utils/projectUtils';
import { useWorkspace } from '../contexts/WorkspaceContext';

const ProxyPanel = React.lazy(() =>
    import('./proxy/ProxyPanel').then(module => ({ default: module.ProxyPanel }))
);
const RulesAndMockPage = React.lazy(() =>
    import('./proxy/RulesAndMockPage').then(module => ({ default: module.RulesAndMockPage }))
);
const FileWatcherPage = React.lazy(() =>
    import('./proxy/FileWatcherPage').then(module => ({ default: module.FileWatcherPage }))
);

/**
 * Get Content-Type header based on body type
 * Mirrors backend logic in HttpClient.ts
 */
function getContentTypeForBodyType(bodyType: BodyType): string {
    switch (bodyType) {
        case 'json':
            return 'application/json';
        case 'xml':
            return 'application/xml';
        case 'graphql':
            return 'application/json';
        case 'text':
            return 'text/plain';
        case 'form-data':
            return 'multipart/form-data';
        case 'none':
            return '';
        default:
            return 'application/json';
    }
}

import {
    Toolbar, InfoBarMethod,
    ToolbarButton, MainFooter, IconButton, ToolbarSeparator,
    Content,
    DelayTitle,
    DelayContent,
    DelayField,
    DelayLabel,
    DelayInput,
    WorkspaceBody,
    ToolbarInfo,
    InfoBarUrlPrimary,
    UrlInputWrapper,
    CancelButton,
    RunButton,
    VariablesWrapper,
    VariablesLabel,
    VariablesDropdown,
    VariablesDropdownHeader,
    VariablesDropdownEmpty,
    VariablesDropdownItem,
    VariablesDropdownName,
    VariablesDropdownSource,
    EditorSplitContainer,
    RequestPane,
    BreadcrumbBar,
    BreadcrumbActive,
    TabsHeader,
    TabButton,
    TabMeta,
    TabsRight,
    CompactIconButton,
    CompactIconButtonWarning,
    Divider,
    StatText,
    RequestEditorWrapper,
    PanelColumn,
    PanelBody,
    HeadersViewer,
    HeadersTitle,
    HeadersRow,
    HeadersKey,
    HeadersValue,
    HeadersEmpty,
    ResponseHeadersContainer,
    SplitResizer,
    ResponseSection,
    ResponseHeader,
    ResponseHeaderLeft,
    ResponseHeaderActions,
    ResponseStats,
    ResponseContentType,
    ResponseStatus,
    MiniToolbarButton,
    MiniButtonIcon,
    EditorSettingsMenu,
    MenuSection,
    MenuSectionTitle,
    MenuRow,
    MenuLabel,
    MenuControls,
    FontSizeDisplay,
    MenuIconButton,
    SettingsMenuWrapper
} from '../styles/WorkspaceLayout.styles';

/**
 * WorkspaceLayout - Main workspace component for editing requests, tests, and workflows
 * 
 * Uses useWorkspace() hook to access all state instead of receiving props.
 * This eliminates the need for ~140 lines of prop passing from MainContent.
 */
export const WorkspaceLayout: React.FC = () => {
    // Consume workspace context - replaces all prop groups
    const workspace = useWorkspace();

    // Destructure all needed state from context
    const {
        // PROJECT STATE
        projects,
        dirtyProjects,
        selectedProjectName,
        setProjects,
        
        // SELECTION STATE - Interface/Operation/Request
        selectedInterface,
        selectedOperation,
        selectedRequest,
        
        // SELECTION STATE - Test Cases
        selectedTestSuite,
        selectedTestCase,
        selectedTestStep: selectedStep,  // Alias for backward compatibility
        
        // SELECTION STATE - Workflows
        selectedWorkflowStep,
        
        // SELECTION STATE - Performance
        selectedPerformanceSuiteId,
        performanceHistory,
        performanceProgress,
        coordinatorStatus,
        
        // REQUEST/RESPONSE STATE
        response,
        loading,
        
        // UI STATE - Layout & Editor
        layoutMode,
        showLineNumbers,
        splitRatio,
        isResizing,
        
        // CONFIG STATE
        config,
        defaultEndpoint,
        isReadOnly: isHistoryMode,
        backendConnected
    } = workspace;

    // Get selected project from projects array
    const selectedProject = React.useMemo(() => {
        return projects.find(p => p.name === selectedProjectName) || null;
    }, [projects, selectedProjectName]);

    // Map context actions to existing variable names for minimal disruption
    const onExecute = workspace.executeRequest;
    const onCancel = workspace.cancelRequest;
    const rawOnUpdateRequest = workspace.updateRequest;
    const onReset = workspace.resetRequest;
    const onToggleLayout = workspace.toggleLayout;
    const onToggleLineNumbers = workspace.toggleLineNumbers;
    const onStartResizing = workspace.setIsResizing;
    const activeView = workspace.activeView;
    const inlineElementValues = workspace.inlineElementValues;
    const onToggleInlineElementValues = workspace.setInlineElementValues;
    const hideCausalityData = workspace.hideCausalityData;
    const onToggleHideCausalityData = workspace.setHideCausalityData;
    
    // Navigation actions (for backward compatibility)
    const navigationActions = {
        onSelectInterface: workspace.selectInterface,
        onSelectOperation: workspace.selectOperation,
        onSelectRequest: workspace.selectRequest,
        onSelectTestCase: workspace.selectTestCase,
        onSelectWorkflowStep: workspace.selectWorkflowStep
    };
    
    // Test runner actions
    const testExecution = workspace.testExecution;
    const onAddAssertion = workspace.handleAddAssertion;
    const onRunTestCase = workspace.handleRunTestCase;
    const onRunTestSuite = workspace.handleRunTestSuite;
    const onAddExtractor = workspace.handleAddExtractor;
    const onAddExistenceAssertion = workspace.handleAddExistenceAssertion;
    const onImportFromWorkspace = workspace.onImportFromWorkspace;
    const onUpdateStep = workspace.updateTestStep;
    const onSelectStep = workspace.selectTestStep;
    const onDeleteStep = workspace.deleteTestStep;
    const onMoveStep = workspace.moveTestStep;
    const onAddStep = workspace.addTestStep;
    const onBackToCase = workspace.backToTestCase;
    const onOpenStepRequest = workspace.openStepRequest;
    
    // Performance actions
    const onAddPerformanceSuite = workspace.handleAddPerformanceSuite;
    const onDeletePerformanceSuite = workspace.handleDeletePerformanceSuite;
    const onAddPerformanceRequest = workspace.handleAddPerformanceRequest;
    const onDeletePerformanceRequest = workspace.handleDeletePerformanceRequest;
    const onUpdatePerformanceRequest = workspace.handleUpdatePerformanceRequest;
    const onSelectPerformanceRequest = workspace.handleSelectPerformanceRequest;
    const onRunPerformanceSuite = workspace.handleRunPerformanceSuite;
    const onStopPerformanceRun = workspace.handleStopPerformanceRun;
    const onSelectPerformanceSuite = workspace.handleSelectPerformanceSuite;
    const onUpdateSuite = workspace.handleUpdatePerformanceSuite;
    const onStartCoordinator = workspace.handleStartCoordinator;
    const onStopCoordinator = workspace.handleStopCoordinator;
    const onRunSuite = workspace.handleRunPerformanceSuite;
    const onStopRun = workspace.handleStopPerformanceRun;
    
    // Calculate selectedPerformanceSuite from config (similar to MainContent)
    const selectedPerformanceSuite = React.useMemo(() => {
        return config?.performanceSuites?.find((s: any) => s.id === selectedPerformanceSuiteId) || null;
    }, [config, selectedPerformanceSuiteId]);
    
    // Mobile layout hook
    const { isMobile } = useMobileLayout();

    // For WORKFLOWS view, create a request object from the workflow step
    // We use a single "activeRequest" variable throughout the component
    let activeRequest = selectedRequest;
    if (activeView === SidebarView.WORKFLOWS && selectedWorkflowStep && selectedWorkflowStep.step && !activeRequest) {
        const step = selectedWorkflowStep.step;
        
        // Create a complete ApiRequest object from the workflow step with ALL defaults
        activeRequest = {
            id: step.id || `workflow-step-${step.name}`,
            name: step.name || 'Unnamed Step',
            endpoint: step.endpoint || '',
            request: step.requestBody || '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body></soap:Body></soap:Envelope>',
            headers: step.headers || {},
            contentType: step.contentType || 'application/soap+xml',
            // Default to SOAP since APInox is primarily a SOAP tool
            requestType: step.requestType || 'soap',
            bodyType: step.bodyType || 'xml',
            httpMethod: step.httpMethod || 'POST',
            method: step.method || 'POST',
            readOnly: false,
            // REST/GraphQL specific (optional, but prevents null errors)
            restConfig: {},
            graphqlConfig: {},
            // Ensure security and attachments exist
            security: {},
            attachments: []
        } as any;
        
    }

    // For backward compatibility with existing code, we use effectiveRequest as well
    const effectiveRequest = activeRequest;

    const onUpdateRequest = React.useCallback((updated: any) => {
        rawOnUpdateRequest(updated);
    }, [rawOnUpdateRequest]);


    const forceEditorUpdate = React.useCallback(() => {
        setEditorForceUpdateKey(prev => prev + 1);
    }, []);

    // Derived read-only state
    const isStructureLocked = (activeView === SidebarView.PERFORMANCE || activeView === SidebarView.TESTS);
    const isContentLocked = (activeRequest?.readOnly === true) ||
        (!isStructureLocked && selectedProject?.readOnly === true);
    const preventEditing = isHistoryMode || isContentLocked;
    const isReadOnly = preventEditing; // Defaults to preventing editing, specific overrides used below

    // Performance Actions extracted in props destructuring above

    // Calculate available variables for autocomplete (only in test step context)
    // MUST be after testExecution is destructured from stepActions
    const availableVariables = React.useMemo(() => {
        // Early return with empty array if not in correct context
        if (activeView !== SidebarView.TESTS) return [];
        if (!selectedTestCase || !selectedStep) return [];
        if (!selectedStep.id || selectedStep.type !== 'request') return [];
        
        try {
            const currentIndex = selectedTestCase.steps?.findIndex(s => s.id === selectedStep.id) ?? -1;
            if (currentIndex <= 0) return [];
            
            const priorSteps = selectedTestCase.steps.slice(0, currentIndex);
            const vars: Array<{ name: string; value: string | null; source: string }> = [];
            
            priorSteps.forEach(step => {
                if (step.type === 'request' && step.config?.request?.extractors) {
                    step.config.request.extractors.forEach(ext => {
                        try {
                            const stepExec = testExecution?.[selectedTestCase.id]?.[step.id];
                            let value: string | null = null;
                            
                            if (stepExec?.response) {
                                const rawResp = stepExec.response.rawResponse || 
                                    (typeof stepExec.response.result === 'string'
                                        ? stepExec.response.result
                                        : JSON.stringify(stepExec.response.result));
                                
                                if (rawResp && ext.source === 'body') {
                                    try {
                                        value = CustomXPathEvaluator.evaluate(rawResp, ext.path);
                                        if (!value && ext.defaultValue) {
                                            value = ext.defaultValue;
                                        }
                                    } catch (e) {
                                        if (ext.defaultValue) {
                                            value = ext.defaultValue;
                                        }
                                    }
                                }
                            } else if (ext.defaultValue) {
                                value = ext.defaultValue;
                            }
                            
                            vars.push({
                                name: ext.variable,
                                value,
                                source: step.name
                            });
                        } catch (extError) {
                            console.error('[WorkspaceLayout] Error processing extractor:', extError);
                        }
                    });
                }
            });
            
            return vars;
        } catch (error) {
            console.error('[WorkspaceLayout] Error in availableVariables:', error);
            return [];
        }
    }, [activeView, selectedTestCase, selectedStep, testExecution]);



    const [alignAttributes, setAlignAttributes] = React.useState(false);
    const [showVariables, setShowVariables] = React.useState(false);
    const [showCodeSnippet, setShowCodeSnippet] = React.useState(false);

    // ... imports


    // Editor Refs for insertion
    const urlEditorRef = React.useRef<MonacoSingleLineInputHandle>(null);
    const bodyEditorRef = React.useRef<MonacoRequestEditorHandle>(null);
    const lastFocusedRef = React.useRef<MonacoSingleLineInputHandle | MonacoRequestEditorHandle | null>(null);
    const [selection, setSelection] = React.useState<{ text: string, offset: number } | null>(null);
    const [currentXPath, setCurrentXPath] = React.useState<string | null>(null);
    const [editorForceUpdateKey, setEditorForceUpdateKey] = React.useState<number>(0);
    const prevAlignAttributesRef = React.useRef<boolean>(alignAttributes);
    const lastAlignedRequestIdRef = React.useRef<string | null>(null);
    const lastFormattedRequestIdRef = React.useRef<string | null>(null);
    const settingsMenuRef = React.useRef<HTMLDivElement>(null);
    
    // Validation state
    const [urlValidationError, setUrlValidationError] = React.useState<string | null>(null);
    const [bodyValidationError, setBodyValidationError] = React.useState<string | null>(null);

    React.useEffect(() => {
        if (config?.ui?.alignAttributes !== undefined) {
            setAlignAttributes(config.ui.alignAttributes);
        }
    }, [config?.ui?.alignAttributes]);

    React.useEffect(() => {
        if (prevAlignAttributesRef.current === alignAttributes) return;
        prevAlignAttributesRef.current = alignAttributes;

        if (preventEditing || !effectiveRequest?.request) return;

        const isXmlRequest = effectiveRequest.requestType !== 'rest'
            && effectiveRequest.bodyType !== 'json'
            && effectiveRequest.bodyType !== 'graphql'
            && effectiveRequest.bodyType !== 'text';

        if (!isXmlRequest || !activeRequest) return;

        onUpdateRequest({
            ...activeRequest,
            request: formatXml(activeRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();
    }, [alignAttributes, preventEditing, activeRequest, inlineElementValues, onUpdateRequest]);

    React.useEffect(() => {
        if (!alignAttributes) {
            lastAlignedRequestIdRef.current = null;
            return;
        }
        if (preventEditing || !effectiveRequest?.request) return;

        const requestId = effectiveRequest.id || effectiveRequest.name || null;
        if (requestId && lastAlignedRequestIdRef.current === requestId) return;

        const isXmlRequest = effectiveRequest.requestType !== 'rest'
            && effectiveRequest.bodyType !== 'json'
            && effectiveRequest.bodyType !== 'graphql'
            && effectiveRequest.bodyType !== 'text';

        if (!isXmlRequest) return;

        onUpdateRequest({
            ...effectiveRequest,
            request: formatXml(effectiveRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();

        if (requestId) {
            lastAlignedRequestIdRef.current = requestId;
        }
    }, [alignAttributes, preventEditing, activeRequest, inlineElementValues, onUpdateRequest]);

    React.useEffect(() => {
        if (preventEditing || !effectiveRequest?.request) return;

        const requestId = effectiveRequest.id || effectiveRequest.name || null;
        if (requestId && lastFormattedRequestIdRef.current === requestId) return;

        const isXmlRequest = effectiveRequest.requestType !== 'rest'
            && effectiveRequest.bodyType !== 'json'
            && effectiveRequest.bodyType !== 'graphql'
            && effectiveRequest.bodyType !== 'text';

        if (!isXmlRequest) return;

        onUpdateRequest({
            ...effectiveRequest,
            request: formatXml(effectiveRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();

        if (requestId) {
            lastFormattedRequestIdRef.current = requestId;
        }
    }, [alignAttributes, preventEditing, activeRequest, inlineElementValues, onUpdateRequest]);

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
    };

    const handleCreateExistenceAssertion = () => {
        if (!selection || !response || !onAddExistenceAssertion || !currentXPath) return;

        onAddExistenceAssertion({ xpath: currentXPath });
    };

    // Validated execute handler - MUST be defined before any conditional returns
    const handleValidatedExecute = React.useCallback(() => {
        if (!activeRequest) return;
        
        // Validate URL
        const urlResult = validateUrl(activeRequest.endpoint || '');
        if (!urlResult.valid) {
            setUrlValidationError(urlResult.error || 'Invalid URL');
            console.error('❌ URL validation failed:', urlResult.error);
            // Show user-friendly error via alert (could be replaced with toast notification)
            alert(`Cannot execute request:\n\n${urlResult.error || 'Invalid URL'}`);
            return;
        }
        setUrlValidationError(null);
        
        // Validate body based on type
        const bodyType = activeRequest.bodyType || 'xml';
        if (bodyType === 'json') {
            const jsonResult = validateJson(activeRequest.request);
            if (!jsonResult.valid) {
                setBodyValidationError(jsonResult.details || jsonResult.error || 'Invalid JSON');
                console.error('❌ JSON validation failed:', jsonResult.details);
                alert(`Cannot execute request:\n\nInvalid JSON body:\n${jsonResult.details || jsonResult.error}`);
                return;
            }
        } else if (bodyType === 'xml') {
            const xmlResult = validateXml(activeRequest.request);
            if (!xmlResult.valid) {
                setBodyValidationError(xmlResult.error || 'Invalid XML');
                console.error('❌ XML validation failed:', xmlResult.error);
                alert(`Cannot execute request:\n\nInvalid XML body:\n${xmlResult.error}`);
                return;
            }
        }
        setBodyValidationError(null);
        
        // All validations passed - execute
        console.log('✅ All validations passed, executing request');
        if (onExecute) {
            onExecute(activeRequest.request);
        }
    }, [activeRequest, onExecute]);

    const handleCreateReplaceRule = (_target: 'request' | 'response') => {
        // Replace rule and mock rule features removed - moved to APIprox
        /*
        if (!selection || !currentXPath || !onAddReplaceRule) return;

        onAddReplaceRule({ xpath: currentXPath, matchText: selection.text, target });
        */
    };

    const handleCreateMockRule = () => {
        // Mock rule features removed - moved to APIprox
        /*
        if (!activeRequest || !response || !onAddMockRule) {
            console.warn('[WorkspaceLayout] handleCreateMockRule aborted: missing data or callback');
            return;
        }

        const newRule = createMockRuleFromSource({
            url: activeRequest.endpoint || '',
            statusCode: response.status || 200,
            responseBody: response.rawResponse || '',
            responseHeaders: response.headers || {},
        });

        onAddMockRule(newRule);
        */
    };

    if (activeView === SidebarView.HOME) {
        return <WelcomePanel changelog={undefined} />;
    }

    // PERFORMANCE VIEW - REMOVED: Moved to APIprox
    // Performance testing is now available in the APIprox project

    // PERFORMANCE VIEW
    if (activeView === SidebarView.PERFORMANCE) {
        const suiteHistory = (performanceHistory || []).filter(run => selectedPerformanceSuite ? run.suiteId === selectedPerformanceSuite.id : false);
        const performanceSchedules = config?.performanceSchedules || [];
        const isPerfRunning = !!performanceProgress;

        if (!selectedPerformanceSuite && !activeRequest) {
            return <EmptyState title="No Performance Suite Selected" description="Pick or create a performance suite from the sidebar." icon={Play} />;
        }

        if (selectedPerformanceSuite && !activeRequest) {
            return (
                <PerformanceSuiteEditor
                    suite={selectedPerformanceSuite}
                    onUpdate={onUpdateSuite || (() => { })}
                    onRun={onRunSuite || (() => { })}
                    onStop={onStopRun || (() => { })}
                    isRunning={isPerfRunning}
                    onAddRequest={onAddPerformanceRequest}
                    onDeleteRequest={onDeletePerformanceRequest}
                    onUpdateRequest={onUpdatePerformanceRequest}
                    onSelectRequest={onSelectPerformanceRequest}
                    onImportFromWorkspace={onImportFromWorkspace}
                    progress={performanceProgress || null}
                    history={suiteHistory}
                    schedules={performanceSchedules}
                    coordinatorStatus={coordinatorStatus}
                    onStartCoordinator={onStartCoordinator}
                    onStopCoordinator={onStopCoordinator}
                />
            );
        }
    }

    // TESTS VIEW
    if (activeView === SidebarView.TESTS) {
        if (selectedTestSuite && !selectedTestCase) {
            return <TestSuiteSummary suite={selectedTestSuite} onSelectTestCase={navigationActions?.onSelectTestCase} />;
        }

        if (selectedStep && selectedStep.type === 'workflow' && !isReadOnly && onUpdateStep) {
            // Load workflows from config
            const workflows = config?.workflows || [];
            
            return (
                <Content>
                    <Toolbar>
                        {onBackToCase && (
                            <ToolbarButton onClick={onBackToCase} title="Back to Test Case">
                                <ChevronLeft size={14} /> Back
                            </ToolbarButton>
                        )}
                        <DelayTitle>Workflow Configuration</DelayTitle>
                    </Toolbar>
                    <DelayContent>
                        <h2>Step: {selectedStep.name}</h2>
                        <DelayField>
                            <DelayLabel>Workflow:</DelayLabel>
                            <select
                                value={selectedStep.config.workflowId || ''}
                                onChange={(e) => {
                                    onUpdateStep({
                                        ...selectedStep,
                                        config: { ...selectedStep.config, workflowId: e.target.value }
                                    });
                                }}
                                style={{
                                    background: 'var(--apinox-input-background)',
                                    color: 'var(--apinox-input-foreground)',
                                    border: '1px solid var(--apinox-input-border)',
                                    padding: '6px',
                                    borderRadius: '2px',
                                    fontSize: '13px'
                                }}
                            >
                                <option value="">Select a workflow...</option>
                                {workflows.map((wf: any) => (
                                    <option key={wf.id} value={wf.id}>
                                        {wf.name}
                                    </option>
                                ))}
                            </select>
                        </DelayField>
                        <DelayField style={{ marginTop: '20px' }}>
                            <DelayLabel>Override Variables (JSON):</DelayLabel>
                            <textarea
                                value={JSON.stringify(selectedStep.config.workflowVariables || {}, null, 2)}
                                onChange={(e) => {
                                    try {
                                        const vars = JSON.parse(e.target.value);
                                        onUpdateStep({
                                            ...selectedStep,
                                            config: { ...selectedStep.config, workflowVariables: vars }
                                        });
                                    } catch (err) {
                                        // Invalid JSON - don't update
                                        console.error('Invalid JSON for workflow variables:', err);
                                    }
                                }}
                                rows={8}
                                placeholder='{"variable1": "value1", "variable2": "value2"}'
                                style={{
                                    background: 'var(--apinox-input-background)',
                                    color: 'var(--apinox-input-foreground)',
                                    border: '1px solid var(--apinox-input-border)',
                                    padding: '8px',
                                    borderRadius: '2px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    width: '100%'
                                }}
                            />
                            <div style={{ fontSize: '11px', color: 'var(--apinox-descriptionForeground)', marginTop: '8px' }}>
                                Variables defined here will override workflow defaults. Test case context variables are also available.
                            </div>
                        </DelayField>
                    </DelayContent>
                </Content>
            );
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
                        <DelayTitle>Delay Configuration</DelayTitle>
                    </Toolbar>
                    <DelayContent>
                        <h2>Step: {selectedStep.name}</h2>
                        <DelayField>
                            <DelayLabel>Delay Duration (milliseconds):</DelayLabel>
                            <DelayInput
                                type="number"
                                value={selectedStep.config.delayMs || 0}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value) || 0;
                                    onUpdateStep({ ...selectedStep, config: { ...selectedStep.config, delayMs: val } });
                                }}
                            />
                        </DelayField>
                    </DelayContent>
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
                    workflows={config?.workflows}
                    projects={projects}
                />
            );
        }

        if (!selectedTestCase) {
            return <EmptyTestCase />;
        }
    }

    // WORKFLOWS VIEW
    if (activeView === SidebarView.WORKFLOWS) {
        console.log('[WorkspaceLayout] In WORKFLOWS view, selectedWorkflowStep:', !!selectedWorkflowStep);
        
        if (!selectedWorkflowStep) {
            console.log('[WorkspaceLayout] No workflow step selected, showing welcome');
            return (
                <WelcomePanel 
                    changelog={undefined}
                />
            );
        }
        
        // Check if a workflow is selected (but not a step within it)
        // This happens when the user clicks the workflow itself, not a step
        const { workflow, step } = selectedWorkflowStep;
        console.log('[WorkspaceLayout] workflow:', workflow?.name, 'step:', step?.name || 'null/undefined');
        console.log('[WorkspaceLayout] step check:', !step, '|| !step.type:', !step?.type);
        
        // If step is actually the first step or we're showing the workflow summary
        // We need to check if we're showing a step or the workflow itself
        // For now, let's check if step type exists - if not, show workflow editor
        if (!step || !step.type) {
            console.log('[WorkspaceLayout] Showing workflow editor for:', workflow?.name);
            return (
                <WorkflowEditor
                    workflow={workflow}
                    projects={projects || []}
                    onUpdate={(updatedWorkflow) => {
                        workspace.updateWorkflow(updatedWorkflow);
                    }}
                    onSelectStep={(selectedStep) => {
                        // Re-select with proper step
                        workspace.selectWorkflowStep({ workflow, step: selectedStep });
                    }}
                />
            );
        }
        
        // Check if this is a non-request step type (delay, condition, loop, script)
        if (step.type !== 'request') {
            console.log('[WorkspaceLayout] Non-request step type:', step.type);
            
            const updateHandler = (updatedStep: WorkflowStep) => {
                workspace.updateWorkflowStep(workflow, updatedStep);
            };
            
            // Show appropriate editor for each step type
            switch (step.type) {
                case 'delay':
                    return <DelayStepEditor step={step} onUpdate={updateHandler} />;
                case 'condition':
                    return <ConditionStepEditor step={step} onUpdate={updateHandler} />;
                case 'loop':
                    return <LoopStepEditor step={step} onUpdate={updateHandler} />;
                case 'script':
                    return <ScriptStepEditor step={step} onUpdate={updateHandler} />;
                default:
                    return (
                        <EmptyState
                            icon={GitBranch}
                            title="Unknown Step Type"
                            description="This step type is not supported."
                        />
                    );
            }
        }
        
        // If workflow step IS selected and it's a request type, fall through to main editor
        // effectiveRequest/activeRequest has been set above
        console.log('[WorkspaceLayout] Rendering workflow request step editor');
    }

    // Phase B (t_86c34d38): the PROJECTS view was deleted. Its dedicated
    // summary/empty-state rendering (OperationSummary / InterfaceSummary /
    // ProjectSummary / EmptyProject + create-request-from-sample) is gone with
    // it — the shared request editor below (fall-through) is now the only
    // render path for non-UNIFIED views (TESTS steps, PROXY, HISTORY, ...).

    // PROXY VIEW
    if (activeView === SidebarView.PROXY) {
        return (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                    <ProxyPanel onNavigateTo={(_view) => workspace.selectInterface(null)} />
                </Suspense>
            </div>
        );
    }

    // MOCK/RULES VIEW
    if (activeView === SidebarView.MOCK) {
        return (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                    <RulesAndMockPage />
                </Suspense>
            </div>
        );
    }

    // WATCHER VIEW
    if (activeView === SidebarView.WATCHER) {
        return (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <Suspense fallback={<div style={{ flex: 1, background: 'var(--apinox-editor-background)' }} />}>
                    <FileWatcherPage />
                </Suspense>
            </div>
        );
    }

    // HISTORY VIEW
    if (activeView === SidebarView.HISTORY) {
        if (!activeRequest) {
            return <EmptyHistory />;
        }
    }

    // Fallback for other views that usually show Welcome if no request selected
    if (!effectiveRequest) {
        if (selectedStep && selectedStep.type === 'script' && onUpdateStep) {
            return (
                <ScriptEditor
                    step={selectedStep}
                    onUpdate={(step) => onUpdateStep(step as unknown as TestStep)}
                    isReadOnly={isReadOnly}
                    onBack={onBackToCase}
                />
            );
        }
        return <WelcomePanel changelog={undefined} />;
    }

    // TypeScript flow analysis: After the guard above, activeRequest is guaranteed to be non-null
    // Add a type assertion to help TypeScript understand this
    if (!activeRequest) {
        throw new Error('[WorkspaceLayout] Invariant violation: activeRequest should not be null after effectiveRequest check');
    }


    // For the main rendering, use effectiveRequest as the current request
    // This avoids having to change hundreds of references throughout the component
    const currentRequest = effectiveRequest;

    // File picker callback for form-data and binary uploads
    // TODO: Implement proper binary file reading via Tauri command
    // 
    // IMPLEMENTATION NEEDED:
    // 1. Add Tauri command in src-tauri/src/main.rs:
    //    #[tauri::command]
    //    fn read_binary_file(path: String) -> Result<Vec<u8>, String> {
    //        std::fs::read(path).map_err(|e| e.to_string())
    //    }
    // 
    // 2. Register command in tauri::Builder:
    //    .invoke_handler(tauri::generate_handler![read_binary_file])
    // 
    // 3. Update this function to call the command:
    //    const { invoke } = await import('@tauri-apps/api/core');
    //    const bytes = await invoke<number[]>('read_binary_file', { path: selected });
    //    const base64 = btoa(String.fromCharCode(...bytes));
    //    return { name, content: base64, contentType, size: bytes.length };
    const handlePickFile = async (): Promise<{ name: string; content: string; contentType: string; size: number } | null> => {
        try {
            // Import Tauri dialog API
            const { open } = await import('@tauri-apps/plugin-dialog');
            
            // Open file picker
            const selected = await open({
                multiple: false,
                directory: false
            });
            
            if (!selected || typeof selected !== 'string') return null;
            
            // Get file name
            const name = selected.split('/').pop() || selected.split('\\').pop() || 'file';
            
            // Detect content type from extension
            const ext = selected.split('.').pop()?.toLowerCase();
            let contentType = 'application/octet-stream';
            if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
            else if (ext === 'png') contentType = 'image/png';
            else if (ext === 'gif') contentType = 'image/gif';
            else if (ext === 'pdf') contentType = 'application/pdf';
            else if (ext === 'json') contentType = 'application/json';
            else if (ext === 'xml') contentType = 'application/xml';
            else if (ext === 'txt') contentType = 'text/plain';
            
            // TEMPORARY: Return placeholder until Tauri command is implemented
            // This allows the UI to work but files won't be uploaded yet
            console.warn('⚠️ File selected:', selected, 'but binary reading not yet implemented');
            console.warn('⚠️ See TODO comment above for implementation details');
            return {
                name,
                content: '', // FIXME: Empty for now - needs Tauri command to read binary
                contentType,
                size: 0      // FIXME: Actual size unknown without reading file
            };
        } catch (err) {
            console.error('File picker error:', err);
            return null;
        }
    };

    return (
        <Content>
            {/* Modal - temporarily disabled during package migration */}
            {/* <CodeSnippetModal
                isOpen={showCodeSnippet}
                onClose={() => setShowCodeSnippet(false)}
                request={currentRequest}
                environment={config?.environments && config?.activeEnvironment ? config.environments[config.activeEnvironment] : undefined}
            /> */}

            {/* Back navigation buttons */}
            {!isHistoryMode && selectedTestCase && (
                <Toolbar>
                    {/* Test case back button */}
                    {selectedTestCase && onBackToCase && (
                        <>
                            <ToolbarButton onClick={onBackToCase} title="Back to Test Case">
                                <ChevronLeft size={14} /> Back
                            </ToolbarButton>
                            <ToolbarSeparator />
                        </>
                    )}
                </Toolbar>
            )}

            {/* RequestWorkspace component */}
            <ErrorBoundary
                onError={(error, errorInfo) => {
                    console.error('💥 RequestWorkspace Error:', error);
                    console.error('Component Stack:', errorInfo.componentStack);
                }}
            >
                <RequestWorkspace
                    request={activeRequest as PackageApiRequest}
                response={response ? {
                    rawResponse: response.rawResponse,
                    status: response.status,
                    statusText: response.statusText,
                    time: response.time,
                    size: response.size,
                    headers: response.headers,
                    contentType: response.contentType
                } as PackageExecutionResponse : undefined}
                loading={loading}
                onUpdateRequest={(updated) => onUpdateRequest(updated as any)}
                onExecute={handleValidatedExecute}
                onCancel={onCancel}
                onReset={onReset}
                readOnly={preventEditing}
                defaultEndpoint={defaultEndpoint}
                availableVariables={availableVariables.map(v => ({
                    name: v.name,
                    value: v.value,
                    source: v.source
                }) as PackageVariable)}
                showBreadcrumb={false}
                breadcrumbPath={[]}
                onLog={(message, level = 'info') => {
                    console.log(`[${level.toUpperCase()}] ${message}`);
                }}
                initialEditorSettings={{
                    fontSize: config?.ui?.editorFontSize || 14,
                    fontFamily: config?.ui?.editorFontFamily || 'Consolas, "Courier New", monospace',
                    showLineNumbers: config?.ui?.showLineNumbers ?? true,
                    alignAttributes: config?.ui?.alignAttributes ?? false,
                    inlineValues: config?.ui?.inlineElementValues ?? true,
                    hideCausality: false
                }}
                initialLayoutMode={config?.ui?.layoutMode as 'vertical' | 'horizontal' ?? 'vertical'}
                layoutMode={isMobile ? 'horizontal' : undefined}
                onLayoutModeChange={(mode) => {
                    bridge.sendMessage({
                        command: 'saveUiState',
                        ui: {
                            ...config?.ui,
                            layoutMode: mode
                        }
                    });
                }}
                onEditorSettingsChange={(settings) => {
                    bridge.sendMessage({
                        command: 'saveUiState',
                        ui: {
                            ...config?.ui,
                            editorFontSize: settings.fontSize,
                            editorFontFamily: settings.fontFamily,
                            showLineNumbers: settings.showLineNumbers,
                            alignAttributes: settings.alignAttributes,
                            inlineElementValues: settings.inlineValues
                        }
                    });
                }}
                onPickFile={handlePickFile}
            />
            </ErrorBoundary>
        </Content >
    );
};



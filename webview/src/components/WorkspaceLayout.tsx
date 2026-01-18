import React from 'react';
import { Layout as LayoutIcon, ListOrdered, Play, Loader2, RotateCcw, WrapText, Bug, AlignLeft, Braces, ChevronLeft, ChevronRight, ListChecks, Replace, Cloud, PlusSquare, FileCode } from 'lucide-react';
// Models imported via props.ts indirections, specific enums kept if needed locally (TestStepType is used in code?)
// Checking code: TestStepType is used in props interface but not local var?
// Actually TestStepType is used in onAddStep signature but onAddStep comes from props.
// Let's remove them and add back if needed.
import { SidebarView, RequestType, BodyType, HttpMethod } from '@shared/models';
// ... imports

import { MonacoRequestEditor, MonacoRequestEditorHandle } from './MonacoRequestEditor';
import { MonacoResponseViewer } from './MonacoResponseViewer';
import { AssertionsPanel } from './AssertionsPanel';
import { HeadersPanel } from './HeadersPanel';
import { SecurityPanel } from './SecurityPanel';
import { AttachmentsPanel } from './AttachmentsPanel';
import { ExtractorsPanel } from './ExtractorsPanel';

import { MonacoSingleLineInput, MonacoSingleLineInputHandle } from './MonacoSingleLineInput';
import { formatXml, stripCausalityData } from '@shared/utils/xmlFormatter';
import { XPathGenerator } from '../utils/xpathGenerator';
import { CodeSnippetModal } from './modals/CodeSnippetModal';
import { WelcomePanel, TestCaseView, EmptyTestCase } from './workspace';
import { ApiExplorerMain } from './explorer/ApiExplorerMain';
import { EmptyState, EmptyFileWatcher, EmptyApiExplorer, EmptyServer, EmptyProject, EmptyHistory } from './workspace/EmptyStates';
import { ProjectSummary } from './workspace/ProjectSummary';
import { InterfaceSummary } from './workspace/InterfaceSummary';
import { TestSuiteSummary } from './workspace/TestSuiteSummary';
import { OperationSummary } from './workspace/OperationSummary';
import { PerformanceSuiteEditor } from './workspace/PerformanceSuiteEditor';
import { RequestTypeSelector } from './workspace/RequestTypeSelector';
import { QueryParamsPanel } from './QueryParamsPanel';
import { RestAuthPanel } from './RestAuthPanel';
import { GraphQLVariablesPanel } from './GraphQLVariablesPanel';
import { ScriptEditor } from './ScriptEditor';


// Styled components extracted to styles file

import { createMockRuleFromSource } from '../utils/mockUtils';
import { findPathToRequest } from '../utils/projectUtils';

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
    MiniButtonIcon
} from '../styles/WorkspaceLayout.styles';


// Prop Groups
import {
    WorkspaceLayoutProps
} from '../types/props';







// Helper Components





export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
    projects,
    selectionState,
    requestActions,
    viewState,
    configState,
    stepActions,
    toolsActions,
    onUpdateSuite,
    onAddPerformanceRequest,
    onDeletePerformanceRequest,
    onSelectPerformanceRequest,
    onUpdatePerformanceRequest,
    onImportFromWorkspace,
    onRunSuite,
    onStopRun,
    performanceProgress,
    performanceHistory,
    onBackToSuite,
    navigationActions,
    coordinatorStatus,
    onStartCoordinator,
    onStopCoordinator,
    explorerState // Add this
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


    const forceEditorUpdate = React.useCallback(() => {
        setEditorForceUpdateKey(prev => prev + 1);
    }, []);
    const {
        activeView, // Now available
        layoutMode, showLineNumbers, splitRatio, isResizing, onToggleLayout, onToggleLineNumbers, onStartResizing,
        inlineElementValues, onToggleInlineElementValues, hideCausalityData, onToggleHideCausalityData
    } = viewState;
    const { config, defaultEndpoint, changelog, isReadOnly: isHistoryMode } = configState;

    // Derived read-only state
    const isStructureLocked = (activeView === SidebarView.PERFORMANCE || activeView === SidebarView.TESTS);
    const isContentLocked = (selectedRequest?.readOnly === true) ||
        (!isStructureLocked && selectedProject?.readOnly === true);
    const preventEditing = isHistoryMode || isContentLocked;
    const isReadOnly = preventEditing; // Defaults to preventing editing, specific overrides used below
    const {
        onRunTestCase, onOpenStepRequest, onBackToCase, onAddStep, testExecution,
        onUpdateStep, onSelectStep, onDeleteStep, onMoveStep
    } = stepActions;
    const {
        onAddExtractor, onEditExtractor, onAddAssertion, onAddExistenceAssertion, onAddReplaceRule, onAddMockRule, onOpenDevOps
    } = toolsActions;

    // Performance Actions extracted in props destructuring above



    const [alignAttributes, setAlignAttributes] = React.useState(false);
    const [activeTab, setActiveTab] = React.useState<'request' | 'headers' | 'params' | 'assertions' | 'auth' | 'extractors' | 'attachments' | 'variables'>('request');
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

    React.useEffect(() => {
        if (config?.ui?.alignAttributes !== undefined) {
            setAlignAttributes(config.ui.alignAttributes);
        }
    }, [config?.ui?.alignAttributes]);

    React.useEffect(() => {
        if (prevAlignAttributesRef.current === alignAttributes) return;
        prevAlignAttributesRef.current = alignAttributes;

        if (preventEditing || !selectedRequest?.request) return;

        const isXmlRequest = selectedRequest.requestType !== 'rest'
            && selectedRequest.bodyType !== 'json'
            && selectedRequest.bodyType !== 'graphql'
            && selectedRequest.bodyType !== 'text';

        if (!isXmlRequest) return;

        onUpdateRequest({
            ...selectedRequest,
            request: formatXml(selectedRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();
    }, [alignAttributes, preventEditing, selectedRequest, inlineElementValues, onUpdateRequest]);

    React.useEffect(() => {
        if (!alignAttributes) {
            lastAlignedRequestIdRef.current = null;
            return;
        }
        if (preventEditing || !selectedRequest?.request) return;

        const requestId = selectedRequest.id || selectedRequest.name || null;
        if (requestId && lastAlignedRequestIdRef.current === requestId) return;

        const isXmlRequest = selectedRequest.requestType !== 'rest'
            && selectedRequest.bodyType !== 'json'
            && selectedRequest.bodyType !== 'graphql'
            && selectedRequest.bodyType !== 'text';

        if (!isXmlRequest) return;

        onUpdateRequest({
            ...selectedRequest,
            request: formatXml(selectedRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();

        if (requestId) {
            lastAlignedRequestIdRef.current = requestId;
        }
    }, [alignAttributes, preventEditing, selectedRequest, inlineElementValues, onUpdateRequest]);

    React.useEffect(() => {
        if (preventEditing || !selectedRequest?.request) return;

        const requestId = selectedRequest.id || selectedRequest.name || null;
        if (requestId && lastFormattedRequestIdRef.current === requestId) return;

        const isXmlRequest = selectedRequest.requestType !== 'rest'
            && selectedRequest.bodyType !== 'json'
            && selectedRequest.bodyType !== 'graphql'
            && selectedRequest.bodyType !== 'text';

        if (!isXmlRequest) return;

        onUpdateRequest({
            ...selectedRequest,
            request: formatXml(selectedRequest.request, alignAttributes, inlineElementValues)
        });
        forceEditorUpdate();

        if (requestId) {
            lastFormattedRequestIdRef.current = requestId;
        }
    }, [alignAttributes, preventEditing, selectedRequest, inlineElementValues, onUpdateRequest]);

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
        });

        onAddMockRule(newRule);
    };

    if (activeView === SidebarView.HOME) {
        return <WelcomePanel changelog={changelog} />;
    }

    // PERFORMANCE VIEW
    if (activeView === SidebarView.PERFORMANCE) {
        const suiteHistory = (performanceHistory || []).filter(run => selectedPerformanceSuite ? run.suiteId === selectedPerformanceSuite.id : false);
        const performanceSchedules = config?.performanceSchedules || [];
        const isPerfRunning = !!performanceProgress;

        if (!selectedPerformanceSuite && !selectedRequest) {
            return <EmptyState title="No Performance Suite Selected" description="Pick or create a performance suite from the sidebar." icon={Play} />;
        }

        if (selectedPerformanceSuite && !selectedRequest) {
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
        // If a performance request is selected, fall through to the request editor below.
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
            return <EmptyProject />;
        }
        // If request IS selected, fall through to Request Editor
    }

    // EXPLORER VIEW
    if (activeView === SidebarView.EXPLORER) {
        // If a request is selected, fall through to main render
        if (!selectedRequest && explorerState) {
            return (
                <ApiExplorerMain
                    inputType={explorerState.inputType}
                    setInputType={explorerState.setInputType}
                    wsdlUrl={explorerState.wsdlUrl}
                    setWsdlUrl={explorerState.setWsdlUrl}
                    loadWsdl={explorerState.loadWsdl}
                    downloadStatus={explorerState.downloadStatus}
                    onClearSelection={explorerState.onClearSelection}
                    selectedInterface={selectedInterface || undefined}
                    selectedOperation={selectedOperation || undefined}
                />
            );
        } else if (!selectedRequest) {
            return <EmptyApiExplorer />;
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

    // HISTORY VIEW
    if (activeView === SidebarView.HISTORY) {
        if (!selectedRequest) {
            return <EmptyHistory />;
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
            {/* Modal */}
            <CodeSnippetModal
                isOpen={showCodeSnippet}
                onClose={() => setShowCodeSnippet(false)}
                request={selectedRequest}
                environment={config?.environments && config?.activeEnvironment ? config.environments[config.activeEnvironment] : undefined}
            />

            <WorkspaceBody>
                {/* Toolbar */}

                {!isHistoryMode && (
                    <Toolbar>
                        {/* Explorer view back button */}
                        {activeView === SidebarView.EXPLORER && !selectedTestCase && !selectedPerformanceSuite && navigationActions?.onSelectRequest && (
                            <>
                                <ToolbarButton onClick={() => navigationActions.onSelectRequest(null as any)} title="Back to API Explorer">
                                    <ChevronLeft size={14} /> Back
                                </ToolbarButton>
                                <ToolbarSeparator />
                            </>
                        )}

                        {selectedTestCase && onBackToCase && (
                            <>
                                <ToolbarButton onClick={onBackToCase} title="Back to Test Case">
                                    <ChevronLeft size={14} /> Back
                                </ToolbarButton>
                                <ToolbarSeparator />
                            </>
                        )}

                        {!selectedTestCase && selectedPerformanceSuite && onBackToSuite && (
                            <>
                                <ToolbarButton onClick={onBackToSuite} title="Back to Performance Suite">
                                    <ChevronLeft size={14} /> Back
                                </ToolbarButton>
                                <ToolbarSeparator />
                            </>
                        )}

                        {/* Request Type / Method / Content-Type - Unified Selector */}
                        {preventEditing || isStructureLocked ? (
                            <ToolbarInfo>
                                <InfoBarMethod>{selectedRequest.method || 'POST'}</InfoBarMethod>
                                <InfoBarUrlPrimary title={selectedRequest.endpoint}>{selectedRequest.endpoint}</InfoBarUrlPrimary>
                            </ToolbarInfo>
                        ) : (
                            <>
                                <RequestTypeSelector
                                    requestType={selectedRequest.requestType}
                                    method={selectedRequest.method as HttpMethod}
                                    bodyType={selectedRequest.bodyType}
                                    contentType={selectedRequest.contentType}
                                    onRequestTypeChange={(type: RequestType) => onUpdateRequest({ ...selectedRequest, requestType: type })}
                                    onMethodChange={(method) => onUpdateRequest({ ...selectedRequest, method: method as string })}
                                    onBodyTypeChange={(type: BodyType) => onUpdateRequest({ ...selectedRequest, bodyType: type })}
                                    onContentTypeChange={(ct) => onUpdateRequest({ ...selectedRequest, contentType: ct })}
                                    compact={true}
                                />

                                {/* URL */}
                                <UrlInputWrapper>
                                    <MonacoSingleLineInput
                                        ref={urlEditorRef}
                                        value={selectedRequest.endpoint || defaultEndpoint || ''}
                                        onChange={(val) => onUpdateRequest({ ...selectedRequest, endpoint: val })}
                                        placeholder="Endpoint URL"
                                        readOnly={isReadOnly || isStructureLocked}
                                        onFocus={() => lastFocusedRef.current = urlEditorRef.current}
                                    />
                                </UrlInputWrapper>
                            </>
                        )}

                        {/* Actions */}
                        {!selectedTestCase && !preventEditing && (
                            <ToolbarButton onClick={() => { onReset(); forceEditorUpdate(); }} title="Revert to Default XML">
                                <RotateCcw size={14} /> Reset
                            </ToolbarButton>
                        )}

                        {!selectedTestCase && (
                            <ToolbarButton onClick={() => setShowCodeSnippet(true)} title="Generate Code">
                                <FileCode size={14} /> Code
                            </ToolbarButton>
                        )}

                        {loading ? (
                            <CancelButton onClick={onCancel}>
                                <Loader2 size={14} className="spin" /> Cancel
                            </CancelButton>
                        ) : (
                            <RunButton onClick={() => {
                                // Get current content from editor, falling back to selectedRequest.request
                                // This allows users to edit read-only samples and test with the edited content
                                const currentContent = bodyEditorRef.current?.getValue() ?? selectedRequest.request;
                                onExecute(currentContent);
                            }} title="Run Request">
                                <Play size={14} /> Run
                            </RunButton>
                        )}

                        <ToolbarSeparator />



                        {/* Variables Inserter */}
                        {selectedTestCase && selectedStep && (
                            <VariablesWrapper>
                                <ToolbarButton onClick={() => setShowVariables(!showVariables)} title="Insert/View Variables from Previous Steps">
                                    <Braces size={14} />
                                    <VariablesLabel>Variables</VariablesLabel>
                                </ToolbarButton>
                                {showVariables && (
                                    <VariablesDropdown>
                                        <VariablesDropdownHeader>
                                            Available Context Variables
                                        </VariablesDropdownHeader>
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
                                                return <VariablesDropdownEmpty>No variables defined in previous steps.</VariablesDropdownEmpty>
                                            }

                                            return vars.map((v, i) => (
                                                <VariablesDropdownItem
                                                    key={i}
                                                    onClick={() => {
                                                        const target = lastFocusedRef.current || bodyEditorRef.current; // Default to body
                                                        if (target) {
                                                            target.insertText('${#TestCase#' + v.name + '}');
                                                            // InsertText modifies model directly, so no force update needed usually,
                                                            // but if we updated state, we might. Here we access editor instance directly.
                                                        }
                                                        setShowVariables(false);
                                                    }}
                                                    title="Click to Insert"
                                                >
                                                    <VariablesDropdownName>{v.name}</VariablesDropdownName>
                                                    <VariablesDropdownSource>from {v.step}</VariablesDropdownSource>
                                                </VariablesDropdownItem>
                                            ));
                                        })()}
                                    </VariablesDropdown>
                                )}
                            </VariablesWrapper>
                        )}
                    </Toolbar>
                )}

                <EditorSplitContainer $layoutMode={layoutMode}>
                    <RequestPane $hasResponse={Boolean(response || loading)} $splitRatio={splitRatio}>
                        {/* Title Section (Moved above tabs) */}
                        {/* Title Section (Breadcrumbs) */}
                        <BreadcrumbBar>
                            {(() => {
                                const breadcrumbPath = projects && selectedRequest && selectedRequest.id ? findPathToRequest(projects, selectedRequest.id) : null;

                                if (breadcrumbPath) {
                                    return (
                                        <>
                                            {breadcrumbPath.map((segment, i) => (
                                                <React.Fragment key={i}>
                                                    {i > 0 && <ChevronRight size={12} />}
                                                    <span>{segment}</span>
                                                </React.Fragment>
                                            ))}
                                            <ChevronRight size={12} />
                                            <BreadcrumbActive>
                                                {selectedRequest.name}
                                            </BreadcrumbActive>
                                        </>
                                    );
                                }
                                // Fallback
                                return (
                                    <>
                                        <span>{selectedOperation?.name}</span>
                                        {selectedOperation && <ChevronRight size={12} />}
                                        <BreadcrumbActive>
                                            {selectedRequest.name}
                                        </BreadcrumbActive>
                                    </>
                                );
                            })()}
                        </BreadcrumbBar>

                        {/* Tabs Header */}
                        <TabsHeader>
                            <TabButton $active={activeTab === 'request'} onClick={() => setActiveTab('request')}>
                                Body
                            </TabButton>
                            <TabButton $active={activeTab === 'headers'} onClick={() => setActiveTab('headers')}>
                                Headers
                                {selectedRequest.headers && Object.keys(selectedRequest.headers).length > 0 && ` (${Object.keys(selectedRequest.headers).length})`}
                            </TabButton>

                            {/* Params tab - only for REST requests */}
                            {selectedRequest.requestType === 'rest' && (
                                <TabButton $active={activeTab === 'params'} onClick={() => setActiveTab('params')}>
                                    Params
                                    {selectedRequest.restConfig?.queryParams && Object.keys(selectedRequest.restConfig.queryParams).length > 0 && ` (${Object.keys(selectedRequest.restConfig.queryParams).length})`}
                                </TabButton>
                            )}

                            {/* Variables tab - only for GraphQL requests */}
                            {selectedRequest.requestType === 'graphql' && (
                                <TabButton $active={activeTab === 'variables'} onClick={() => setActiveTab('variables')}>
                                    Variables
                                    {selectedRequest.graphqlConfig?.variables && Object.keys(selectedRequest.graphqlConfig.variables).length > 0 && ' ✓'}
                                </TabButton>
                            )}
                            {!isHistoryMode && (
                                <>
                                    <TabButton $active={activeTab === 'assertions'} onClick={() => setActiveTab('assertions')}>
                                        Assertions
                                        {selectedRequest.assertions && selectedRequest.assertions.length > 0 && ` (${selectedRequest.assertions.length})`}
                                        {response && response.assertionResults && (
                                            <TabMeta>
                                                {response.assertionResults.every((r: any) => r.status === 'PASS') ? '✔' : '❌'}
                                            </TabMeta>
                                        )}
                                    </TabButton>
                                    <TabButton $active={activeTab === 'extractors'} onClick={() => setActiveTab('extractors')}>
                                        Extractors
                                        {selectedRequest.extractors && selectedRequest.extractors.length > 0 && ` (${selectedRequest.extractors.length})`}
                                    </TabButton>
                                </>
                            )}
                            <TabButton $active={activeTab === 'auth'} onClick={() => setActiveTab('auth')}>
                                Auth
                                {selectedRequest.wsSecurity && selectedRequest.wsSecurity.type !== 'none' && ' ✓'}
                            </TabButton>
                            <TabButton $active={activeTab === 'attachments'} onClick={() => setActiveTab('attachments')}>
                                Attachments
                                {selectedRequest.attachments && selectedRequest.attachments.length > 0 && ` (${selectedRequest.attachments.length})`}
                            </TabButton>

                            <TabsRight>
                                {/* Formatting Toggles */}
                                <IconButton onClick={() => {
                                    const newValue = !alignAttributes;
                                    setAlignAttributes(newValue);
                                    if (selectedRequest.request) onUpdateRequest({ ...selectedRequest, request: formatXml(selectedRequest.request, newValue, inlineElementValues) });
                                    forceEditorUpdate();
                                }} active={alignAttributes} title="Toggle Attribute Alignment" as={CompactIconButton}>
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
                                                forceEditorUpdate();
                                            }
                                        }}
                                        active={inlineElementValues}
                                        as={CompactIconButton}
                                    >
                                        <AlignLeft size={14} />
                                    </IconButton>
                                )}
                                {onToggleHideCausalityData && (
                                    <IconButton
                                        title={hideCausalityData ? "Show Debugger Causality Data" : "Hide Debugger Causality Data"}
                                        onClick={onToggleHideCausalityData}
                                        active={hideCausalityData}
                                        as={CompactIconButton}
                                    >
                                        <Bug size={14} />
                                    </IconButton>
                                )}
                                <IconButton
                                    title="Format XML Now"
                                    onClick={() => {
                                        const formatted = formatXml(selectedRequest.request, alignAttributes, inlineElementValues);
                                        onUpdateRequest({ ...selectedRequest, request: formatted });
                                        forceEditorUpdate();
                                    }}
                                    as={CompactIconButton}
                                >
                                    <Braces size={14} />
                                </IconButton>

                                {onOpenDevOps && config?.azureDevOps?.project && (
                                    <IconButton
                                        title="Add to Azure DevOps"
                                        onClick={onOpenDevOps}
                                        as={CompactIconButton}
                                    >
                                        <Cloud size={14} />
                                    </IconButton>
                                )}

                                {isReadOnly && onAddMockRule && (
                                    <CompactIconButtonWarning
                                        title="Import to Mock Rule"
                                        onClick={handleCreateMockRule}
                                    >
                                        <PlusSquare size={14} />
                                    </CompactIconButtonWarning>
                                )}

                                <Divider />

                                <StatText>Lines: {typeof selectedRequest.request === 'string' ? selectedRequest.request.split('\n').length : 0}</StatText>
                                <StatText>Size: {typeof selectedRequest.request === 'string' ? (selectedRequest.request.length / 1024).toFixed(2) : 0} KB</StatText>
                            </TabsRight>
                        </TabsHeader>

                        {activeTab === 'request' && (
                            <RequestEditorWrapper>
                                <MonacoRequestEditor
                                    ref={bodyEditorRef}
                                    value={hideCausalityData ? stripCausalityData(selectedRequest.request) : selectedRequest.request}
                                    language={
                                        // Dynamic language based on bodyType or requestType
                                        selectedRequest.bodyType === 'json' ? 'json' :
                                            selectedRequest.bodyType === 'graphql' ? 'graphql' :
                                                selectedRequest.bodyType === 'text' ? 'plaintext' :
                                                    selectedRequest.requestType === 'graphql' ? 'graphql' :
                                                        selectedRequest.requestType === 'rest' ? 'json' :
                                                            'xml'
                                    }
                                    readOnly={isReadOnly && activeView !== SidebarView.PROJECTS && activeView !== SidebarView.EXPLORER}
                                    onChange={(val) => onUpdateRequest({ ...selectedRequest, request: val })}
                                    onFocus={() => lastFocusedRef.current = bodyEditorRef.current}
                                    autoFoldElements={config?.ui?.autoFoldElements}
                                    showLineNumbers={showLineNumbers}
                                    requestId={selectedRequest.id || selectedRequest.name}
                                    forceUpdateKey={editorForceUpdateKey}
                                />
                                {/* Format Button Overlay */}
                            </RequestEditorWrapper>
                        )}
                        {activeTab === 'headers' && (
                            <PanelColumn>
                                <PanelBody $padded={isReadOnly || isStructureLocked}>
                                    {!isReadOnly && !isStructureLocked ? (
                                        <HeadersPanel
                                            headers={selectedRequest.headers || {}}
                                            onChange={(newHeaders) => onUpdateRequest({ ...selectedRequest, headers: newHeaders })}
                                            contentType={selectedRequest.contentType}
                                        />
                                    ) : (
                                        <HeadersViewer>
                                            <HeadersTitle>Request Headers</HeadersTitle>
                                            {selectedRequest.headers && Object.keys(selectedRequest.headers).length > 0 ? (
                                                Object.entries(selectedRequest.headers).map(([key, value]) => (
                                                    <HeadersRow key={key}>
                                                        <HeadersKey>{key}:</HeadersKey>
                                                        <HeadersValue>{String(value)}</HeadersValue>
                                                    </HeadersRow>
                                                ))
                                            ) : (
                                                <HeadersEmpty>No headers captured.</HeadersEmpty>
                                            )}
                                        </HeadersViewer>
                                    )}
                                </PanelBody>
                                {response && response.headers && (
                                    <ResponseHeadersContainer>
                                        <HeadersTitle>Response Headers</HeadersTitle>
                                        {Object.entries(response.headers).map(([key, value]) => (
                                            <HeadersRow key={key}>
                                                <HeadersKey>{key}:</HeadersKey>
                                                <HeadersValue>{String(value)}</HeadersValue>
                                            </HeadersRow>
                                        ))}
                                    </ResponseHeadersContainer>
                                )}
                            </PanelColumn>
                        )}
                        {/* Query Params Panel - REST only */}
                        {activeTab === 'params' && selectedRequest.requestType === 'rest' && (
                            <PanelColumn>
                                <QueryParamsPanel
                                    params={selectedRequest.restConfig?.queryParams || {}}
                                    onChange={(newParams) => onUpdateRequest({
                                        ...selectedRequest,
                                        restConfig: { ...selectedRequest.restConfig, queryParams: newParams }
                                    })}
                                    title="Query Parameters"
                                    readOnly={isReadOnly || isStructureLocked}
                                />
                            </PanelColumn>
                        )}
                        {/* GraphQL Variables Panel - GraphQL only */}
                        {activeTab === 'variables' && selectedRequest.requestType === 'graphql' && (
                            <PanelColumn>
                                <GraphQLVariablesPanel
                                    variables={selectedRequest.graphqlConfig?.variables}
                                    operationName={selectedRequest.graphqlConfig?.operationName}
                                    onChange={(newVars) => onUpdateRequest({
                                        ...selectedRequest,
                                        graphqlConfig: { ...selectedRequest.graphqlConfig, variables: newVars }
                                    })}
                                    onOperationNameChange={(name) => onUpdateRequest({
                                        ...selectedRequest,
                                        graphqlConfig: { ...selectedRequest.graphqlConfig, operationName: name }
                                    })}
                                />
                            </PanelColumn>
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
                            selectedRequest.requestType === 'rest' || selectedRequest.requestType === 'graphql' ? (
                                <RestAuthPanel
                                    auth={selectedRequest.restConfig?.auth}
                                    onChange={(newAuth) => onUpdateRequest({
                                        ...selectedRequest,
                                        restConfig: { ...selectedRequest.restConfig, auth: newAuth }
                                    })}
                                    readOnly={isReadOnly || isStructureLocked}
                                />
                            ) : (
                                <SecurityPanel
                                    security={selectedRequest.wsSecurity}
                                    onChange={(newSecurity) => onUpdateRequest({ ...selectedRequest, wsSecurity: newSecurity })}
                                />
                            )
                        )}
                        {activeTab === 'attachments' && (
                            <AttachmentsPanel
                                attachments={selectedRequest.attachments || []}
                                onChange={(newAttachments) => onUpdateRequest({ ...selectedRequest, attachments: newAttachments })}
                            />
                        )}
                    </RequestPane>

                    {/* Resizer */}
                    {(response || loading) && (
                        <SplitResizer
                            onMouseDown={onStartResizing}
                            $layoutMode={layoutMode}
                            $isResizing={isResizing}
                        />
                    )}

                    {/* Debug visibility */}
                    {(() => { console.log('[WorkspaceLayout] Rendering Response Section', { response: !!response, loading, splitRatio }); return null; })()}

                    {/* Response Section */}
                    {(response || loading) && (
                        <ResponseSection data-testid="response-section" $layoutMode={layoutMode}>
                            <ResponseHeader>
                                <ResponseHeaderLeft>
                                    <span>Response</span>
                                    {selection && onAddExtractor && !isReadOnly && currentXPath && (
                                        <ResponseHeaderActions>
                                            {selection.text && (
                                                <>
                                                    <MiniToolbarButton onClick={handleCreateExtractor}>
                                                        <MiniButtonIcon><Bug size={12} /></MiniButtonIcon> Extract
                                                    </MiniToolbarButton>
                                                    {onAddAssertion && (
                                                        <MiniToolbarButton onClick={handleCreateAssertion}>
                                                            <MiniButtonIcon><Braces size={12} /></MiniButtonIcon> Match
                                                        </MiniToolbarButton>
                                                    )}
                                                </>
                                            )}
                                            {onAddExistenceAssertion && (
                                                <MiniToolbarButton onClick={handleCreateExistenceAssertion}>
                                                    <MiniButtonIcon><ListChecks size={12} /></MiniButtonIcon> Exists
                                                </MiniToolbarButton>
                                            )}
                                        </ResponseHeaderActions>
                                    )}
                                    {/* Replace Rule button for Proxy view */}
                                    {selection && selection.text && isReadOnly && onAddReplaceRule && currentXPath && (
                                        <MiniToolbarButton
                                            onClick={() => handleCreateReplaceRule('response')}
                                            title="Create a replace rule for this selection"
                                        >
                                            <MiniButtonIcon><Replace size={12} /></MiniButtonIcon> Add Replace Rule
                                        </MiniToolbarButton>
                                    )}
                                </ResponseHeaderLeft>
                                {response && (
                                    <ResponseStats>
                                        {/* ... stats ... */}
                                        <StatText>Lines: {response.lineCount || 0}</StatText>
                                        <StatText>Time: {(response.duration || 0).toFixed(1)}s</StatText>
                                        <StatText>Size: {typeof response.rawResponse === 'string' ? (response.rawResponse.length / 1024).toFixed(2) : 0} KB</StatText>
                                        {response.createdAt && (
                                            <StatText>Received: {new Date(response.createdAt).toLocaleTimeString()}</StatText>
                                        )}
                                        {response.headers && response.headers['content-type'] && (
                                            <ResponseContentType title="Content-Type">
                                                {response.headers['content-type'].split(';')[0]}
                                            </ResponseContentType>
                                        )}
                                        <ResponseStatus $success={response.success}>
                                            {response.success ? '200 OK' : 'Error'}
                                        </ResponseStatus>
                                    </ResponseStats>
                                )}
                            </ResponseHeader>
                            <MonacoResponseViewer
                                value={(() => {
                                    const raw = response ? (response.rawResponse ? response.rawResponse : (response.error || '')) : '';
                                    const viewerLanguage = response?.language || 'xml';
                                    if (!raw) return '';
                                    if (viewerLanguage === 'json') return raw;
                                    return formatXml(raw, alignAttributes, inlineElementValues);
                                })()}
                                language={response?.language || 'xml'}
                                showLineNumbers={showLineNumbers}
                                onSelectionChange={setSelection}
                                autoFoldElements={config?.ui?.autoFoldElements}
                            />
                        </ResponseSection>
                    )}
                </EditorSplitContainer>
            </WorkspaceBody>

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

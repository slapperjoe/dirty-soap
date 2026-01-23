# Test Suite Page & Functionality Enhancements

## Problem Statement
The current test suite functionality is missing several key features:
1. Cannot access Test Suite page when test cases exist underneath (only shows test case view)
2. No visual indicators (✓/✗) for test run results in the sidebar
3. Cannot rename test suites (only test cases and steps)
4. No ability to run all test cases in a suite from the suite page
5. No add/delete test case functionality from the suite page
6. Test suite linking to workspaces is implicit (from SoapUI import) but not functional

## Proposed Approach

### 1. Data Model Updates
- Add `lastRunStatus` field to `TestSuite`, `TestCase`, and `TestStep` in `shared/src/models.ts`
- Add `concurrentTestCases` field to `TestSuite` for configurable parallel execution
- Store last run status persistently in project files

### 2. Test Suite Page Enhancement (`TestSuiteSummary.tsx`)
- Add "Run All" button with concurrency configuration
- Add "Add Test Case" button
- Show list of test cases with:
  - Status indicators (✓/✗ based on last run)
  - Individual "Run" buttons
  - Delete buttons
  - Click to navigate into test case details
- Show suite-level statistics (pass rate, last run time, etc.)

### 3. Sidebar Visual Indicators (`TestsUi.tsx`)
- Add status icons (✓/✗) next to test suites, test cases, and steps
- Color coding: green for pass, red for fail, gray for not run
- Update icons when tests complete

### 4. Test Suite Renaming (`TestsUi.tsx`)
- Add right-click context menu for test suites (currently only exists for test cases/steps)
- Support inline renaming similar to test cases
- Context menu items:
  - Rename
  - Run Suite
  - Add Test Case
  - Delete Suite

### 5. Navigation Fix
- Allow clicking on test suite name to open TestSuiteSummary even when test cases exist
- Clicking chevron expands/collapses cases
- Clicking suite name navigates to suite page

### 6. Run All Test Cases with Concurrency
- Add concurrency setting to TestSuite model (default: 1 = sequential)
- Reuse performance suite logic for concurrent execution
- Add UI in TestSuiteSummary to configure concurrency
- Show warning message when concurrency > 1 about SLA impacts

### 7. Test Suite to Workspace Linking
- Clarify in documentation that linking is only for SoapUI export compatibility
- No functional impact on APInox behavior
- Test suites remain global across all workspaces within a project

## Workplan

- [ ] **Data Model Updates** (`shared/src/models.ts`)
  - [ ] Add `lastRunStatus?: 'pass' | 'fail' | 'not-run'` to `TestSuite`
  - [ ] Add `lastRunStatus?: 'pass' | 'fail' | 'not-run'` to `TestCase`
  - [ ] Add `lastRunStatus?: 'pass' | 'fail' | 'not-run'` to `TestStep`
  - [ ] Add `concurrentTestCases?: number` to `TestSuite` (default: 1)
  - [ ] Add `lastRunTime?: number` to all three types

- [ ] **Test Execution Status Updates**
  - [ ] Update `TestRunnerContext.tsx` to set `lastRunStatus` on test completion
  - [ ] Update `useTestCaseHandlers.ts` to persist status to project
  - [ ] Update "Run Suite" logic to support concurrent test case execution
  - [ ] Calculate suite-level status from test case results

- [ ] **TestSuiteSummary Enhancement** (`components/workspace/TestSuiteSummary.tsx`)
  - [ ] Add "Run All" button with play icon
  - [ ] Add concurrency selector (dropdown or input)
  - [ ] Add warning message about SLA impacts when concurrency > 1
  - [ ] Add "Add Test Case" button
  - [ ] Add status indicator (✓/✗/○) to each test case row
  - [ ] Add individual "Run" button per test case
  - [ ] Add delete button per test case
  - [ ] Add pass/fail statistics
  - [ ] Style active/hover states for clickable rows

- [ ] **Sidebar Status Indicators** (`components/sidebar/TestsUi.tsx`)
  - [ ] Add status icon component (CheckCircle/XCircle/Circle from lucide-react)
  - [ ] Display suite status next to suite name
  - [ ] Display test case status next to test case name
  - [ ] Display step status next to step name
  - [ ] Color code: green (pass), red (fail), gray (not run)
  - [ ] Update icons on test execution completion

- [ ] **Test Suite Renaming** (`components/sidebar/TestsUi.tsx`)
  - [ ] Add right-click handler for test suite items
  - [ ] Add context menu with "Rename" option
  - [ ] Support inline rename input (similar to test case renaming)
  - [ ] Add `onRenameSuite` prop to `TestsUiProps`
  - [ ] Wire up to `handleRenameTestSuite` in MainContent.tsx

- [ ] **Navigation Fix** (`components/sidebar/TestsUi.tsx`)
  - [ ] Separate click handlers: chevron for expand/collapse, name for navigation
  - [ ] Ensure `onSelectSuite` is called when clicking suite name
  - [ ] Update `WorkspaceLayout.tsx` to show TestSuiteSummary when suite selected

- [ ] **Commands & Backend** (if needed)
  - [ ] Verify sidecar has no specific commands needed (status is stored in project)
  - [ ] Ensure project save includes new status fields

- [ ] **Testing & Validation**
  - [ ] Test suite renaming via right-click menu
  - [ ] Test navigation: click suite name → shows TestSuiteSummary
  - [ ] Test "Run All" with concurrency = 1 (sequential)
  - [ ] Test "Run All" with concurrency > 1 (parallel)
  - [ ] Test status indicators update after test runs
  - [ ] Test status persistence (restart app, status should remain)
  - [ ] Test add/delete test case from TestSuiteSummary
  - [ ] Test SoapUI export maintains test suite structure

- [ ] **Documentation Updates**
  - [ ] Add help text for concurrency setting
  - [ ] Document that test suites are global within project
  - [ ] Note that workspace linking is only for SoapUI compatibility

## Technical Notes

### Status Indicator Component
```tsx
const StatusIcon = ({ status }: { status: 'pass' | 'fail' | 'not-run' | undefined }) => {
  if (status === 'pass') return <CheckCircle size={12} color="var(--vscode-testing-iconPassed)" />;
  if (status === 'fail') return <XCircle size={12} color="var(--vscode-testing-iconFailed)" />;
  return <Circle size={12} style={{ opacity: 0.3 }} />;
};
```

### Concurrent Test Case Execution
Reuse pattern from `PerformanceService.executeParallel()`:
- Chunk test cases by concurrency level
- Use `Promise.all()` for parallel execution within chunks
- Sequential execution of chunks
- Collect results and update suite status

### Suite Status Calculation
```typescript
const calculateSuiteStatus = (testCases: TestCase[]): 'pass' | 'fail' | 'not-run' => {
  if (testCases.every(tc => tc.lastRunStatus === 'pass')) return 'pass';
  if (testCases.some(tc => tc.lastRunStatus === 'fail')) return 'fail';
  if (testCases.some(tc => tc.lastRunStatus === 'pass')) return 'fail'; // Mixed = fail
  return 'not-run';
};
```

### SoapUI Export Compatibility
- Test suites remain in project structure as they are
- Export maintains existing structure (no code changes needed)
- "Workspace linking" is purely conceptual (no functional impact in APInox)

## Estimated Complexity
- **Data Model**: Simple (1-2 fields per model)
- **TestSuiteSummary Enhancement**: Medium (new UI components, concurrency logic)
- **Sidebar Indicators**: Medium (icon rendering, status propagation)
- **Suite Renaming**: Simple (reuse existing pattern)
- **Navigation Fix**: Simple (separate click handlers)
- **Concurrent Execution**: Medium (reuse performance suite logic)

**Total Estimate**: ~1-2 days for full implementation and testing

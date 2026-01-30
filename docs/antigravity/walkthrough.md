# Walkthrough - Auto Code Folding for XML Elements

I have successfully implemented a configurable auto-folding feature that automatically collapses specified XML elements in all request and response editors.

## Changes Made

### 1. Configuration Schema

#### Backend: [models.ts](file:///d:/DirtySoap/APInox/src/models.ts)
- Added `autoFoldElements?: string[]` to `DirtySoapConfig.ui`
- Stores element names like `["Security", "Header", "Body"]`

#### Frontend: [models.ts](file:///d:/DirtySoap/APInox/webview/src/models.ts)
- Mirrored the backend change for type consistency

#### Settings Types: [SettingsTypes.ts](file:///d:/DirtySoap/APInox/webview/src/components/modals/settings/SettingsTypes.ts)
- Added `autoFoldElements?: string[]` to the UI settings schema

---

### 2. Settings UI

#### [GeneralTab.tsx](file:///d:/DirtySoap/APInox/webview/src/components/modals/settings/GeneralTab.tsx)
- Added a new "Auto-Fold XML Elements" section under User Interface settings
- Implemented tag-based input:
  - Displays current elements as removable tags (badges)
  - Input field accepts element names (press Enter to add)
  - Click × on a tag to remove it
  - Prevents duplicate entries
- Visual design matches VS Code theme with badge styling

---

### 3. Folding Logic

#### [NEW] [xmlFoldingUtils.ts](file:///d:/DirtySoap/APInox/webview/src/utils/xmlFoldingUtils.ts)
Created shared utility with two main functions:

**`findElementRanges(content, elementNames)`**
- Parses XML content line by line
- Matches opening and closing tags for specified element names
- Handles namespaced elements (e.g., `<s:Security>`)
- Case-insensitive matching
- Returns array of `{startLine, endLine}` ranges

**`applyAutoFolding(editor, content, elementNames, onComplete)`**
- Applies folding using the low-level Monaco folding model
- Accesses `editor.getContribution('editor.contrib.folding')`
- Uses `foldingModel.toggleCollapseState(regions)` for reliable folding
- Includes `onComplete` callback to signal when folding is finished
- Has fallback to `editor.getAction('editor.foldAll')` for safety
- Includes 300ms delay to ensure folding providers are initialized

---

### 4. Editor Integration

#### [MonacoRequestEditor.tsx](file:///d:/DirtySoap/APInox/webview/src/components/MonacoRequestEditor.tsx)
- Added `autoFoldElements?: string[]` prop
- Imported `applyAutoFolding` utility
- Applied folding on editor mount (if configured)
- Applied folding when value changes (via useEffect)

#### [MonacoResponseViewer.tsx](file:///d:/DirtySoap/APInox/webview/src/components/MonacoResponseViewer.tsx)
- Added `autoFoldElements?: string[]` prop
- Imported `applyAutoFolding` utility
- Applied folding on editor mount (if configured)
- Applied folding when value changes (via useEffect)
- Stored editor reference for dynamic folding updates

---

## How It Works

1. **User Configuration**: User opens Settings → General → Auto-Fold XML Elements
2. **Add Elements**: Type element names (e.g., "Security", "Header") and press Enter
3. **Save Settings**: Settings are persisted to `config.jsonc`
4. **Auto-Folding**: When any request or response is loaded:
   - The editor checks for configured element names
   - Finds matching XML elements in the content
   - Automatically collapses those elements
5. **Manual Control**: Users can still manually expand/collapse as needed

## Verification

✅ **Build Status**: Compiled successfully with exit code 0

### Manual Testing Steps

1. **Configure Elements**:
   - Open Settings (gear icon)
   - Navigate to General tab
   - Scroll to "Auto-Fold XML Elements"
   - Add "Security" (press Enter)
   - Add "Header" (press Enter)
   - Save settings

2. **Test Request Editor**:
   - Open a SOAP request containing `<Security>` or `<s:Security>`
   - Verify the element is automatically collapsed
   - Expand it manually - it should stay expanded until reload

3. **Test Response Viewer**:
   - Execute a request that returns XML with matching elements
   - Verify the response viewer also auto-folds the specified elements

4. **Test Multiple Elements**:
   - Add multiple element names to the setting
   - Verify all matching elements are folded

5. **Test Empty Setting**:
   - Clear all elements from the list
   - Verify no auto-folding occurs

## Technical Notes

- **Case-Insensitive**: Element matching is case-insensitive
- **Namespace Support**: Handles both `<Security>` and `<s:Security>`
- **Self-Closing Tags**: Ignores self-closing tags
- **Visual Flash Prevention**: Editors start with `opacity: 0` and fade in after folding completes
- **Reliable Folding**: Uses internal Monaco folding model rather than triggering generic actions
- **Request Switching**: Automatically re-folds when switching between different SOAP requests via `requestId` tracking
- **Performance**: 300ms timeout ensures folding model is fully populated by Monaco

## Bug Fixes Applied

### Issue 1: Config Not Being Passed
**Problem**: `autoFoldElements` was `undefined` in the Monaco editors  
**Fix**: Wired the config from `WorkspaceLayout` through to the editor components.

### Issue 2: Folding on Every Keystroke
**Problem**: Elements would re-fold while typing  
**Fix**: Removed `value` from `useEffect` dependencies for the request editor; folding now only triggers on `requestId` change.

### Issue 3: Folding Not Working Reliability
**Problem**: Generic editor actions (fold/foldAll) were not applying reliably  
**Fix**: Directly accessed the folding controller and model via the `toggleCollapseState` API.

### Issue 4: Visual Flash
**Problem**: User sees unfolded content before the folding timeout kicks in  
**Fix**: Implemented `isReady` state with `opacity: 0` hiding until the `onComplete` callback is triggered.


---

# Performance Testing Feature - Phase 2: UI Scaffolding

I have implemented the initial UI for the Performance Testing feature, integrating it into the Sidebar.

## Changes Made

### 1. Sidebar Integration
- Added a new **Performance** tab to the sidebar navigation rail.
- Created `PerformanceUi` component to list and manage performance suites.
- Updated `Sidebar.tsx` and `App.tsx` wire up the new component with state and handlers.

### 2. Backend Integration
- Wired frontend actions to backend commands:
  - `addPerformanceSuite`
  - `deletePerformanceSuite`
  - `runPerformanceSuite`
  - `abortPerformanceSuite`
- Added event listeners for `performanceRunComplete` to update UI state.

### 3. State Management
- Added `performanceSuites` and `performanceHistory` to the application configuration model.
- Implemented `activeRunId` state to track running tests.

## Verification
- ✅ **Compilation**: `npm run compile` and `npm run build` (webview) passed successfully.
- **Manual Verification**:
  - Validated that the Performance tab appears in the sidebar.
  - Validated that adding a suite sends the correct command to the backend.
  - Validated that running/stopping a suite triggers the correct backend commands.

## Next Steps
- Implement `PerformanceSuiteEditor` workspace component to allow editing suite details (requests, concurrency, SLA).
- Implement Drag & Drop reordering for requests.

### 4. Performance Workspace
- Created `PerformanceSuiteEditor` to configure test parameters:
  - Delay, Iterations, Concurrency, Warmup Runs.
  - List of requests with execution order.
- Updates to `WorkspaceLayout` to render the editor when a suite is selected.

### 5. Drag-and-Drop Request Reordering
Implemented native HTML5 drag-and-drop for reordering requests:
- Visual feedback: dragged items become semi-transparent, drop targets highlight with focus border
- Reorder logic updates the `order` property on each request
- Uses `DragHandle` styled component for clear drag affordance

---

## Phase 3: Execution & Results

### Progress Tracking
- Added `performanceProgress` state to `App.tsx` 
- Updated `useMessageHandler` to receive iteration updates from backend
- Progress bar displays in `PerformanceSuiteEditor` during runs

### Results Display
- Created `PerformanceResultsPanel.tsx` with:
  - Stats grid showing avg/min/max response times, percentiles (p50, p95, p99)
  - Success rate and SLA breach count metrics
  - Run history list with expandable details
- Filter history by selected suite

### Backend Integration
- Backend already emits `iterationComplete` and `runCompleted` events via `EventEmitter`
- `WebviewController` forwards events to webview
- Config already persists `performanceHistory` for display

---

## Phase 4: Export & Visualization

### CSV Export
- Created `ExportPerformanceResultsCommand` in backend
- Generates CSV with summary stats and individual results
- Uses VS Code save dialog for file location
- Added "Export CSV" button to `PerformanceResultsPanel`

### Visualization
- Added inline CSS bar chart showing avg response time per request
- Bars color-coded: orange if exceeding p95 threshold
- No external charting library required

---

## Phase 4b: Polish & Advanced Features

### Active Suite Highlighting
- Added `selectedSuiteId` prop to `SidebarPerformanceProps`
- `SuiteItem` in `PerformanceUi` now highlights when selected

### Loading Spinner
- Added animated `Loader` icon when suite is running
- Stop button shows `Square` icon alongside spinner

---

## Phase 5: CLI & Distributed Workers

### CLI Foundation
- Created `src/cli/index.ts` entry point using commander.js
- Added bin entry in `package.json`: `APInox` command
- Installed dependencies: `commander`, `chalk`, `cli-table3`, `ws`

### Commands Implemented
| Command | Description |
|---------|-------------|
| `run-suite <file>` | Run performance suite locally |
| `worker --connect <ws://url>` | Connect as distributed worker |
| `coordinator --suite <file>` | Headless coordinator for workers |
| `parse-wsdl <url>` | Parse WSDL for AI agents |
| `send-request` | Send single SOAP request |

### Output Formats
- JSON (default, machine-parseable for AI)
- Table (human-readable)
- CSV (for spreadsheets)

### Usage
```bash
# Run locally
npm run cli -- run-suite ./suite.json --format json

# Start coordinator
npm run cli -- coordinator --suite ./suite.json --port 8080 --workers 3

# Connect worker
npm run cli -- worker --connect ws://192.168.1.100:8080 --name worker-1
```

---

## Phase 6: Scheduling

### Data Model
- Added `PerformanceSchedule` interface to `src/models.ts`:
  - `cronExpression`, `enabled`, `lastRun`, `lastRunStatus`, `nextRun`

### ScheduleService
- Created `src/services/ScheduleService.ts`
- Uses `node-cron` for cron-based scheduling
- Loads saved schedules on extension startup
- Emits events for run completion

### Commands
- Created `src/commands/ScheduleCommands.ts`:
  - `getSchedules`, `addSchedule`, `updateSchedule`, `deleteSchedule`, `toggleSchedule`

### Persistence
- Added `updatePerformanceSchedules()` to `SettingsManager`
- Schedules saved to `performanceSchedules` in config

### UI (PerformanceSuiteEditor)
- Added "Scheduling" section with Calendar icon
- "Add Schedule" button reveals cron expression input
- Schedule list shows: cron expression, enabled/disabled toggle, last run time
- Toggle button (ToggleLeft/ToggleRight icons) to enable/disable
- Delete button to remove schedule

---

## Phase 7: Backport & Polish

### Unit Tests for State Sync
Created comprehensive test suites for backend services:

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `ScheduleService.test.ts` | 17 | CRUD, events, state sync |
| `PerformanceService.test.ts` | 18 | Suite/request management |

**Bugs Fixed During Testing:**
- Schedule ID collision: Added random suffix to prevent duplicate IDs
- Disabled schedules: Fixed tracking of disabled schedules in Map

### Test Reorganization
Moved tests into organized subfolders:
- `src/__tests__/services/` - PerformanceService, ScheduleService
- `src/__tests__/utils/` - WildcardProcessor
- `src/__tests__/parsers/` - WsdlParser, WsdlParser.integration

### Drag-Drop Reordering (Mock Rules)
- Added to `ServerTab.tsx` for mock rules list
- Includes GripVertical drag handle icon
- Visual drop target indicator (blue border top)
- Reordering saves to serverConfig.mockRules

### CSV Export
- Created `webview/src/utils/csvExport.ts` utility
- `toCSV()` - Generic array-to-CSV converter
- `downloadCSV()` - Triggers browser download
- `exportWatcherEvents()` - Typed export for watcher
- Added Download button to WatcherPanel header

### WSDL URL History Dropdown
- Converted URL input to `<datalist>` combo (type or select)
- Added 4 public SOAP services:
  - Country Info Service
  - Calculator Service  
  - Number Conversion
  - Temperature Converter
- URL history saved on load (last 10 entries)
- Props wired: App.tsx → Sidebar → WsdlExplorer

### Response Time Charts
- Created `ResponseTimeChart.tsx` SVG line chart component
- Shows avg response time (green), P95 (yellow), P99 (red)
- Grid lines, axis labels, legend included
- `statsToChartData()` helper for PerformanceRun arrays
- Integrated into PerformanceResultsPanel Run History section
- Displays trend over last 10 runs

### Summary Report Generation
- Created `webview/src/utils/reportGenerator.ts`
- `generateMarkdownReport()` - Full run report with:
  - Run info (status, times, duration)
  - Summary stats (requests, success rate, SLA breaches)
  - Response time analysis (avg, min, max, P50, P95, P99)
  - Request breakdown table
  - Failures list with errors
  - SLA breaches list
- `downloadMarkdownReport()` - Downloads as .md file
- Added "Export Report" button to PerformanceResultsPanel

### Import Requests from Workspace
- Created `webview/src/components/modals/ImportRequestsModal.tsx`
- Tree view of Projects → Interfaces → Operations → Requests
- Multi-select checkboxes with Select All
- "Import" button on PerformanceSuiteEditor toolbar
- Props wired: App.tsx → WorkspaceLayout → PerformanceSuiteEditor

### Project Selector Dialog (WSDL Explorer)
- Created `webview/src/components/modals/AddToProjectModal.tsx`
- Radio options: "Existing Project" (dropdown) or "New Project" (name input)
- Modified `useExplorer.ts`:
  - Added `pendingAddInterface` state for modal flow
  - Added `addInterfaceToNamedProject(iface, name, isNew)` function
  - `addToProject` now opens modal instead of direct add
- Wired in App.tsx with project list and handlers

### Reset Configuration Command
- Added `Dirty Soap: Reset Configuration (Hard Reset)` to Command Palette
- Shows modal confirmation dialog
- Recursively deletes `~/.APInox` directory
- Prompts to reload window upon completion

### Feature Fixes & Polish
- **Performance Suite Visibility**: Fixed an issue where requests appeared empty/read-only. Added data mapping between `requestBody` (Performance Model) and `request` (Editor Model).
- **Performance Suite Editing**: Implemented `handleRequestUpdate` wrapper to allow saving changes made to requests within a performance suite.
- **Performance Suite "Add Request" Dropdown**: Fixed "empty list" bug caused by stale project data. Updated handler to show specific saved requests and correctly add them to the suite (fixing "invisible added item" bug).
- **Performance Suite Persistence**: Fixed a critical bug where `PerformanceService` was not initialized with saved suites on startup, causing updates to fail or wipe data. Added initialization logic to `SoapPanel.ts`.
- **UI Responsiveness**: Implemented optimistic UI updates in `useMessageHandler` to ensure added requests appear instantly in the list, independent of backend sync latency.











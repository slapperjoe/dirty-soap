# Dirty SOAP CLI & Distributed Workers Architecture

## Overview

A standalone CLI for Dirty SOAP that enables:
1. **AI/Agent Integration** - Machine-readable JSON output for Copilot/automation
2. **Distributed Performance Testing** - Multiple workers coordinated by VS Code or headless CLI
3. **CI/CD Integration** - Run tests in pipelines without VS Code

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension (Coordinator/Master)                     │
│  ┌─────────────────────────────────────────────────────────┐
│  │  User Interface                                         │
│  │  • Configure suites, view results, manage workers       │
│  └─────────────────────────────────────────────────────────┘
│  ┌─────────────────────────────────────────────────────────┐
│  │  WebSocket Server (port 8080)                           │
│  │  • Accept worker connections                            │
│  │  • Distribute work packets                              │
│  │  • Aggregate results                                    │
│  └────────────────────┬────────────────────────────────────┘
└────────────────────────┼────────────────────────────────────┘
                         │ WebSocket (JSON messages)
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ CLI Worker 1 │  │ CLI Worker 2 │  │ CLI Worker N │
│ APInox   │  │ APInox   │  │ APInox   │
│ worker       │  │ worker       │  │ worker       │
│ --connect    │  │ --connect    │  │ --connect    │
│ ws://host    │  │ ws://host    │  │ ws://host    │
└──────────────┘  └──────────────┘  └──────────────┘
   Machine A         Machine B         Docker/VM
```

---

## CLI Commands

### `APInox run-suite`
Run a performance suite locally (single machine).

```bash
APInox run-suite ./suite.json [options]

Options:
  --iterations <n>     Override iteration count
  --concurrency <n>    Override concurrency level
  --format <type>      Output format: json, table, csv (default: json)
  --output <file>      Write results to file
  --quiet              Suppress progress, output only final result
```

**Example:**
```bash
$ APInox run-suite ./my-suite.json --format json
{
  "status": "completed",
  "duration": 12500,
  "summary": {
    "totalRequests": 100,
    "successRate": 0.98,
    "avgResponseTime": 145,
    "p95": 320,
    "p99": 450
  },
  "results": [...]
}
```

---

### `APInox worker`
Connect to a coordinator as a distributed worker.

```bash
APInox worker --connect <ws://host:port> [options]

Options:
  --name <name>        Worker identifier (default: hostname)
  --max-concurrent <n> Max concurrent requests (default: 10)
```

**Example:**
```bash
$ APInox worker --connect ws://192.168.1.100:8080 --name worker-1
[worker-1] Connected to coordinator
[worker-1] Waiting for work...
[worker-1] Received: iterations 1-25 of "API Performance Suite"
[worker-1] Executing...
[worker-1] Completed 25 iterations, avg 145ms
```

---

### `APInox coordinator`
Run as headless coordinator (for CI/CD, no VS Code needed).

```bash
APInox coordinator --suite <file> [options]

Options:
  --port <port>        WebSocket port (default: 8080)
  --workers <n>        Wait for N workers before starting
  --timeout <ms>       Worker connection timeout
  --format <type>      Output format: json, table
```

**Example:**
```bash
$ APInox coordinator --suite ./suite.json --port 8080 --workers 3
[coordinator] WebSocket server listening on :8080
[coordinator] Waiting for 3 workers...
[coordinator] Worker "worker-1" connected (1/3)
[coordinator] Worker "worker-2" connected (2/3)
[coordinator] Worker "worker-3" connected (3/3)
[coordinator] Starting distributed run...
[coordinator] Completed: 300 iterations across 3 workers
{
  "status": "completed",
  "workers": 3,
  "summary": {...}
}
```

---

### `APInox parse-wsdl`
Parse WSDL and output schema (for AI agents to understand available operations).

```bash
APInox parse-wsdl <url-or-file> [options]

Options:
  --format <type>      Output format: json, yaml
  --output <file>      Write to file
```

---

### `APInox send-request`
Send a single SOAP request (for quick testing/AI agents).

```bash
APInox send-request [options]

Options:
  --endpoint <url>     SOAP endpoint URL
  --action <action>    SOAPAction header
  --body <xml/file>    Request body (inline XML or @file.xml)
  --header <k=v>       Additional headers (repeatable)
  --format <type>      Output format: json, xml
```

---

## WebSocket Protocol

### Message Types

```typescript
// Worker → Coordinator
interface WorkerMessage {
  type: 'register' | 'result' | 'error' | 'heartbeat';
  workerId: string;
  timestamp: number;
  payload: any;
}

// Coordinator → Worker
interface CoordinatorMessage {
  type: 'work' | 'stop' | 'config' | 'ack';
  payload: any;
}

// Work Assignment
interface WorkPacket {
  suiteId: string;
  suiteName: string;
  requests: PerformanceRequest[];
  iterations: { start: number; end: number };
  config: {
    delayBetweenRequests: number;
    concurrency: number;
  };
}

// Result Streaming
interface ResultPacket {
  iteration: number;
  requestId: string;
  duration: number;
  status: number;
  success: boolean;
  timestamp: number;
}
```

---

## File Structure

```
src/
├── cli/                          # CLI entry point
│   ├── index.ts                  # Main CLI with commander.js
│   ├── commands/
│   │   ├── run-suite.ts          # Local suite execution
│   │   ├── worker.ts             # Worker mode
│   │   ├── coordinator.ts        # Headless coordinator
│   │   ├── parse-wsdl.ts         # WSDL parsing
│   │   └── send-request.ts       # Single request
│   ├── output/
│   │   └── formatters.ts         # JSON, table, CSV formatters
│   └── protocol/
│       └── messages.ts           # WebSocket message types
│
├── services/                     # Shared with extension
│   ├── PerformanceService.ts     # Core execution logic
│   ├── SoapClient.ts             # SOAP client
│   └── DistributedService.ts     # NEW: Coordinator logic
│
└── extension.ts                  # VS Code extension entry
```

---

## Implementation Phases

### Phase 5a: CLI Foundation
- [ ] Set up CLI with commander.js
- [ ] Implement `run-suite` command
- [ ] Add JSON/table/CSV output formatters
- [ ] Build standalone binary with pkg or esbuild

### Phase 5b: Worker Mode
- [ ] Implement WebSocket client in CLI
- [ ] Add `worker` command with connection logic
- [ ] Result streaming back to coordinator

### Phase 5c: Coordinator Mode
- [ ] Add WebSocket server to VS Code extension
- [ ] Implement work distribution algorithm
- [ ] Add worker management UI in Performance tab
- [ ] Implement headless `coordinator` CLI command

### Phase 5d: AI/Agent Polish
- [ ] Ensure all output is machine-parseable JSON
- [ ] Add `--quiet` mode for automation
- [ ] Document CLI for LLM usage
- [ ] Add examples for common AI agent patterns

---

## AI/Agent Usage Examples

### Copilot Integration
```bash
# Agent can parse WSDL to understand API
$ APInox parse-wsdl https://api.example.com/service?wsdl --format json

# Agent can run performance tests and analyze
$ APInox run-suite ./suite.json --quiet --format json | jq '.summary'

# Agent can send ad-hoc requests
$ APInox send-request --endpoint https://api.example.com/soap \
  --action "http://example.com/DoSomething" \
  --body @request.xml --format json
```

### CI/CD Pipeline
```yaml
# GitHub Actions example
- name: Run Performance Tests
  run: |
    APInox run-suite ./perf-suite.json --format json > results.json
    
- name: Check SLA
  run: |
    P95=$(jq '.summary.p95' results.json)
    if [ $P95 -gt 500 ]; then
      echo "SLA breach: p95 = ${P95}ms > 500ms"
      exit 1
    fi
```

---

## Dependencies

```json
{
  "commander": "^11.x",     // CLI argument parsing
  "ws": "^8.x",             // WebSocket (already in project)
  "cli-table3": "^0.6.x",   // Table output
  "chalk": "^5.x"           // Colored output
}
```

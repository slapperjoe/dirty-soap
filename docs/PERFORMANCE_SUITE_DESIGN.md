# Performance Suite Design & Intent

## Overview
The Performance Suite in APInox is designed to provide lightweight LOAD and PERFORMANCE testing capabilities specifically for SOAP web services. Unlike the functional testing focus of the `Test Case` system, the Performance Suite focuses on executing sequences of requests under varying load conditions (concurrency, repetitions) to measure response times, stability, and SLA compliance.

## Core Intent
1.  **Isolation**: Performance tests are distinct from functional tests. While functional tests verify logic (assertions, complex flows), performance tests focus on metrics (latency, throughput, error rates).
2.  **Simplicity**: The model is kept flat and simple (`PerformanceRequest[]`) to ensure low overhead during high-frequency execution loops.
3.  **Reuse**: Users can import requests from functional Test Cases, but once imported, they become independent `PerformanceRequest` objects optimized for the runner.

## Data Architecture

### Performance Suite
The root container for a performance test configuration.
- **Identity**: `id`, `name`, `description`.
- **Configuration**:
  - `iterations`: Total number of times the full sequence runs.
  - `concurrency`: Number of parallel execution threads (virtual users).
  - `warmupRuns`: Initial runs discarded from statistics to allow JVM/IIS warming.
  - `delayBetweenRequests`: Fixed sleep time between requests.
- **Content**:
  - `requests`: An ordered array of `PerformanceRequest` objects. NOTE: This is a flat list, unlike the nested `SoapTestStep` structure.

### Performance Request
An individual execution unit within a suite.
- **Identity**: `id`, `name`.
- **Request Definition**: `endpoint`, `method`, `soapAction`, `requestBody`, `headers`.
- **Logic**:
  - `extractors`: rules to pull data (like session IDs) from responses to feed subsequent requests in the loop.
  - `slaThreshold`: Maximum acceptable response time (ms).
- **Ordering**: `order` field determines execution sequence.

## Execution Logic (`PerformanceService`)

The execution engine (`PerformanceService`) is optimized for loops:
1.  **Sequential Mode** (`concurrency: 1`):
    - Iterates through `requests` in order.
    - Waits for `delayBetweenRequests`.
    - Repeats for `iterations`.
2.  **Parallel Mode** (`concurrency > 1`):
    - Splits the workload into chunks or concurrent promises.
    - Executes the full request sequence for each "virtual user".

### Variable Handling
Variables extracted via `XPath` from one request are stored in a run-scoped context map and injected into subsequent request bodies using `${variableName}` syntax. This allows for dynamic workflows (e.g., Login -> GetToken -> QueryData).

## System Components

- **Frontend**:
  - `PerformanceSuiteEditor`: A specialized view for configuring load parameters and reordering requests via drag-and-drop.
  - `PerformanceResults`: Visualization of run history, including average/min/max/p95 response times.
- **Backend**:
  - `PerformanceService`: Core runner logic.
  - `ScheduleService`: (Separate Service) Manages cron-based execution triggers for automated performance health checks.

## Current State (Post-Revert)
The system currently operates on the `PerformanceRequest` model.
- **Pros**: Simple, stable, preserves existing data structure.
- **Cons**: Lacks the rich editing capabilities of the functional Test Step editor (e.g., complex assertions, visual XML editing) because it uses a simplified request model.
- **Next Steps (Proposal)**: To bridge the gap, we aim to build an *adapter* that allows the rich `MonacoRequestEditor` to transparently edit `PerformanceRequest` objects without forcing the underlying data model to change into `SoapTestStep`.

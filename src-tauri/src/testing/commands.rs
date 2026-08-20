/// Tauri Commands for Testing
/// 
/// Frontend-facing commands for test execution
use serde::{Deserialize, Serialize};
use crate::testing::frontend_types::FrontendTestCase;
use crate::testing::{TestRunner, TestCase, TestStepResult};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use once_cell::sync::Lazy;

/// Request accepted from the webview for running a single test case.
/// Field names match the TypeScript/camelCase format sent by bridge.ts.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTestCaseRequest {
    pub test_case: FrontendTestCase,
    pub variables: Option<HashMap<String, String>>,
    #[serde(default)]
    pub stream: bool,
    pub fallback_endpoint: Option<String>,
}

/// Response for a streaming run — returns a run ID for polling.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunTestCaseResponse {
    pub run_id: Option<String>,
    pub passed: Option<bool>,
    pub duration_ms: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TestSuite {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub test_cases: Vec<TestCase>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RunTestSuiteRequest {
    pub test_suite: TestSuite,
    pub variables: Option<HashMap<String, String>>,
    #[serde(default)]
    pub stream: bool,
}

#[derive(Debug, Serialize)]
pub struct RunTestSuiteResponse {
    pub run_id: Option<String>,
    pub passed: Option<bool>,
    pub results: Option<Vec<TestCaseRunResult>>,
}

#[derive(Debug, Serialize, Clone)]
pub struct TestCaseRunResult {
    pub test_case_name: String,
    pub passed: bool,
    pub step_results: Vec<TestStepResult>,
    pub duration_ms: u64,
}

#[derive(Debug, Clone)]
struct TestRunData {
    updates: Vec<serde_json::Value>,
    done: bool,
    error: Option<String>,
}

// Global test run store for streaming updates
static TEST_RUN_STORE: Lazy<Arc<Mutex<HashMap<String, TestRunData>>>> = 
    Lazy::new(|| Arc::new(Mutex::new(HashMap::new())));

/// Execute a test case.
///
/// When `stream = true` (the default from the webview), the command spawns a
/// background task and immediately returns a `run_id` that the frontend uses to
/// poll `get_test_run_updates` for per-step progress events.
#[tauri::command]
pub async fn run_test_case(request: RunTestCaseRequest) -> Result<RunTestCaseResponse, String> {
    log::info!("[run_test_case] Starting: '{}' (stream={})", request.test_case.name, request.stream);

    if request.stream {
        // --- Streaming mode ---
        let run_id = format!(
            "tc-{}-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
        );

        TEST_RUN_STORE.lock().unwrap().insert(
            run_id.clone(),
            TestRunData { updates: Vec::new(), done: false, error: None },
        );

        let run_id_clone = run_id.clone();
        let test_case = request.test_case;
        let fallback_endpoint = request.fallback_endpoint;
        let initial_vars: HashMap<String, serde_json::Value> = request
            .variables
            .unwrap_or_default()
            .into_iter()
            .map(|(k, v)| (k, serde_json::Value::String(v)))
            .collect();

        let tc_handle = tokio::spawn(async move {
            use crate::testing::frontend_runner::run_step;

            let case_id = test_case.id.clone();

            // Emit testCaseStart
            push_update(&run_id_clone, serde_json::json!({
                "type": "testCaseStart",
                "id": case_id
            }));

            let mut context = initial_vars;
            let mut all_passed = true;

            for step in &test_case.steps {
                let step_id = step.id.clone();

                // Emit stepStart
                push_update(&run_id_clone, serde_json::json!({
                    "type": "stepStart",
                    "caseId": case_id,
                    "stepId": step_id
                }));

                match run_step(step, fallback_endpoint.as_deref(), &mut context).await {
                    Ok(result) => {
                        // Merge extracted variables into context for next steps
                        for (k, v) in &result.extracted_variables {
                            context.insert(k.clone(), serde_json::Value::String(v.clone()));
                        }

                        let update_type = if result.passed { "stepPass" } else { "stepFail" };
                        if !result.passed {
                            all_passed = false;
                        }

                        push_update(&run_id_clone, serde_json::json!({
                            "type": update_type,
                            "caseId": case_id,
                            "stepId": step_id,
                            "response": {
                                "rawResponse": result.response_body,
                                "duration": result.duration_ms,
                                "statusCode": result.status_code
                            },
                            "assertionResults": result.assertion_results,
                            "error": result.error
                        }));

                        if !result.passed {
                            break; // Stop on first failure
                        }
                    }
                    Err(e) => {
                        all_passed = false;
                        push_update(&run_id_clone, serde_json::json!({
                            "type": "stepFail",
                            "caseId": case_id,
                            "stepId": step_id,
                            "error": e.to_string()
                        }));
                        break;
                    }
                }
            }

            log::info!("[run_test_case] '{}' {} (streamed)",
                test_case.name, if all_passed { "PASSED" } else { "FAILED" });

            mark_done(&run_id_clone);
        });
        tokio::spawn(async move {
            if let Err(e) = tc_handle.await {
                log::error!("[testing] Test case runner background task panicked: {:?}", e);
            }
        });

        Ok(RunTestCaseResponse {
            run_id: Some(run_id),
            passed: None,
            duration_ms: None,
        })
    } else {
        // --- Synchronous mode (not used by webview but kept for completeness) ---
        use crate::testing::frontend_runner::run_step;

        let start = std::time::Instant::now();
        let mut context: HashMap<String, serde_json::Value> = request
            .variables
            .unwrap_or_default()
            .into_iter()
            .map(|(k, v)| (k, serde_json::Value::String(v)))
            .collect();

        let mut all_passed = true;
        for step in &request.test_case.steps {
            match run_step(step, request.fallback_endpoint.as_deref(), &mut context).await {
                Ok(result) => {
                    for (k, v) in &result.extracted_variables {
                        context.insert(k.clone(), serde_json::Value::String(v.clone()));
                    }
                    if !result.passed {
                        all_passed = false;
                        break;
                    }
                }
                Err(e) => {
                    return Err(format!("Step failed: {}", e));
                }
            }
        }

        let duration_ms = start.elapsed().as_millis() as u64;
        log::info!("[run_test_case] '{}' {} ({}ms)",
            request.test_case.name,
            if all_passed { "PASSED" } else { "FAILED" },
            duration_ms);

        Ok(RunTestCaseResponse {
            run_id: None,
            passed: Some(all_passed),
            duration_ms: Some(duration_ms),
        })
    }
}

fn push_update(run_id: &str, update: serde_json::Value) {
    if let Ok(mut store) = TEST_RUN_STORE.lock() {
        if let Some(run) = store.get_mut(run_id) {
            run.updates.push(update);
        }
    }
}

fn mark_done(run_id: &str) {
    if let Ok(mut store) = TEST_RUN_STORE.lock() {
        if let Some(run) = store.get_mut(run_id) {
            run.done = true;
        }
    }
}

/// Execute a test suite (multiple test cases)
#[tauri::command]
pub async fn run_test_suite(request: RunTestSuiteRequest) -> Result<RunTestSuiteResponse, String> {
    log::info!("Running test suite: {} ({} test cases, stream={})", 
        request.test_suite.name, 
        request.test_suite.test_cases.len(),
        request.stream
    );
    
    if request.stream {
        // Streaming mode - run in background and return run ID
        let run_id = format!("run-{}-{}", 
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis(),
            uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
        );
        
        let run_data = TestRunData {
            updates: Vec::new(),
            done: false,
            error: None,
        };
        
        TEST_RUN_STORE.lock().unwrap().insert(run_id.clone(), run_data);
        
        let run_id_clone = run_id.clone();
        let suite = request.test_suite;
        let initial_vars = request.variables.clone();
        
        // Spawn background task
        let ts_handle = tokio::spawn(async move {
            let mut runner = TestRunner::new();
            
            // Set initial variables
            if let Some(vars) = initial_vars {
                for (key, value) in vars {
                    runner.set_variable(key, value);
                }
            }
            
            for test_case in &suite.test_cases {
                let start = std::time::Instant::now();
                
                match runner.run_test_case(test_case).await {
                    Ok(result) => {
                        let duration_ms = start.elapsed().as_millis() as u64;
                        
                        let update = serde_json::json!({
                            "type": "testCaseComplete",
                            "testCaseName": test_case.name,
                            "passed": result.passed,
                            "stepResults": result.step_results,
                            "durationMs": duration_ms,
                        });
                        
                        if let Ok(mut store) = TEST_RUN_STORE.lock() {
                            if let Some(run) = store.get_mut(&run_id_clone) {
                                run.updates.push(update);
                            }
                        }
                    },
                    Err(e) => {
                        log::error!("Test case {} failed: {}", test_case.name, e);
                        
                        if let Ok(mut store) = TEST_RUN_STORE.lock() {
                            if let Some(run) = store.get_mut(&run_id_clone) {
                                run.error = Some(format!("Test case {} failed: {}", test_case.name, e));
                                run.done = true;
                            }
                        }
                        break;
                    }
                }
            }
            
            // Mark as complete
            if let Ok(mut store) = TEST_RUN_STORE.lock() {
                if let Some(run) = store.get_mut(&run_id_clone) {
                    run.done = true;
                }
            }
            
            log::info!("Test suite completed (streamed): {}", suite.name);
        });
        tokio::spawn(async move {
            if let Err(e) = ts_handle.await {
                log::error!("[testing] Test suite runner background task panicked: {:?}", e);
            }
        });
        
        Ok(RunTestSuiteResponse {
            run_id: Some(run_id),
            passed: None,
            results: None,
        })
    } else {
        // Synchronous mode - run all and return results
        let mut runner = TestRunner::new();
        let mut results = Vec::new();
        let mut all_passed = true;
        
        // Set initial variables
        if let Some(vars) = request.variables {
            for (key, value) in vars {
                runner.set_variable(key, value);
            }
        }
        
        for test_case in &request.test_suite.test_cases {
            let start = std::time::Instant::now();
            
            match runner.run_test_case(test_case).await {
                Ok(result) => {
                    let duration_ms = start.elapsed().as_millis() as u64;
                    let passed = result.passed;
                    
                    results.push(TestCaseRunResult {
                        test_case_name: test_case.name.clone(),
                        passed,
                        step_results: result.step_results,
                        duration_ms,
                    });
                    
                    if !passed {
                        all_passed = false;
                    }
                },
                Err(e) => {
                    log::error!("Test case {} failed: {}", test_case.name, e);
                    return Err(format!("Test case {} failed: {}", test_case.name, e));
                }
            }
        }
        
        log::info!("Test suite completed: {} ({})", 
            request.test_suite.name,
            if all_passed { "PASSED" } else { "FAILED" }
        );
        
        Ok(RunTestSuiteResponse {
            run_id: None,
            passed: Some(all_passed),
            results: Some(results),
        })
    }
}

/// Get test run updates (for streaming mode)
#[tauri::command]
pub async fn get_test_run_updates(
    run_id: String,
    from_index: Option<usize>,
) -> Result<TestRunUpdatesResponse, String> {
    let from_idx = from_index.unwrap_or(0);
    
    let mut store = TEST_RUN_STORE.lock().unwrap();
    
    if let Some(run) = store.get(&run_id) {
        let safe_index = from_idx.min(run.updates.len());
        let updates: Vec<serde_json::Value> = run.updates[safe_index..].to_vec();
        let next_index = safe_index + updates.len();
        let done = run.done;
        let error = run.error.clone();
        
        // Clean up completed runs
        if done && next_index >= run.updates.len() {
            store.remove(&run_id);
        }
        
        Ok(TestRunUpdatesResponse {
            updates,
            next_index,
            done,
            error,
        })
    } else {
        Ok(TestRunUpdatesResponse {
            updates: Vec::new(),
            next_index: from_idx,
            done: true,
            error: Some("Run not found".to_string()),
        })
    }
}

#[derive(Debug, Serialize)]
pub struct TestRunUpdatesResponse {
    pub updates: Vec<serde_json::Value>,
    pub next_index: usize,
    pub done: bool,
    pub error: Option<String>,
}

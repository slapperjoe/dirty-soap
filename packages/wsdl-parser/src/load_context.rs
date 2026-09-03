//! R-11 (F-10) + R-12 (F-23): shared state for one in-flight unified load.
//!
//! A `LoadContext` bundles the two pieces of state a single WSDL load must
//! coordinate across the many HTTP fetches it performs (the top-level document
//! plus every `<wsdl:import>` / `<xsd:import>` / `<xsd:include>`):
//!
//! * **Proxy (R-12):** an optional proxy URL applied to every fetch in the
//!   load. `None` = direct connections (the default the legacy path relies on).
//! * **Cancel (R-11):** a shared `Arc<AtomicBool>` flag. The command layer
//!   keeps an `Arc<LoadContext>` in a global registry keyed by the webview's
//!   `loadId`; `cancel()` flips the flag and every fetch checks it
//!   cooperatively (before starting, and once the connection has been made),
//!   aborting with a `WsdlLoadCancelled` error at the next check.
//!
//! The *same* cancel flag is shared by the top-level resolver and every
//! resolver `WsdlParser::parse_with_imports_ctx` builds internally, so one
//! cancel aborts the whole load, not just the first document.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use anyhow::Result;

use crate::imports::ImportResolver;

#[derive(Clone)]
pub struct LoadContext {
    cancel: Arc<AtomicBool>,
    proxy_url: Option<String>,
}

impl LoadContext {
    /// Create a context with the given proxy (`None` = direct connection) and a
    /// fresh (uncancelled) flag.
    pub fn new(proxy_url: Option<String>) -> Self {
        Self {
            cancel: Arc::new(AtomicBool::new(false)),
            proxy_url,
        }
    }

    /// The proxy URL for this load, if any.
    pub fn proxy_url(&self) -> Option<&str> {
        self.proxy_url.as_deref()
    }

    /// R-11: signal the load to stop. Idempotent; safe to call when nothing is
    /// in flight.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// True once `cancel()` has been called.
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Build an `ImportResolver` that shares this context's proxy and cancel
    /// flag, so a single cancel aborts every fetch in the load.
    pub fn resolver(&self) -> Result<ImportResolver> {
        ImportResolver::new_shared(self.proxy_url.as_deref(), self.cancel.clone())
    }
}

impl Default for LoadContext {
    fn default() -> Self {
        Self::new(None)
    }
}

/// WSDL/XSD Import Resolution
/// 
/// Handles fetching and parsing remote WSDL/XSD files referenced via:
/// - `<xsd:import>` - Cross-namespace schema imports
/// - `<xsd:include>` - Same-namespace schema includes
/// - `<wsdl:import>` - WSDL definition imports
/// 
/// Features:
/// - Recursive import resolution (handles deep import chains)
/// - Circular dependency detection (prevents infinite loops)
/// - URL caching (avoids duplicate fetches)
/// - Relative URL resolution (handles relative paths)
/// - Namespace merging (combines type registries)
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use anyhow::{Result, Context, anyhow};
use async_recursion::async_recursion;
use quick_xml::Reader;
use quick_xml::events::Event;
use url::Url;

use super::schema::{SchemaParser, SchemaDefinition};

/// Import resolver that fetches and parses remote WSDL/XSD files
#[allow(dead_code)] // schema_registry field reserved for future use
pub struct ImportResolver {
    /// HTTP client for fetching remote documents
    http_client: reqwest::Client,

    /// Cache of fetched documents (URL → XML content)
    document_cache: HashMap<String, String>,

    /// Set of URLs currently being processed (circular detection)
    visiting: HashSet<String>,

    /// Set of URLs already processed (avoid re-processing)
    visited: HashSet<String>,

    /// Merged schema registry (namespace → schema definition)
    schema_registry: HashMap<String, SchemaDefinition>,

    /// R-11 (F-10): cancellation flag for the in-flight fetch. Set by
    /// `cancel()` (via the shared `Arc`) so a cooperative check in
    /// `fetch_document` aborts the load as soon as the next fetch is about to
    /// start. Shared by reference so the caller can flip it from another task.
    cancel: Arc<AtomicBool>,
}

impl ImportResolver {
    /// Create a new import resolver (no proxy — direct connections).
    pub fn new() -> Result<Self> {
        Self::new_with_proxy(None)
    }

    /// Create a new import resolver, optionally routing all remote fetches
    /// through the given proxy URL (e.g. `http://host:port`).
    ///
    /// R-12 (F-23): the unified explorer's "Use proxy" toggle on a WSDL load
    /// routes the fetch through the app's proxy so environments that only
    /// reach WSDLs via a proxy can still load them. `None` (the default)
    /// preserves the direct-connection behaviour the legacy path relies on.
    pub fn new_with_proxy(proxy_url: Option<&str>) -> Result<Self> {
        Self::build_with(proxy_url, Arc::new(AtomicBool::new(false)))
    }

    /// Create a resolver that shares the given cancel flag with other
    /// resolvers in the same load (R-11). The top-level `parse_wsdl` resolver
    /// and every resolver `WsdlParser::parse_with_imports_ctx` builds all
    /// share one `Arc<AtomicBool>`, so a single cancel aborts the whole load.
    pub fn new_shared(
        proxy_url: Option<&str>,
        cancel: Arc<AtomicBool>,
    ) -> Result<Self> {
        Self::build_with(proxy_url, cancel)
    }

    /// Internal constructor: build the HTTP client (proxy-aware) and the
    /// resolver state, given a shared cancel flag.
    fn build_with(
        proxy_url: Option<&str>,
        cancel: Arc<AtomicBool>,
    ) -> Result<Self> {
        let mut builder = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(30));

        if let Some(proxy) = proxy_url
            .filter(|p| !p.trim().is_empty())
        {
            let proxy = reqwest::Proxy::all(proxy)
                .with_context(|| format!("Invalid proxy URL: {}", proxy))?;
            builder = builder.proxy(proxy);
        }

        let http_client = builder.build().context("Failed to create HTTP client")?;

        Ok(Self {
            http_client,
            document_cache: HashMap::new(),
            visiting: HashSet::new(),
            visited: HashSet::new(),
            schema_registry: HashMap::new(),
            cancel,
        })
    }

    /// R-11 (F-10): signal the in-flight load to stop. The fetch path checks
    /// this flag before each network read (and after it completes), so an
    /// active load aborts at the next cooperative point with a
    /// `WsdlLoadCancelled` error. Idempotent and safe to call when nothing is
    /// in flight.
    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
    }

    /// True once `cancel()` has been called on this resolver.
    pub fn is_cancelled(&self) -> bool {
        self.cancel.load(Ordering::SeqCst)
    }

    /// Fetch a remote document (WSDL or XSD)
    /// 
    /// # Arguments
    /// * `url` - The URL to fetch (can be absolute or relative)
    /// * `base_url` - The base URL for resolving relative paths (optional)
    /// 
    /// # Returns
    /// The XML content of the fetched document
    pub async fn fetch_document(&mut self, url: &str, base_url: Option<&str>) -> Result<String> {
        // R-11 (F-10): cooperative cancellation — a load cancelled via
        // `cancel()` (wired to the webview's "cancel load" button through the
        // command layer) aborts here before starting the fetch.
        if self.is_cancelled() {
            return Err(anyhow!("WsdlLoadCancelled"));
        }

        // Resolve URL (handle relative paths)
        let resolved_url = self.resolve_url(url, base_url)?;

        // Check cache first
        if let Some(cached) = self.document_cache.get(&resolved_url) {
            log::debug!("Using cached document: {}", resolved_url);
            return Ok(cached.clone());
        }

        // Check for circular dependency
        if self.visiting.contains(&resolved_url) {
            return Err(anyhow!("Circular import detected: {}", resolved_url));
        }

        log::info!("Fetching document: {}", resolved_url);

        // Mark as visiting
        self.visiting.insert(resolved_url.clone());

        // Handle file:// URLs by reading from disk
        let content = if resolved_url.starts_with("file://") {
            let file_path = resolved_url
                .strip_prefix("file://")
                .unwrap_or(&resolved_url);
            std::fs::read_to_string(file_path)
                .with_context(|| format!("Failed to read local file: {}", file_path))?
        } else {
            let response = self.http_client
                .get(&resolved_url)
                .send()
                .await
                .with_context(|| format!("Failed to fetch {}", resolved_url))?;

            // R-11 (F-10): check again once the connection has been made, so a
            // cancel that lands during the handshake is still honored before
            // we download the (potentially large) body.
            if self.is_cancelled() {
                return Err(anyhow!("WsdlLoadCancelled"));
            }

            if !response.status().is_success() {
                return Err(anyhow!(
                    "Failed to fetch {}: HTTP {}",
                    resolved_url,
                    response.status()
                ));
            }

            response
                .text()
                .await
                .with_context(|| format!("Failed to read response body from {}", resolved_url))?
        };

        // Cache the result
        self.document_cache.insert(resolved_url.clone(), content.clone());

        // Mark as visited and remove from visiting
        self.visiting.remove(&resolved_url);
        self.visited.insert(resolved_url);

        Ok(content)
    }

    /// Resolve a URL (handle relative paths)
    /// 
    /// # Arguments
    /// * `url` - The URL to resolve (can be absolute or relative)
    /// * `base_url` - The base URL for resolving relative paths (optional)
    /// 
    /// # Returns
    /// The absolute URL
    fn resolve_url(&self, url: &str, base_url: Option<&str>) -> Result<String> {
        // Try parsing as absolute URL first
        if let Ok(parsed) = Url::parse(url) {
            return Ok(parsed.to_string());
        }

        // If relative, need base URL
        let base = base_url.ok_or_else(|| anyhow!("Relative URL without base: {}", url))?;
        let base_parsed = Url::parse(base)
            .context(format!("Invalid base URL: {}", base))?;

        // Join relative URL with base
        let resolved = base_parsed.join(url)
            .context(format!("Failed to resolve relative URL: {} from base: {}", url, base))?;

        Ok(resolved.to_string())
    }

    /// Parse import declarations from WSDL/schema XML
    /// 
    /// Supports:
    /// - `<wsdl:import namespace="..." location="..."/>` - Import another WSDL
    /// - `<xsd:import namespace="..." schemaLocation="..."/>` - Import schema
    /// - `<xsd:include schemaLocation="..."/>` - Include schema
    ///
    /// Returns a list of import declarations
    pub fn parse_imports(xml: &str) -> Result<Vec<ImportDeclaration>> {
        let mut imports = Vec::new();
        let mut reader = Reader::from_str(xml);
        reader.trim_text(true);

        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Empty(e)) => {
                    let name_bytes = e.name();
                    let tag_name = String::from_utf8_lossy(name_bytes.as_ref());
                    let local_name = tag_name.split(':').next_back().unwrap_or(&tag_name);

                    match local_name {
                        "import" => {
                            // Could be <xsd:import> or <wsdl:import>
                            let is_wsdl_import = tag_name.starts_with("wsdl:") || tag_name.starts_with("w:");

                            let mut namespace = None;
                            let mut location = None;

                            for attr in e.attributes().flatten() {
                                let key = String::from_utf8_lossy(attr.key.as_ref());
                                let value = String::from_utf8_lossy(&attr.value).to_string();

                                match key.as_ref() {
                                    "namespace" => namespace = Some(value),
                                    "schemaLocation" => location = Some(value), // xsd:import
                                    "location" => location = Some(value),       // wsdl:import
                                    _ => {}
                                }
                            }

                            if let Some(loc) = location {
                                imports.push(ImportDeclaration {
                                    import_type: if is_wsdl_import {
                                        ImportType::WsdlImport
                                    } else {
                                        ImportType::SchemaImport
                                    },
                                    namespace,
                                    location: loc,
                                });
                            }
                        }
                        "include" => {
                            // <xsd:include schemaLocation="..."/>
                            let schema_location = e.attributes()
                                .filter_map(|a| a.ok())
                                .find(|a| {
                                    let key = String::from_utf8_lossy(a.key.as_ref());
                                    key == "schemaLocation"
                                })
                                .map(|a| String::from_utf8_lossy(&a.value).to_string());

                            if let Some(location) = schema_location {
                                imports.push(ImportDeclaration {
                                    import_type: ImportType::SchemaInclude,
                                    namespace: None,
                                    location,
                                });
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow!("XML parse error: {}", e)),
                _ => {}
            }
            buf.clear();
        }

        Ok(imports)
    }

    /// Resolve all imports in a schema recursively
    /// 
    /// # Arguments
    /// * `schema_xml` - The schema XML content
    /// * `base_url` - The base URL of the schema (for resolving relative imports)
    /// * `target_namespace` - The target namespace of the schema
    /// * `max_depth` - Maximum recursion depth (prevents runaway imports)
    /// 
    /// # Returns
    /// A merged schema definition with all imported types
    pub async fn resolve_schema_imports(
        &mut self,
        schema_xml: &str,
        base_url: &str,
        target_namespace: &str,
        max_depth: usize,
    ) -> Result<SchemaDefinition> {
        self.resolve_schema_imports_recursive(schema_xml, base_url, target_namespace, 0, max_depth).await
    }

    /// Internal recursive import resolution
    #[async_recursion]
    async fn resolve_schema_imports_recursive(
        &mut self,
        schema_xml: &str,
        base_url: &str,
        target_namespace: &str,
        depth: usize,
        max_depth: usize,
    ) -> Result<SchemaDefinition> {
        // Check recursion depth — warn and return a partial schema rather than
        // failing the entire parse, since the visited-set already prevents true
        // infinite loops.
        if depth > max_depth {
            log::warn!(
                "Import depth limit ({}) reached for namespace '{}'; skipping further imports at this branch",
                max_depth,
                target_namespace
            );
            return SchemaParser::parse_schema(schema_xml, target_namespace)
                .map_err(|e| anyhow!("Schema parse error at depth limit: {}", e));
        }

        log::debug!("Resolving imports at depth {}/{} for namespace: {}", depth, max_depth, target_namespace);

        // Parse the base schema
        let mut schema = SchemaParser::parse_schema(schema_xml, target_namespace)?;

        // Find all imports in this schema
        let imports = Self::parse_imports(schema_xml)?;

        log::debug!("Found {} imports at depth {}", imports.len(), depth);

        // Process each import
        for import in imports {
            log::debug!("Processing import: {:?}", import);

            // Resolve the URL before fetching so we can check for cycles
            let resolved_url = match self.resolve_url(&import.location, Some(base_url)) {
                Ok(u) => u,
                Err(e) => {
                    log::warn!("Could not resolve import URL '{}': {}", import.location, e);
                    continue;
                }
            };

            // Skip already-processed schemas to prevent circular import loops.
            // We mark a URL as visited *before* recursing so that any schema
            // that imports us back (A→B→A) is detected on the return trip.
            if self.visited.contains(&resolved_url) {
                log::debug!("Skipping already-processed schema (cycle or duplicate): {}", resolved_url);
                continue;
            }
            self.visited.insert(resolved_url.clone());

            // Fetch the imported document (uses cache if already fetched)
            let imported_xml = self.fetch_document(&import.location, Some(base_url)).await?;

            // Determine the namespace for the imported schema
            let imported_namespace = if let Some(ref ns) = import.namespace {
                ns.to_string()
            } else {
                target_namespace.to_string()
            };

            // Recursively resolve imports in the imported schema
            let imported_schema = self.resolve_schema_imports_recursive(
                &imported_xml,
                &resolved_url, // Use resolved URL as new base URL
                &imported_namespace,
                depth + 1,
                max_depth,
            ).await?;

            // Merge the imported schema into the base schema
            schema = self.merge_schemas(schema, imported_schema)?;
        }

        Ok(schema)
    }

    /// Merge two schemas together
    fn merge_schemas(&self, mut base: SchemaDefinition, imported: SchemaDefinition) -> Result<SchemaDefinition> {
        log::debug!("Merging schemas: base has {} elements, {} complexTypes, {} simpleTypes; imported has {} elements, {} complexTypes, {} simpleTypes",
            base.elements.len(), base.complex_types.len(), base.simple_types.len(),
            imported.elements.len(), imported.complex_types.len(), imported.simple_types.len());

        // Merge elements (imported types override base if duplicate)
        for (name, element) in imported.elements {
            base.elements.insert(name, element);
        }

        // Merge complex types
        for (name, complex_type) in imported.complex_types {
            base.complex_types.insert(name, complex_type);
        }

        // Merge simple types
        for (name, simple_type) in imported.simple_types {
            base.simple_types.insert(name, simple_type);
        }

        log::debug!("Merged schema has {} elements, {} complexTypes, {} simpleTypes",
            base.elements.len(), base.complex_types.len(), base.simple_types.len());

        Ok(base)
    }

    /// Get all cached documents
    ///
    /// Returns a reference to the document cache (URL → XML content)
    pub fn get_all_documents(&self) -> &HashMap<String, String> {
        &self.document_cache
    }
}

/// Type of import declaration
#[derive(Debug, Clone, PartialEq)]
pub enum ImportType {
    /// <xsd:import> - Cross-namespace schema import
    SchemaImport,
    /// <xsd:include> - Same-namespace schema include
    SchemaInclude,
    /// <wsdl:import> - WSDL definition import
    WsdlImport,
}

/// Represents an import or include declaration
#[derive(Debug, Clone)]
pub struct ImportDeclaration {
    /// Type of import
    pub import_type: ImportType,
    /// Target namespace (for imports, None for includes)
    pub namespace: Option<String>,
    /// Schema location (URL or relative path)
    pub location: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_imports() {
        let schema_xml = r#"
            <schema xmlns="http://www.w3.org/2001/XMLSchema">
                <import namespace="http://example.com/types" schemaLocation="http://example.com/types.xsd"/>
                <include schemaLocation="common.xsd"/>
            </schema>
        "#;

        let imports = ImportResolver::parse_imports(schema_xml).unwrap();

        assert_eq!(imports.len(), 2);

        assert_eq!(imports[0].import_type, ImportType::SchemaImport);
        assert_eq!(imports[0].namespace, Some("http://example.com/types".to_string()));
        assert_eq!(imports[0].location, "http://example.com/types.xsd");

        assert_eq!(imports[1].import_type, ImportType::SchemaInclude);
        assert_eq!(imports[1].namespace, None);
        assert_eq!(imports[1].location, "common.xsd");
    }

    #[test]
    fn test_resolve_url() {
        let resolver = ImportResolver::new().unwrap();

        // Absolute URL
        let resolved = resolver.resolve_url("http://example.com/schema.xsd", None).unwrap();
        assert_eq!(resolved, "http://example.com/schema.xsd");

        // Relative URL with base
        let resolved = resolver.resolve_url("types.xsd", Some("http://example.com/service.wsdl")).unwrap();
        assert_eq!(resolved, "http://example.com/types.xsd");

        // Relative URL with query params (WCF style)
        let resolved = resolver.resolve_url("?xsd=xsd1", Some("http://example.com/Service.svc?wsdl")).unwrap();
        assert_eq!(resolved, "http://example.com/Service.svc?xsd=xsd1");
    }
}

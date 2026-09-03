//! Core WSDL parser implementation
//! 
//! Parses WSDL 1.1 XML documents and extracts service definitions.

use super::types::{ApiService, ServiceOperation};
use super::schema::{SchemaParser, SchemaDefinition};
use anyhow::Result;
use quick_xml::events::{Event, BytesStart};
use quick_xml::Reader;
use std::collections::HashMap;

/// Internal WSDL structures (not exported)
#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlDefinitions {
    target_namespace: String,
    namespaces: HashMap<String, String>,
    services: HashMap<String, WsdlService>,
    bindings: HashMap<String, WsdlBinding>,
    port_types: HashMap<String, WsdlPortType>,
    messages: HashMap<String, WsdlMessage>,
    schemas: Vec<SchemaDefinition>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlService {
    name: String,
    ports: HashMap<String, WsdlPort>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlPort {
    name: String,
    binding: String,
    location: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlBinding {
    name: String,
    port_type: String,
    soap_version: String,
    operations: HashMap<String, WsdlBindingOperation>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlBindingOperation {
    name: String,
    soap_action: String,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlPortType {
    name: String,
    operations: HashMap<String, WsdlOperation>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlOperation {
    name: String,
    input_message: String,
    output_message: String,
}

#[derive(Debug, Clone)]
struct WsdlMessage {
    name: String,
    parts: Vec<WsdlMessagePart>,
}

#[derive(Debug, Clone)]
#[allow(dead_code)] // Internal parsing structures
struct WsdlMessagePart {
    name: String,
    element: Option<String>,
    type_name: Option<String>,
}

/// WSDL Parser
/// 
/// Parses WSDL 1.1 documents into structured service definitions.
/// 
/// # Example
/// ```no_run
/// # use apinox_wsdl_parser::WsdlParser;
/// # fn main() -> Result<(), Box<dyn std::error::Error>> {
/// let wsdl_xml = std::fs::read_to_string("service.wsdl")?;
/// let services = WsdlParser::parse(&wsdl_xml)?;
///
/// for service in services {
///     println!("Service: {}", service.name);
///     for operation in service.operations {
///         println!("  Operation: {}", operation.name);
///     }
/// }
/// # Ok(())
/// # }
/// ```
pub struct WsdlParser;

impl WsdlParser {
    /// Parse a WSDL document from XML string
    /// 
    /// # Arguments
    /// * `wsdl_xml` - The WSDL XML content as a string
    /// 
    /// # Returns
    /// Vector of `ApiService` structures representing the parsed services
    pub fn parse(wsdl_xml: &str) -> Result<Vec<ApiService>> {
        log::info!("Starting WSDL parse...");
        
        let definitions = Self::parse_definitions(wsdl_xml)?;
        let api_services = Self::build_api_services(&definitions)?;
        
        log::info!("Successfully parsed {} services", api_services.len());
        Ok(api_services)
    }
    
    /// Parse a WSDL document with automatic import resolution
    /// 
    /// This method extends the basic parse() by automatically fetching and resolving
    /// all schema imports (<xsd:import>, <xsd:include>) found in the WSDL.
    /// 
    /// # Arguments
    /// * `wsdl_url` - The URL of the WSDL (used as base URL for resolving relative imports)
    /// * `wsdl_xml` - The WSDL XML content as a string
    /// * `max_import_depth` - Maximum depth for nested imports (prevents infinite recursion)
    /// 
    /// # Returns
    /// Vector of `ApiService` structures with fully resolved schemas
    /// 
    /// # Example
    /// ```no_run
    /// # use apinox_wsdl_parser::WsdlParser;
    /// # async fn example(wsdl_xml: &str) -> Result<(), anyhow::Error> {
    /// let services = WsdlParser::parse_with_imports(
    ///     "http://example.com/Service.svc?wsdl",
    ///     wsdl_xml,
    ///     10  // max 10 levels of nested imports
    /// ).await?;
    /// # Ok(())
    /// # }
    /// ```
    pub async fn parse_with_imports(
        wsdl_url: &str,
        wsdl_xml: &str,
        max_import_depth: usize,
    ) -> Result<Vec<ApiService>> {
        Self::parse_with_imports_ctx(wsdl_url, wsdl_xml, max_import_depth, &crate::load_context::LoadContext::default()).await
    }

    /// `parse_with_imports` with an explicit [`LoadContext`] (R-11 + R-12).
    ///
    /// The context supplies the proxy URL (R-12) and the shared cancel flag
    /// (R-11) that every fetch in the load — the top-level document *and* all
    /// `<wsdl:import>` / `<xsd:import>` / `<xsd:include>` fetches — honours.
    /// `parse_with_imports` is a thin wrapper around this with a default
    /// (no-proxy, never-cancelled) context, so existing callers are unchanged.
    pub async fn parse_with_imports_ctx(
        wsdl_url: &str,
        wsdl_xml: &str,
        max_import_depth: usize,
        ctx: &crate::load_context::LoadContext,
    ) -> Result<Vec<ApiService>> {
        log::info!("Starting WSDL parse with import resolution from: {}", wsdl_url);
        
        // Check for WSDL imports first
        let all_imports = super::imports::ImportResolver::parse_imports(wsdl_xml)?;
        let wsdl_imports: Vec<_> = all_imports.iter()
            .filter(|i| matches!(i.import_type, super::imports::ImportType::WsdlImport))
            .collect();
        
        let mut merged_wsdl = wsdl_xml.to_string();
        
        // If there are wsdl:import declarations, fetch and merge them
        if !wsdl_imports.is_empty() {
            log::info!("Found {} WSDL imports, fetching...", wsdl_imports.len());
            
            let mut resolver = ctx.resolver()?;
            
            // Fetch all WSDL imports
            for import_decl in &wsdl_imports {
                log::info!("Fetching WSDL import: {}", import_decl.location);
                resolver.fetch_document(&import_decl.location, Some(wsdl_url)).await?;
            }
            
            // Merge imported WSDL files into the main WSDL
            for import_decl in &wsdl_imports {
                if let Some(imported_wsdl) = resolver.get_all_documents().get(&import_decl.location) {
                    log::info!("Merging WSDL import: {}", import_decl.location);
                    merged_wsdl = Self::merge_wsdl_definitions(&merged_wsdl, imported_wsdl)?;
                }
            }
        }
        
        // Parse the merged WSDL structure
        let mut definitions = Self::parse_definitions(&merged_wsdl)?;
        
        // Now handle schema imports
        if !definitions.schemas.is_empty() {
            log::info!("Found {} schemas in WSDL, checking for imports...", definitions.schemas.len());
            
            // Create import resolver (shares the load's proxy + cancel flag)
            let mut resolver = ctx.resolver()?;
            
            // Extract schema sections from merged WSDL
            log::info!("Extracting schema sections from WSDL...");
            let schema_sections = Self::extract_schema_sections(&merged_wsdl)?;
            log::info!("Extracted {} schema sections", schema_sections.len());
            
            for (i, schema_xml) in schema_sections.iter().enumerate() {
                if i >= definitions.schemas.len() {
                    break;
                }
                
                log::info!("Processing schema {} of {}", i + 1, definitions.schemas.len());
                let schema = &definitions.schemas[i];
                
                // Check for imports in this schema section
                let imports = super::imports::ImportResolver::parse_imports(schema_xml)?;
                let schema_imports: Vec<_> = imports.iter()
                    .filter(|i| !matches!(i.import_type, super::imports::ImportType::WsdlImport))
                    .collect();
                
                log::info!("Schema {} has {} imports", i + 1, schema_imports.len());
                
                if !schema_imports.is_empty() {
                    log::info!("Found {} schema imports in namespace: {}", 
                        schema_imports.len(), schema.target_namespace);
                    
                    // Resolve all imports recursively
                    let resolved_schema = resolver.resolve_schema_imports(
                        schema_xml,
                        wsdl_url,
                        &schema.target_namespace,
                        max_import_depth,
                    ).await?;
                    
                    // Merge resolved types into the schema
                    let mut_schema = &mut definitions.schemas[i];
                    mut_schema.elements.extend(resolved_schema.elements);
                    mut_schema.complex_types.extend(resolved_schema.complex_types);
                    mut_schema.simple_types.extend(resolved_schema.simple_types);
                    
                    log::info!("Merged: {} elements, {} complexTypes, {} simpleTypes total",
                        mut_schema.elements.len(), 
                        mut_schema.complex_types.len(), 
                        mut_schema.simple_types.len());
                }
            }
            
            log::info!("Schema processing complete");
        }
        
        // Build API services with enriched schemas
        log::info!("Building API services from definitions...");
        let api_services = Self::build_api_services(&definitions)?;
        
        log::info!("WSDL parse complete with imports. Found {} services", api_services.len());
        Ok(api_services)
    }
    
    
    /// Merge WSDL definitions from an imported WSDL file
    /// 
    /// Extracts <binding>, <portType>, and <message> elements from imported WSDL
    /// and inserts them into the main WSDL before the closing </definitions> tag.
    ///
    /// # Arguments
    /// * `main_wsdl` - The main WSDL XML string
    /// * `imported_wsdl` - The imported WSDL XML string
    ///
    /// # Returns
    /// The merged WSDL XML string
    fn merge_wsdl_definitions(main_wsdl: &str, imported_wsdl: &str) -> Result<String> {
        use quick_xml::events::Event;
        use quick_xml::Reader;
        
        log::debug!("Merging WSDL definitions...");
        
        // Extract elements to merge from imported WSDL
        let mut bindings = Vec::new();
        let mut port_types = Vec::new();
        let mut messages = Vec::new();
        
        let mut reader = Reader::from_str(imported_wsdl);
        reader.trim_text(true);
        let mut buf = Vec::new();
        let mut depth = 0;
        let mut current_type = String::new();
        let mut element_xml = String::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) => {
                    let name_bytes = e.name();
                    let name = String::from_utf8_lossy(name_bytes.as_ref());
                    let local_name = name.split(':').next_back().unwrap_or(&name);
                    
                    if depth == 0 {
                        match local_name {
                            "binding" => {
                                current_type = "binding".to_string();
                                element_xml = String::from_utf8_lossy(&buf).to_string();
                                depth = 1;
                            }
                            "portType" => {
                                current_type = "portType".to_string();
                                element_xml = String::from_utf8_lossy(&buf).to_string();
                                depth = 1;
                            }
                            "message" => {
                                current_type = "message".to_string();
                                element_xml = String::from_utf8_lossy(&buf).to_string();
                                depth = 1;
                            }
                            _ => {}
                        }
                    } else if depth > 0 {
                        element_xml.push_str(&String::from_utf8_lossy(&buf));
                        depth += 1;
                    }
                }
                Ok(Event::End(_)) if depth > 0 => {
                    element_xml.push_str(&String::from_utf8_lossy(&buf));
                    depth -= 1;
                    
                    if depth == 0 {
                        match current_type.as_str() {
                            "binding" => bindings.push(element_xml.clone()),
                            "portType" => port_types.push(element_xml.clone()),
                            "message" => messages.push(element_xml.clone()),
                            _ => {}
                        }
                        element_xml.clear();
                        current_type.clear();
                    }
                }
                Ok(Event::Empty(_)) | Ok(Event::Text(_)) if depth > 0 => {
                    element_xml.push_str(&String::from_utf8_lossy(&buf));
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow::anyhow!("XML parse error while merging: {}", e)),
                _ => {}
            }
            buf.clear();
        }
        
        log::debug!("Extracted {} messages, {} portTypes, {} bindings from imported WSDL",
            messages.len(), port_types.len(), bindings.len());
        
        // Find insertion point in main WSDL (before </definitions>)
        let mut result = main_wsdl.to_string();
        let insertion_point = result.rfind("</wsdl:definitions>")
            .or_else(|| result.rfind("</definitions>"))
            .ok_or_else(|| anyhow::anyhow!("No closing </definitions> tag found in main WSDL"))?;
        
        // Build insertion string
        let mut to_insert = String::new();
        for msg in messages {
            to_insert.push_str(&msg);
            to_insert.push('\n');
        }
        for pt in port_types {
            to_insert.push_str(&pt);
            to_insert.push('\n');
        }
        for binding in bindings {
            to_insert.push_str(&binding);
            to_insert.push('\n');
        }
        
        // Insert before </definitions>
        result.insert_str(insertion_point, &to_insert);
        
        log::debug!("Successfully merged WSDL definitions");
        Ok(result)
    }
    
    /// Extract raw schema sections from WSDL XML
    /// 
    /// Returns a vector of schema XML strings (one per <schema> element)
    fn extract_schema_sections(wsdl_xml: &str) -> Result<Vec<String>> {
        let mut schemas = Vec::new();
        let mut reader = Reader::from_str(wsdl_xml);
        reader.trim_text(true);
        let mut buf = Vec::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name_bytes = e.name();
                    let name = String::from_utf8_lossy(name_bytes.as_ref());
                    if name.ends_with("schema") || name.ends_with(":schema") {
                        // Extract this entire schema section as raw XML
                        let schema_xml = Self::extract_schema_xml_with_start(&mut reader, &e)?;
                        schemas.push(schema_xml);
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow::anyhow!("XML parse error: {}", e)),
                _ => {}
            }
            buf.clear();
        }
        
        Ok(schemas)
    }
    
    /// Extract raw XML content from a schema element (including the start tag)
    fn extract_schema_xml_with_start(reader: &mut Reader<&[u8]>, start: &BytesStart) -> Result<String> {
        let mut schema_xml = String::from("<schema");
        
        // Add all attributes from the schema start tag
        for attr in start.attributes().flatten() {
            let key = String::from_utf8_lossy(attr.key.as_ref());
            let value = String::from_utf8_lossy(&attr.value);
            schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
        }
        schema_xml.push('>');
        
        let mut depth = 1;
        let mut buf = Vec::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    schema_xml.push_str(&format!("<{}", tag_name));
                    
                    // Add attributes
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref());
                        let value = String::from_utf8_lossy(&attr.value);
                        schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
                    }
                    schema_xml.push('>');
                    depth += 1;
                }
                Ok(Event::End(e)) => {
                    depth -= 1;
                    if depth == 0 {
                        schema_xml.push_str("</schema>");
                        break;
                    }
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    schema_xml.push_str(&format!("</{}>", tag_name));
                }
                Ok(Event::Empty(e)) => {
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    schema_xml.push_str(&format!("<{}", tag_name));
                    
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref());
                        let value = String::from_utf8_lossy(&attr.value);
                        schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
                    }
                    schema_xml.push_str("/>");
                }
                Ok(Event::Text(e)) => {
                    schema_xml.push_str(&String::from_utf8_lossy(&e));
                }
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        Ok(schema_xml)
    }

    fn parse_definitions(xml: &str) -> Result<WsdlDefinitions> {
        let mut reader = Reader::from_str(xml);
        reader.trim_text(true);
        
        let mut target_namespace = String::new();
        let mut namespaces = HashMap::new();
        let mut buf = Vec::new();
        
        // Pass 1: Get root namespaces
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) if Self::local_name(&e) == "definitions" => {
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
                        let value = String::from_utf8_lossy(&attr.value).to_string();
                        
                        if key == "targetNamespace" {
                            target_namespace = value;
                        } else if let Some(prefix) = key.strip_prefix("xmlns:") {
                            namespaces.insert(prefix.to_string(), value);
                        }
                    }
                    break;
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow::anyhow!("XML parse error: {}", e)),
                _ => {}
            }
            buf.clear();
        }
        
        log::debug!("Target namespace: {}", target_namespace);
        
        // Pass 2: Parse all definitions
        let mut reader = Reader::from_str(xml);
        reader.trim_text(true);
        buf.clear();
        
        let mut services = HashMap::new();
        let mut bindings = HashMap::new();
        let mut port_types = HashMap::new();
        let mut messages = HashMap::new();
        let mut schemas = Vec::new();
        
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name = Self::local_name(&e);
                    
                    match name.as_str() {
                        "service" => {
                            let mut service_buf = Vec::new();
                            if let Some(service) = Self::parse_service(&mut reader, &e, &mut service_buf)? {
                                services.insert(service.name.clone(), service);
                            }
                        }
                        "binding" => {
                            let mut binding_buf = Vec::new();
                            if let Some(binding) = Self::parse_binding(&mut reader, &e, &mut binding_buf)? {
                                bindings.insert(binding.name.clone(), binding);
                            }
                        }
                        "portType" => {
                            let mut pt_buf = Vec::new();
                            if let Some(pt) = Self::parse_port_type(&mut reader, &e, &mut pt_buf)? {
                                port_types.insert(pt.name.clone(), pt);
                            }
                        }
                        "message" => {
                            let mut msg_buf = Vec::new();
                            if let Some(msg) = Self::parse_message(&mut reader, &e, &mut msg_buf)? {
                                messages.insert(msg.name.clone(), msg);
                            }
                        }
                        "schema" => {
                            if let Some(schema) = Self::parse_schema_section(&mut reader, &e, &mut Vec::new())? {
                                schemas.push(schema);
                            }
                        }
                        _ => {}
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow::anyhow!("XML parse error: {}", e)),
                _ => {}
            }
            buf.clear();
        }
        
        log::debug!("Parsed: {} services, {} bindings, {} portTypes, {} messages, {} schemas",
            services.len(), bindings.len(), port_types.len(), messages.len(), schemas.len());
        
        Ok(WsdlDefinitions {
            target_namespace,
            namespaces,
            services,
            bindings,
            port_types,
            messages,
            schemas,
        })
    }
    
    fn parse_schema_section(reader: &mut Reader<&[u8]>, start: &BytesStart, _buf: &mut Vec<u8>) -> Result<Option<SchemaDefinition>> {
        let target_ns = Self::get_attr(start, "targetNamespace").unwrap_or_default();
        
        // Extract the entire schema section as a string
        let mut schema_xml = String::new();
        schema_xml.push_str(&format!("<schema targetNamespace=\"{}\"", target_ns));
        
        // Add other attributes from the schema element
        for attr in start.attributes().flatten() {
            let key = String::from_utf8_lossy(attr.key.as_ref());
            if key != "targetNamespace" {
                let value = String::from_utf8_lossy(&attr.value);
                schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
            }
        }
        schema_xml.push('>');
        
        // Read schema content until end tag
        let mut depth = 1;
        let mut buf = Vec::new();
        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(e)) => {
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    schema_xml.push_str(&format!("<{}", tag_name));
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref());
                        let value = String::from_utf8_lossy(&attr.value);
                        schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
                    }
                    schema_xml.push('>');
                    depth += 1;
                }
                Ok(Event::End(e)) => {
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    depth -= 1;
                    if depth == 0 {
                        schema_xml.push_str("</schema>");
                        break;
                    }
                    schema_xml.push_str(&format!("</{}>", tag_name));
                }
                Ok(Event::Empty(e)) => {
                    let name_bytes = e.name();
                    let tag_name_full = String::from_utf8_lossy(name_bytes.as_ref());
                    let tag_name = tag_name_full.split(':').next_back().unwrap_or(&tag_name_full);
                    schema_xml.push_str(&format!("<{}", tag_name));
                    for attr in e.attributes().flatten() {
                        let key = String::from_utf8_lossy(attr.key.as_ref());
                        let value = String::from_utf8_lossy(&attr.value);
                        schema_xml.push_str(&format!(" {}=\"{}\"", key, value));
                    }
                    schema_xml.push_str("/>");
                }
                Ok(Event::Text(e)) => {
                    schema_xml.push_str(&String::from_utf8_lossy(&e));
                }
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        // Parse the extracted schema XML
        log::debug!("Schema XML length: {} bytes", schema_xml.len());
        log::debug!("Schema XML preview: {}", &schema_xml.chars().take(500).collect::<String>());
        
        match SchemaParser::parse_schema(&schema_xml, &target_ns) {
            Ok(schema) => Ok(Some(schema)),
            Err(e) => {
                log::error!("Failed to parse schema XML. Error: {}", e);
                log::error!("Schema XML (first 1000 chars): {}", &schema_xml.chars().take(1000).collect::<String>());
                Ok(None)
            }
        }
    }

    fn parse_service(reader: &mut Reader<&[u8]>, start: &BytesStart, buf: &mut Vec<u8>) -> Result<Option<WsdlService>> {
        let name = Self::get_attr(start, "name")?;
        let mut ports = HashMap::new();
        
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) if Self::local_name(&e) == "port" => {
                    let port_name = Self::get_attr(&e, "name")?;
                    let binding = Self::get_attr(&e, "binding")?;
                    let binding = Self::strip_namespace_prefix(&binding);
                    
                    let location = Self::parse_port_location(reader, buf)?;
                    
                    ports.insert(port_name.clone(), WsdlPort {
                        name: port_name,
                        binding,
                        location,
                    });
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("service") => break,
                Ok(Event::Eof) => break,
                Err(e) => return Err(anyhow::anyhow!("Parse error: {}", e)),
                _ => {}
            }
            buf.clear();
        }
        
        Ok(Some(WsdlService { name, ports }))
    }

    fn parse_port_location(reader: &mut Reader<&[u8]>, buf: &mut Vec<u8>) -> Result<String> {
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                    let name = Self::local_name(&e);
                    if name == "address" {
                        if let Ok(loc) = Self::get_attr(&e, "location") {
                            return Ok(loc);
                        }
                    }
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("port") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        Ok(String::new())
    }

    fn parse_binding(reader: &mut Reader<&[u8]>, start: &BytesStart, buf: &mut Vec<u8>) -> Result<Option<WsdlBinding>> {
        let name = Self::get_attr(start, "name")?;
        let port_type = Self::get_attr(start, "type")?;
        let port_type = Self::strip_namespace_prefix(&port_type);
        
        let mut soap_version = "1.1".to_string();
        let mut operations = HashMap::new();
        
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Start(e)) | Ok(Event::Empty(e)) => {
                    let local_name = Self::local_name(&e);
                    
                    // Check for soap12:binding element
                    if local_name == "binding" {
                        let name_bytes = e.name();
                        let full_name = String::from_utf8_lossy(name_bytes.as_ref()).to_string();
                        if full_name.contains("soap12:") {
                            soap_version = "1.2".to_string();
                        }
                    } else if local_name == "operation" {
                        let op_name = Self::get_attr(&e, "name")?;
                        let soap_action = Self::parse_operation_action(reader, buf)?;
                        operations.insert(op_name.clone(), WsdlBindingOperation {
                            name: op_name,
                            soap_action,
                        });
                    }
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("binding") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        Ok(Some(WsdlBinding {
            name,
            port_type,
            soap_version,
            operations,
        }))
    }

    fn parse_operation_action(reader: &mut Reader<&[u8]>, buf: &mut Vec<u8>) -> Result<String> {
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Empty(e)) | Ok(Event::Start(e)) if Self::local_name(&e) == "operation" => {
                    if let Ok(action) = Self::get_attr(&e, "soapAction") {
                        return Ok(action);
                    }
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("operation") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        Ok(String::new())
    }

    fn parse_port_type(reader: &mut Reader<&[u8]>, start: &BytesStart, buf: &mut Vec<u8>) -> Result<Option<WsdlPortType>> {
        let name = Self::get_attr(start, "name")?;
        let mut operations = HashMap::new();
        
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Start(e)) if Self::local_name(&e) == "operation" => {
                    let op_name = Self::get_attr(&e, "name")?;
                    let (input_msg, output_msg) = Self::parse_operation_messages(reader, buf)?;
                    operations.insert(op_name.clone(), WsdlOperation {
                        name: op_name,
                        input_message: input_msg,
                        output_message: output_msg,
                    });
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("portType") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        Ok(Some(WsdlPortType { name, operations }))
    }

    fn parse_operation_messages(reader: &mut Reader<&[u8]>, buf: &mut Vec<u8>) -> Result<(String, String)> {
        let mut input_msg = String::new();
        let mut output_msg = String::new();
        
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Empty(e)) | Ok(Event::Start(e)) => {
                    let name = Self::local_name(&e);
                    if name == "input" {
                        if let Ok(msg) = Self::get_attr(&e, "message") {
                            input_msg = Self::strip_namespace_prefix(&msg);
                        }
                    } else if name == "output" {
                        if let Ok(msg) = Self::get_attr(&e, "message") {
                            output_msg = Self::strip_namespace_prefix(&msg);
                        }
                    }
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("operation") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        Ok((input_msg, output_msg))
    }

    fn parse_message(reader: &mut Reader<&[u8]>, start: &BytesStart, buf: &mut Vec<u8>) -> Result<Option<WsdlMessage>> {
        let name = Self::get_attr(start, "name")?;
        let mut parts = Vec::new();
        
        loop {
            match reader.read_event_into(buf) {
                Ok(Event::Empty(e)) | Ok(Event::Start(e)) if Self::local_name(&e) == "part" => {
                    let part_name = Self::get_attr(&e, "name")?;
                    let element = Self::get_attr(&e, "element").ok().map(|e| Self::strip_namespace_prefix(&e));
                    let type_name = Self::get_attr(&e, "type").ok().map(|t| Self::strip_namespace_prefix(&t));
                    
                    parts.push(WsdlMessagePart {
                        name: part_name,
                        element,
                        type_name,
                    });
                }
                Ok(Event::End(e)) if String::from_utf8_lossy(e.name().as_ref()).ends_with("message") => break,
                Ok(Event::Eof) => break,
                _ => {}
            }
            buf.clear();
        }
        
        Ok(Some(WsdlMessage { name, parts }))
    }

    fn build_api_services(defs: &WsdlDefinitions) -> Result<Vec<ApiService>> {
        let mut services = Vec::new();
        
        // Group ports by binding to create separate services for SOAP 1.1 and 1.2
        for (service_name, wsdl_service) in &defs.services {
            let mut bindings_map: HashMap<String, (Vec<String>, String)> = HashMap::new(); // binding_name -> (ports, soap_version)
            
            // First pass: group ports by binding
            for (port_name, wsdl_port) in &wsdl_service.ports {
                if let Some(binding) = defs.bindings.get(&wsdl_port.binding) {
                    bindings_map
                        .entry(wsdl_port.binding.clone())
                        .or_insert_with(|| (Vec::new(), binding.soap_version.clone()))
                        .0
                        .push(port_name.clone());
                }
            }
            
            // Second pass: create a separate service for each binding
            for (binding_name, (ports, soap_version)) in bindings_map {
                let binding = match defs.bindings.get(&binding_name) {
                    Some(b) => b,
                    None => continue,
                };
                
                let port_type = match defs.port_types.get(&binding.port_type) {
                    Some(pt) => pt,
                    None => continue,
                };
                
                let mut operations = Vec::new();
                
                // Get the first port's location for the endpoint
                log::debug!("Looking for endpoint with binding: {}", binding_name);
                log::debug!("Available ports: {:?}", wsdl_service.ports.keys().collect::<Vec<_>>());
                
                let endpoint = wsdl_service.ports.iter()
                    .find(|(port_name, p)| {
                        log::debug!("Checking port '{}': binding={}", port_name, p.binding);
                        p.binding == binding_name
                    })
                    .map(|(_, p)| {
                        log::debug!("Found matching port with location: {}", p.location);
                        p.location.clone()
                    });
                
                if endpoint.is_none() {
                    log::warn!("No endpoint found for binding: {}", binding_name);
                }
                
                for (op_name, operation) in &port_type.operations {
                    let soap_action = binding.operations.get(op_name).map(|bo| bo.soap_action.clone());
                    
                    // Build schema tree from input message
                    let full_schema = Self::build_schema_for_operation(operation, defs);
                    
                    log::debug!("Creating operation '{}' with endpoint: {:?}", op_name, endpoint);
                    
                    operations.push(ServiceOperation {
                        name: op_name.clone(),
                        input: Some(serde_json::json!({})),
                        output: serde_json::json!({}),
                        description: None,
                        target_namespace: Some(defs.target_namespace.clone()),
                        port_name: ports.first().cloned(),
                        original_endpoint: endpoint.clone(),
                        full_schema,
                        action: soap_action,
                    });
                }
                
                // Create service name with SOAP version suffix (like node-soap does)
                let service_name_with_version = if soap_version == "1.2" {
                    format!("{}Soap12", service_name)
                } else {
                    format!("{}Soap", service_name)
                };
                
                services.push(ApiService {
                    name: service_name_with_version,
                    ports,
                    operations,
                    target_namespace: Some(defs.target_namespace.clone()),
                });
            }
        }
        
        Ok(services)
    }
    
    fn build_schema_for_operation(operation: &WsdlOperation, defs: &WsdlDefinitions) -> Option<super::types::SchemaNode> {
        // Get the input message
        let message = defs.messages.get(&operation.input_message)?;
        
        // Get the first part
        let part = message.parts.first()?;
        
        // Try element-based lookup first
        if let Some(element_name) = &part.element {
            for schema in &defs.schemas {
                if let Some(schema_tree) = SchemaParser::build_schema_tree(element_name, schema) {
                    return Some(schema_tree);
                }
            }
        }
        
        // Fall back to type-based lookup for parts that use type="ns:SomeType" instead of element="ns:SomeElement"
        if let Some(type_name) = &part.type_name {
            for schema in &defs.schemas {
                if let Some(schema_tree) = SchemaParser::build_schema_tree_from_type(type_name, schema) {
                    return Some(schema_tree);
                }
            }
        }
        
        log::warn!("No schema found for operation '{}'", operation.name);
        None
    }

    // Utility functions
    fn local_name(e: &BytesStart) -> String {
        let name_bytes = e.name();
        let full_name = String::from_utf8_lossy(name_bytes.as_ref());
        let name_str = full_name.split(':').next_back().unwrap_or(&full_name);
        name_str.to_string()
    }

    fn get_attr(e: &BytesStart, name: &str) -> Result<String> {
        for attr in e.attributes().flatten() {
            let key = String::from_utf8_lossy(attr.key.as_ref());
            if key == name {
                return Ok(String::from_utf8_lossy(&attr.value).to_string());
            }
        }
        Err(anyhow::anyhow!("Attribute {} not found", name))
    }

    fn strip_namespace_prefix(name: &str) -> String {
        name.split(':').next_back().unwrap_or(name).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_wsdl() {
        let wsdl = r#"<?xml version="1.0"?>
<definitions name="HelloService"
             targetNamespace="http://example.com/hello"
             xmlns:tns="http://example.com/hello"
             xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns="http://schemas.xmlsoap.org/wsdl/">

  <message name="SayHelloRequest">
    <part name="name" type="xsd:string"/>
  </message>

  <message name="SayHelloResponse">
    <part name="greeting" type="xsd:string"/>
  </message>

  <portType name="HelloPortType">
    <operation name="sayHello">
      <input message="tns:SayHelloRequest"/>
      <output message="tns:SayHelloResponse"/>
    </operation>
  </portType>

  <binding name="HelloBinding" type="tns:HelloPortType">
    <soap:binding transport="http://schemas.xmlsoap.org/soap/http"/>
    <operation name="sayHello">
      <soap:operation soapAction="sayHello"/>
    </operation>
  </binding>

  <service name="HelloService">
    <port name="HelloPort" binding="tns:HelloBinding">
      <soap:address location="http://example.com/hello"/>
    </port>
  </service>
</definitions>"#;

        let services = WsdlParser::parse(wsdl).unwrap();
        assert_eq!(services.len(), 1);
        assert_eq!(services[0].name, "HelloServiceSoap");
        assert_eq!(services[0].operations.len(), 1);
        assert_eq!(services[0].operations[0].name, "sayHello");
    }

   #[test]
   fn test_parse_country_info_wsdl() {
       let wsdl = std::fs::read_to_string("../../src-tauri/wsdl-downloads/CountryInfoService_wso.wsdl").unwrap();
       let services = WsdlParser::parse(&wsdl).unwrap();

       // CountryInfoService WSDL should have services and operations
       assert!(!services.is_empty(), "Should parse at least one service");

       // Check the target namespace
       let service = &services[0];
       assert_eq!(service.operations.len(), 21, "Should have 21 operations");

       // Check one operation's schema
       let op = &service.operations[0];
       assert!(op.full_schema.is_some(), "Operation {} should have full_schema", op.name);
       assert!(op.target_namespace.is_some(), "Operation {} should have target_namespace", op.name);

       log::debug!("Operation {}: full_schema={:?}, target_namespace={:?}", op.name, op.full_schema.is_some(), op.target_namespace);

       // Verify first operation has a non-empty schema node
       if let Some(ref schema) = op.full_schema {
           assert!(!schema.name.is_empty(), "Schema node name should not be empty");
           log::debug!("Schema node name: {}, kind: {}, children_count: {:?}", schema.name, schema.kind, schema.children.as_ref().map(|c| c.len()));
       }
   }
}

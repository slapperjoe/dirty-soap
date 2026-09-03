//! # apinox-wsdl-parser
//!
//! A standalone WSDL 1.1 parser for SOAP web services.
//!
//! Parses WSDL files and extracts enough information for another application
//! to build a mock server, generate request envelopes, or explore service operations.
//!
//! ## Features
//!
//! - Parse WSDL 1.1 XML documents from strings or URLs
//! - Extract services, bindings, port types, and operations
//! - Resolve remote schema imports (`<xsd:import>`, `<xsd:include>`) recursively
//! - Build typed XSD schema trees for generating XML request bodies
//! - Detect SOAP 1.1 and SOAP 1.2 bindings
//! - Circular dependency protection during import resolution
//!
//! ## Quick Start
//!
//! ```no_run
//! use apinox_wsdl_parser::WsdlParser;
//!
//! # async fn example() -> Result<(), anyhow::Error> {
//! // Parse from a string
//! let wsdl_xml = std::fs::read_to_string("service.wsdl")?;
//! let services = WsdlParser::parse(&wsdl_xml)?;
//!
//! for service in &services {
//!     println!("Service: {} (namespace: {:?})", service.name, service.target_namespace);
//!     for op in &service.operations {
//!         println!("  Operation: {} -> endpoint: {:?}", op.name, op.original_endpoint);
//!     }
//! }
//!
//! // Parse from a URL with full import resolution
//! let services = WsdlParser::parse_with_imports(
//!     "http://example.com/Service.svc?wsdl",
//!     &wsdl_xml,
//!     10,
//! ).await?;
//! # Ok(())
//! # }
//! ```

pub mod imports;
pub mod load_context;
pub mod parser;
pub mod schema;
pub mod types;

pub use imports::{ImportDeclaration, ImportResolver, ImportType};
pub use load_context::LoadContext;
pub use parser::WsdlParser;
pub use types::{ApiService, SchemaNode, ServiceOperation};

//! WSDL Parser Library
//!
//! Re-exports from the standalone `apinox-wsdl-parser` crate.
//!
//! The WSDL parsing functionality lives in `packages/wsdl-parser` so it
//! can be reused by other applications (e.g. to build a mock server from
//! a WSDL file without depending on the full Tauri desktop app).

pub use apinox_wsdl_parser::{
    ApiService, ServiceOperation, SchemaNode,
    WsdlParser,
    ImportResolver, ImportDeclaration, ImportType,
    LoadContext,
};

// Re-export sub-modules so callers using `crate::parsers::wsdl::imports::...` continue to work.
pub mod imports {
    pub use apinox_wsdl_parser::imports::*;
}

pub mod types {
    pub use apinox_wsdl_parser::types::*;
}

pub mod schema {
    pub use apinox_wsdl_parser::schema::*;
}

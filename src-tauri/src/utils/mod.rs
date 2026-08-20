// Utilities module
// Common utility functions for regex extraction, XPath evaluation, wildcards, etc.

pub mod regex_extractor;
pub mod wildcard_processor;
pub mod xpath_evaluator;
pub mod body_reader;
pub mod config;
pub mod http;
pub mod template;

pub use regex_extractor::RegexExtractor;
pub use wildcard_processor::WildcardProcessor;
pub use xpath_evaluator::XPathEvaluator;
pub use body_reader::{read_body, SpooledBody};
pub use config::resolve_config_dir;
pub use http::{emit_traffic_event, match_pattern, CONTENT_TYPE_XML, CONTENT_TYPE_PLAIN};
pub use template::substitute_variables;

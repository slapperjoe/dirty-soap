/// SOAP Client
/// 
/// Executes SOAP requests with proper headers and response parsing
use anyhow::{Result, anyhow};
use reqwest::{Client, Proxy};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::sync::Arc;

use super::{EnvelopeBuilder, SoapVersion};
use super::ws_security::WsSecurityConfig;
use crate::parsers::wsdl::types::ServiceOperation;
use crate::http::client::{CancelToken, read_capped_body};

/// SOAP Fault information
#[derive(Debug, Clone)]
pub struct SoapFault {
    pub faultcode: String,
    pub faultstring: String,
    pub faultactor: Option<String>,
    pub detail: Option<String>,
}

/// SOAP Response
#[derive(Debug, Clone)]
pub struct SoapResponse {
    pub status_code: u16,
    pub headers: Vec<(String, String)>,
    pub body: Option<String>,
    pub fault: Option<SoapFault>,
    pub raw_xml: String,
    /// M5: true when the raw response body was truncated at RESPONSE_BODY_LIMIT.
    pub truncated: bool,
}

impl SoapResponse {
    /// Check if the response contains a SOAP Fault
    pub fn is_fault(&self) -> bool {
        self.fault.is_some()
    }
    
    /// Check if the response was successful (no fault)
    pub fn is_success(&self) -> bool {
        self.fault.is_none()
    }
}

/// SOAP Client for executing SOAP requests
pub struct SoapClient {
    http_client: Client,
    pub allow_invalid_certs: bool,
}

impl SoapClient {
    /// Create a new SOAP client (uses system env proxy if set)
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
            allow_invalid_certs: false,
        }
    }

    /// Create a SOAP client that routes all traffic through the given proxy URL.
    /// When `allow_invalid_certs` is true, disables certificate verification so
    /// HTTPS traffic can be intercepted (e.g. for MITM proxy debugging).
    pub fn with_proxy(proxy_url: &str, allow_invalid_certs: bool) -> Result<Self> {
        let proxy = Proxy::all(proxy_url)
            .map_err(|e| anyhow!("Invalid proxy URL '{}': {}", proxy_url, e))?;
        let mut builder = Client::builder()
            .proxy(proxy);
        if allow_invalid_certs {
            builder = builder.danger_accept_invalid_certs(true);
        }
        let client = builder
            .build()
            .map_err(|e| anyhow!("Failed to build proxy HTTP client: {}", e))?;
        Ok(Self { http_client: client, allow_invalid_certs })
    }

    /// Create a SOAP client with a custom HTTP client
    pub fn with_client(client: Client, allow_invalid_certs: bool) -> Self {
        Self {
            http_client: client,
            allow_invalid_certs,
        }
    }
    
    /// Execute a SOAP request, optionally supporting cancellation via the token.
    pub async fn execute_with_cancel(
        &self,
        operation: &ServiceOperation,
        soap_version: SoapVersion,
        values: std::collections::HashMap<String, String>,
        security: Option<WsSecurityConfig>,
        endpoint_override: Option<String>,
        content_type_override: Option<&str>,
        cancel_token: Option<Arc<CancelToken>>,
    ) -> Result<SoapResponse> {
        // Build the SOAP envelope
        let mut builder = EnvelopeBuilder::new(soap_version, operation.clone());

        for (path, value) in values {
            builder.set_value(&path, value);
        }

        if let Some(sec) = security {
            builder.set_security(sec);
        }

        let envelope = builder.build()?;

        // Determine endpoint
        let endpoint = endpoint_override
            .or_else(|| operation.original_endpoint.clone())
            .ok_or_else(|| anyhow!("No endpoint specified for operation"))?;

        // Prepare headers
        let content_type = content_type_override.unwrap_or_else(|| soap_version.content_type());
        let mut request = self.http_client
            .post(&endpoint)
            .header("Content-Type", content_type)
            .body(envelope.clone());

        // Add SOAPAction header for SOAP 1.1
        if soap_version == SoapVersion::Soap11 {
            let soap_action = operation.action.as_deref().unwrap_or("");
            request = request.header("SOAPAction", format!("\"{}\"", soap_action));
        }

        log::info!("Sending SOAP request to: {}", endpoint);
        log::debug!("Request headers:");
        log::debug!("  Content-Type: {}", content_type);
        if soap_version == SoapVersion::Soap11 {
            log::debug!("  SOAPAction: \"{}\"", operation.action.as_deref().unwrap_or(""));
        }
        log::info!("Request body:\n{}", envelope);

        let response = if let Some(ref token) = cancel_token {
            tokio::select! {
                res = request.send() => res?,
                _ = token.wait() => {
                    return Err(anyhow!("SOAP request cancelled"));
                }
            }
        } else {
            request.send().await?
        };

        let status_code = response.status().as_u16();
        let status_text = response.status().canonical_reason().unwrap_or("Unknown");

        let headers: Vec<(String, String)> = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        log::info!("Response: {} {}", status_code, status_text);
        log::debug!("Response headers:");
        for (k, v) in &headers {
            log::debug!("  {}: {}", k, v);
        }

        let (raw_xml, truncated) = read_capped_body(response).await;
        log::info!("Response body:\n{}", raw_xml);

        let (body, fault) = parse_soap_response(&raw_xml)?;

        Ok(SoapResponse {
            status_code,
            headers,
            body,
            fault,
            raw_xml,
            truncated,
        })
    }

    /// Execute a SOAP request
    /// 
    /// # Arguments
    /// * `operation` - The WSDL operation to execute
    /// * `soap_version` - SOAP 1.1 or 1.2
    /// * `values` - Field values for the request
    /// * `security` - Optional WS-Security configuration
    /// * `endpoint_override` - Optional endpoint URL (overrides operation.original_endpoint)
    /// * `content_type_override` - Optional Content-Type header (overrides the SOAP-version default)
    pub async fn execute(
        &self,
        operation: &ServiceOperation,
        soap_version: SoapVersion,
        values: std::collections::HashMap<String, String>,
        security: Option<WsSecurityConfig>,
        endpoint_override: Option<String>,
        content_type_override: Option<&str>,
    ) -> Result<SoapResponse> {
        self.execute_with_cancel(
            operation,
            soap_version,
            values,
            security,
            endpoint_override,
            content_type_override,
            None,
        )
        .await
    }

    /// Execute a SOAP request using a raw, pre-built XML envelope, with optional cancellation.
    pub async fn execute_raw_with_cancel(
        &self,
        raw_envelope: &str,
        soap_version: SoapVersion,
        endpoint: &str,
        soap_action: Option<&str>,
        content_type_override: Option<&str>,
        cancel_token: Option<Arc<CancelToken>>,
    ) -> Result<SoapResponse> {
        let content_type = content_type_override.unwrap_or_else(|| soap_version.content_type());

        let mut request = self.http_client
            .post(endpoint)
            .header("Content-Type", content_type)
            .body(raw_envelope.to_string());

        if soap_version == SoapVersion::Soap11 {
            let action = soap_action.unwrap_or("");
            request = request.header("SOAPAction", format!("\"{}\"", action));
        }

        log::info!("Sending raw SOAP request to: {}", endpoint);
        log::debug!("  Content-Type: {}", content_type);
        if soap_version == SoapVersion::Soap11 {
            log::debug!("  SOAPAction: \"{}\"", soap_action.unwrap_or(""));
        }
        log::info!("Request body:\n{}", raw_envelope);

        let response = if let Some(ref token) = cancel_token {
            tokio::select! {
                res = request.send() => res?,
                _ = token.wait() => {
                    return Err(anyhow!("SOAP request cancelled"));
                }
            }
        } else {
            request.send().await?
        };

        let status_code = response.status().as_u16();
        let status_text = response.status().canonical_reason().unwrap_or("Unknown");

        let headers: Vec<(String, String)> = response.headers()
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_str().unwrap_or("").to_string()))
            .collect();

        log::info!("Response: {} {}", status_code, status_text);

        let (raw_xml, truncated) = read_capped_body(response).await;
        log::info!("Response body:\n{}", raw_xml);

        let (body, fault) = parse_soap_response(&raw_xml)?;

        Ok(SoapResponse {
            status_code,
            headers,
            body,
            fault,
            raw_xml,
            truncated,
        })
    }

    /// Execute a SOAP request using a raw, pre-built XML envelope from the editor.
    ///
    /// All headers (Content-Type, SOAPAction) are derived the same way as `execute`,
    /// but the envelope is sent verbatim instead of being rebuilt by `EnvelopeBuilder`.
    pub async fn execute_raw(
        &self,
        raw_envelope: &str,
        soap_version: SoapVersion,
        endpoint: &str,
        soap_action: Option<&str>,
        content_type_override: Option<&str>,
    ) -> Result<SoapResponse> {
        self.execute_raw_with_cancel(
            raw_envelope,
            soap_version,
            endpoint,
            soap_action,
            content_type_override,
            None,
        )
        .await
    }
}

impl Default for SoapClient {
    fn default() -> Self {
        Self::new()
    }
}

/// Parse SOAP response and extract body or fault
fn parse_soap_response(xml: &str) -> Result<(Option<String>, Option<SoapFault>)> {
    let mut reader = Reader::from_str(xml);
    reader.trim_text(true);
    
    let mut buf = Vec::new();
    let mut in_body = false;
    let mut in_fault = false;
    let mut body_content = String::new();
    let mut body_depth = 0;
    
    // Fault fields
    let mut faultcode = String::new();
    let mut faultstring = String::new();
    let mut faultactor = None;
    let mut detail = None;
    
    let mut current_element = String::new();
    
    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                
                if name == "Body" {
                    in_body = true;
                    body_depth = 0;
                } else if in_body {
                    if body_depth == 0 && name == "Fault" {
                        in_fault = true;
                    } else if !in_fault {
                        // Capture body content
                        body_content.push('<');
                        body_content.push_str(&name);
                        
                        // Add attributes
                        for attr in e.attributes().flatten() {
                            body_content.push(' ');
                            body_content.push_str(&String::from_utf8_lossy(attr.key.as_ref()));
                            body_content.push_str("=\"");
                            body_content.push_str(&String::from_utf8_lossy(&attr.value));
                            body_content.push('"');
                        }
                        
                        body_content.push('>');
                    }
                    
                    body_depth += 1;
                    current_element = name;
                }
            }
            Ok(Event::End(e)) => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                
                if name == "Body" {
                    in_body = false;
                } else if in_body {
                    body_depth -= 1;
                    
                    if !in_fault {
                        body_content.push_str("</");
                        body_content.push_str(&name);
                        body_content.push('>');
                    }
                    
                    if body_depth == 0 && name == "Fault" {
                        in_fault = false;
                    }
                }
            }
            Ok(Event::Text(e)) if in_body && in_fault => {
                let text = e.unescape()?.to_string();
                match current_element.as_str() {
                    "faultcode" => faultcode = text,
                    "faultstring" => faultstring = text,
                    "faultactor" => faultactor = Some(text),
                    "detail" => detail = Some(text),
                    _ => {}
                }
            }
            Ok(Event::Text(e)) if in_body && !in_fault => {
                let text = e.unescape()?.to_string();
                body_content.push_str(&text);
            }
            Ok(Event::Text(_)) => {}
            Ok(Event::Empty(e)) if in_body && !in_fault => {
                let name = String::from_utf8_lossy(e.local_name().as_ref()).to_string();
                body_content.push('<');
                body_content.push_str(&name);
                
                // Add attributes
                for attr in e.attributes().flatten() {
                    body_content.push(' ');
                    body_content.push_str(&String::from_utf8_lossy(attr.key.as_ref()));
                    body_content.push_str("=\"");
                    body_content.push_str(&String::from_utf8_lossy(&attr.value));
                    body_content.push('"');
                }
                
                body_content.push_str("/>");
            }
            Ok(Event::Empty(_)) => {}
            Ok(Event::Eof) => break,
            Err(e) => return Err(anyhow!("Error parsing SOAP response: {}", e)),
            _ => {}
        }
        
        buf.clear();
    }
    
    let fault = if !faultcode.is_empty() {
        Some(SoapFault {
            faultcode,
            faultstring,
            faultactor,
            detail,
        })
    } else {
        None
    };
    
    let body = if !body_content.is_empty() {
        Some(body_content)
    } else {
        None
    };
    
    Ok((body, fault))
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_parse_successful_response() {
        let xml = r#"<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <GetUserResponse>
      <UserId>12345</UserId>
      <Name>John Doe</Name>
    </GetUserResponse>
  </soap:Body>
</soap:Envelope>"#;
        
        let (body, fault) = parse_soap_response(xml).unwrap();
        
        assert!(fault.is_none());
        assert!(body.is_some());
        
        let body = body.unwrap();
        assert!(body.contains("<GetUserResponse>"));
        assert!(body.contains("<UserId>12345</UserId>"));
        assert!(body.contains("<Name>John Doe</Name>"));
    }
    
    #[test]
    fn test_parse_fault_response() {
        let xml = r#"<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <soap:Fault>
      <faultcode>soap:Client</faultcode>
      <faultstring>Invalid credentials</faultstring>
      <faultactor>http://example.com/auth</faultactor>
      <detail>Username or password is incorrect</detail>
    </soap:Fault>
  </soap:Body>
</soap:Envelope>"#;
        
        let (body, fault) = parse_soap_response(xml).unwrap();
        
        assert!(body.is_none());
        assert!(fault.is_some());
        
        let fault = fault.unwrap();
        assert_eq!(fault.faultcode, "soap:Client");
        assert_eq!(fault.faultstring, "Invalid credentials");
        assert_eq!(fault.faultactor.as_deref(), Some("http://example.com/auth"));
        assert_eq!(fault.detail.as_deref(), Some("Username or password is incorrect"));
    }
    
    #[test]
    fn test_soap_response_helpers() {
        let success_response = SoapResponse {
            status_code: 200,
            headers: vec![],
            body: Some("<Response/>".to_string()),
            fault: None,
            raw_xml: "".to_string(),
            truncated: false,
        };
        
        assert!(success_response.is_success());
        assert!(!success_response.is_fault());
        
        let fault_response = SoapResponse {
            status_code: 500,
            headers: vec![],
            body: None,
            fault: Some(SoapFault {
                faultcode: "soap:Server".to_string(),
                faultstring: "Internal error".to_string(),
                faultactor: None,
                detail: None,
            }),
            raw_xml: "".to_string(),
            truncated: false,
        };
        
        assert!(!fault_response.is_success());
        assert!(fault_response.is_fault());
    }
}

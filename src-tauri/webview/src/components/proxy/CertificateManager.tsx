import React, { useState, useEffect } from 'react';
import { invokeTauriCommand } from '../../utils/bridge';
import { tokens } from './tokens';

interface CertInfo {
  exists: boolean;
  certPath: string;
  keyPath: string;
  subject?: string;
  issuer?: string;
  validFrom?: string;
  validTo?: string;
  fingerprint?: string;
  isTrusted: boolean;
}

interface TrustResult {
  success: boolean;
  message: string;
  firefoxNote: string;
  manualSteps: string[];
  certInfo: CertInfo;
}

export function CertificateManager() {
  const [certInfo, setCertInfo] = useState<CertInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [trustResult, setTrustResult] = useState<TrustResult | null>(null);
  const [genMessage, setGenMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    loadCertInfo();
  }, []);

  async function loadCertInfo() {
    try {
      const info = await invokeTauriCommand<CertInfo>('get_ca_certificate_info');
      setCertInfo(info);
    } catch (err: any) {
      console.error('Failed to load certificate info:', err);
      setCertInfo({ exists: false, certPath: '', keyPath: '', isTrusted: false });
    }
  }

  async function handleGenerate() {
    setLoading(true);
    setGenMessage(null);
    setTrustResult(null);
    try {
      await invokeTauriCommand('generate_ca_certificate');
      setGenMessage({ type: 'success', text: 'Certificate generated successfully.' });
      await loadCertInfo();
    } catch (err: any) {
      setGenMessage({ type: 'error', text: String(err) });
    } finally {
      setLoading(false);
    }
  }

  async function handleTrust() {
    setLoading(true);
    setTrustResult(null);
    try {
      const result = await invokeTauriCommand<TrustResult>('trust_ca_certificate');
      setTrustResult(result);
      setCertInfo(result.certInfo);
    } catch (err: any) {
      setTrustResult({
        success: false,
        message: String(err),
        firefoxNote: '',
        manualSteps: [],
        certInfo: certInfo!,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleUntrust() {
    setLoading(true);
    setTrustResult(null);
    try {
      const result = await invokeTauriCommand<TrustResult>('untrust_ca_certificate');
      setTrustResult(result);
      setCertInfo(result.certInfo);
    } catch (err: any) {
      setTrustResult({
        success: false,
        message: String(err),
        firefoxNote: '',
        manualSteps: [],
        certInfo: certInfo!,
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    const path = certInfo?.certPath ?? '';
    setGenMessage({ type: 'success', text: `Certificate file: ${path}` });
  }

  function formatDate(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  function isExpired(dateStr?: string): boolean {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  }

  const expired = isExpired(certInfo?.validTo);

  // Section heading — shared quick-request baseline (tokens.sectionTitle:
  // 11px uppercase 700, --apinox-fs-sm) so it matches the settings Proxy page.
  const sectionHeadStyle: React.CSSProperties = {
    margin: '0 0 16px 0',
    ...tokens.sectionTitle,
    color: tokens.text.muted,
    letterSpacing: '0.05em',
  };

  return (
    <>
      {/* Two-column: Status (left) | Actions (right) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: '16px', alignItems: 'start' }}>

        {/* Status */}
        <div style={{ background: tokens.surface.panel, borderRadius: tokens.radius.lg, padding: '20px' }}>
          <h3 style={sectionHeadStyle}>
            CA Certificate Status
          </h3>

          {certInfo?.exists ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  ['Subject', certInfo.subject],
                  ['Issuer', certInfo.issuer],
                  ['Valid From', formatDate(certInfo.validFrom)],
                  ['Valid To', formatDate(certInfo.validTo)],
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                    <span style={{ color: tokens.text.muted, flexShrink: 0, marginRight: '16px' }}>{label}</span>
                    <span style={{ color: label === 'Valid To' && expired ? '#bf6f6f' : tokens.text.secondary, textAlign: 'right' }}>
                      {value ?? 'N/A'}
                      {label === 'Valid To' && expired && ' ⚠ EXPIRED'}
                    </span>
                  </div>
                ))}

                {certInfo.fingerprint && (
                  <div style={{ fontSize: '13px', marginTop: '4px' }}>
                    <div style={{ color: tokens.text.muted, marginBottom: '4px' }}>SHA-256 Fingerprint</div>
                    <div style={{
                      fontFamily: 'monospace',
                      fontSize: '10px',
                      color: tokens.text.secondary,
                      wordBreak: 'break-all',
                      background: tokens.surface.base,
                      padding: '8px',
                      borderRadius: '4px',
                    }}>
                      {certInfo.fingerprint}
                    </div>
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '16px',
                padding: '10px 12px',
                background: expired ? '#3d1a1a' : certInfo.isTrusted ? '#1a2d3d' : '#1a3d1a',
                border: `1px solid ${expired ? '#6a2d2d' : certInfo.isTrusted ? '#2d5a8a' : '#2d6a2d'}`,
                borderRadius: '4px',
                fontSize: '12px',
                color: expired ? '#bf6f6f' : certInfo.isTrusted ? '#6f9fbf' : '#6fbf6f',
              }}>
                {expired
                  ? '⚠ Certificate has expired. Regenerate it.'
                  : certInfo.isTrusted
                    ? '✓ Certificate is valid and trusted by this OS'
                    : '✓ Certificate is valid — not yet installed in OS trust store'}
              </div>
            </>
          ) : (
            <div style={{
              padding: '16px',
              background: '#3d3d1a',
              border: '1px solid #6a6a2d',
              borderRadius: '4px',
              fontSize: '13px',
              color: '#d4d4a0',
              textAlign: 'center',
            }}>
              No certificate found. Generate one to enable HTTPS inspection.
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ background: tokens.surface.panel, borderRadius: tokens.radius.lg, padding: '20px' }}>
          <h3 style={sectionHeadStyle}>
            Actions
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={handleGenerate} disabled={loading} style={btnStyle('#0e639c', loading)}>
              {certInfo?.exists ? 'Regenerate Certificate' : 'Generate Certificate'}
            </button>

            {certInfo?.exists && (
              <>
                {certInfo.isTrusted ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{
                      padding: '9px 12px',
                      background: '#1a2d3d',
                      border: '1px solid #2d5a8a',
                      borderRadius: '4px',
                      fontSize: '12px',
                      color: '#6f9fbf',
                    }}>
                      ✓ Trusted in OS store
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={handleTrust} disabled={loading} style={{ ...btnStyle('#555', loading), flex: 1, padding: '6px', fontSize: '12px' }}>
                        Re-install
                      </button>
                      <button onClick={handleUntrust} disabled={loading} style={{ ...btnStyle('#7a2020', loading), flex: 1, padding: '6px', fontSize: '12px' }}>
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={handleTrust} disabled={loading} style={btnStyle('#107c10', loading)}>
                    Install to Trust Store
                  </button>
                )}
                <button onClick={handleExport} disabled={loading} style={btnStyle('#5c2d91', loading)}>
                  Show Certificate Path
                </button>
              </>
            )}
          </div>

          {genMessage && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: genMessage.type === 'success' ? '#1a3d1a' : '#3d1a1a',
              border: `1px solid ${genMessage.type === 'success' ? '#2d6a2d' : '#6a2d2d'}`,
              borderRadius: '4px',
              fontSize: '12px',
              color: genMessage.type === 'success' ? '#6fbf6f' : '#bf6f6f',
            }}>
              {genMessage.type === 'success' ? '✓ ' : '✗ '}{genMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* Trust result — full width, conditional */}
      {trustResult && (
        <div style={{ background: tokens.surface.panel, borderRadius: tokens.radius.lg, padding: '20px', marginTop: '16px' }}>
          <h3 style={{ ...sectionHeadStyle, marginBottom: '12px' }}>
            Trust Installation Result
          </h3>

          <div style={{
            padding: '10px 12px',
            background: trustResult.success ? '#1a3d1a' : '#3d1a1a',
            border: `1px solid ${trustResult.success ? '#2d6a2d' : '#6a2d2d'}`,
            borderRadius: '4px',
            fontSize: '13px',
            color: trustResult.success ? '#6fbf6f' : '#bf6f6f',
            marginBottom: '12px',
          }}>
            {trustResult.success ? '✓ ' : '✗ '}{trustResult.message}
          </div>

          {trustResult.firefoxNote && (
            <div style={{
              padding: '10px 12px',
              background: '#2d2d1a',
              border: '1px solid #6a6a2d',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#d4d4a0',
              marginBottom: '12px',
            }}>
              <strong style={{ color: '#e8d44d' }}>Firefox: </strong>{trustResult.firefoxNote}
            </div>
          )}

          {trustResult.manualSteps.length > 0 && (
            <div style={{ marginTop: '8px' }}>
              <div style={{ fontSize: '12px', color: tokens.text.muted, marginBottom: '8px', fontWeight: 600 }}>
                Manual installation steps:
              </div>
              <div style={{
                background: tokens.surface.base,
                borderRadius: tokens.radius.md,
                padding: '12px',
                fontSize: '12px',
                color: tokens.text.secondary,
                fontFamily: 'monospace',
                lineHeight: '1.8',
                whiteSpace: 'pre-wrap',
              }}>
                {trustResult.manualSteps.join('\n')}
              </div>
            </div>
          )}
        </div>
      )}

      {/* How it works info box */}
      <div style={{
        background: tokens.surface.base,
        borderRadius: tokens.radius.lg,
        padding: '16px',
        marginTop: '16px',
        fontSize: '12px',
        color: tokens.text.muted,
        lineHeight: '1.7',
      }}>
        <strong style={{ color: tokens.text.secondary }}>How HTTPS inspection works:</strong>
        <ol style={{ margin: '8px 0 0 0', paddingLeft: '20px' }}>
          <li>Generate the CA certificate (done once per installation)</li>
          <li>Install it to your system trust store so your browser trusts it</li>
          <li>Configure your HTTP client to use the proxy</li>
          <li>The proxy will sign per-domain certificates on the fly using this CA</li>
        </ol>
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${tokens.border.default}` }}>
          <strong style={{ color: '#e8d44d' }}>Firefox note:</strong>{' '}
          Firefox maintains its own certificate store. You must import the CA manually
          via Preferences → Privacy &amp; Security → Certificates → View Certificates → Authorities → Import.
        </div>
        <div style={{ marginTop: '8px' }}>
          Certificate files are stored in{' '}
          <code style={{ background: tokens.surface.panel, padding: '2px 6px', borderRadius: tokens.radius.sm, color: tokens.text.primary }}>
            ~/.apinox/
          </code>
        </div>
      </div>
    </>
  );
}


function btnStyle(bg: string, disabled: boolean): React.CSSProperties {
  return {
    padding: '9px 18px',
    background: bg,
    border: 'none',
    borderRadius: '4px',
    color: 'white',
    fontSize: '13px',
    fontWeight: 500,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.6 : 1,
    textAlign: 'left',
  };
}

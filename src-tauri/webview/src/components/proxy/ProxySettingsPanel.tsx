import React, { useState, useEffect } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { CertificateManager } from './CertificateManager';
import { tokens } from './tokens';
import type { IgnoreRule } from '../../utils/useIgnoreList';

interface ProxySettingsPanelProps {
  ignoreRules: IgnoreRule[];
  onRemoveIgnoreRule: (id: string) => void;
  onAddIgnoreRule: (url: string, mode: 'host' | 'host+path') => void;
}

export function ProxySettingsPanel({ ignoreRules, onRemoveIgnoreRule, onAddIgnoreRule }: ProxySettingsPanelProps) {
  const [httpsEnabled, setHttpsEnabled] = useState(true);
  const [trustCertificate, setTrustCertificate] = useState(false);
  const [defaultPort, setDefaultPort] = useState(8888);
  const [appVersion, setAppVersion] = useState<string>('...');
  const [testStatus, setTestStatus] = useState<string | null>(null);

  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => setAppVersion('unknown'));
  }, []);

  async function sendTestRequests() {
    setTestStatus('Sending\u2026');
    const endpoints: Array<{ url: string; init?: RequestInit }> = [
      { url: 'https://httpbin.org/get' },
      { url: 'https://httpbin.org/post', init: { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, from: 'APInox Proxy' }) } },
      { url: 'https://httpbin.org/headers' },
      { url: 'https://httpbin.org/user-agent' },
      { url: 'https://httpbin.org/delay/1' },
    ];
    const MAX_CONSECUTIVE_FAILURES = 3;
    let ok = 0;
    let fail = 0;
    let consecutive = 0;
    for (const { url, init } of endpoints) {
      if (consecutive >= MAX_CONSECUTIVE_FAILURES) break;
      try {
        await fetch(url, init);
        ok++;
        consecutive = 0;
      } catch {
        fail++;
        consecutive++;
      }
    }
    const stoppedEarly = consecutive >= MAX_CONSECUTIVE_FAILURES;
    setTestStatus(
      `Done \u2014 ${ok} ok${fail > 0 ? `, ${fail} failed` : ''}${stoppedEarly ? ' (stopped: too many failures)' : ''}`
    );
    setTimeout(() => setTestStatus(null), 6000);
  }

  const sectionStyle: React.CSSProperties = {
    background: tokens.surface.panel,
    borderRadius: tokens.radius.lg,
    padding: '20px',
    marginBottom: '16px',
  };

  const sectionHeadStyle: React.CSSProperties = {
    margin: '0 0 16px 0',
    ...tokens.sectionTitle, // 11px uppercase 700 — shared quick-request baseline (--apinox-fs-sm)
    color: tokens.text.muted,
    letterSpacing: '0.05em',
  };

  return (
    <div style={{ padding: '20px' }}>
      <h2 style={{ margin: '0 0 20px 0', fontSize: 'var(--apinox-fs-title)', fontWeight: 500 }}>Proxy Settings</h2>

      {/* Row 1: About + Default Port side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>

        <div style={sectionStyle}>
          <h3 style={sectionHeadStyle}>About</h3>
          <div style={{ fontSize: tokens.fontSize.base, color: tokens.text.secondary, lineHeight: '1.7' }}>
            <div><span style={{ color: tokens.text.muted }}>Version</span> &nbsp; {appVersion}</div>
            <div><span style={{ color: tokens.text.muted }}>Stack</span> &nbsp; Tauri 2 · Rust · React</div>
            <div style={{ marginTop: '8px', fontSize: tokens.fontSize.sm, color: tokens.text.muted }}>
              Built-in HTTP/HTTPS proxy and mock server for API testing and debugging.
            </div>
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={sectionHeadStyle}>Default Port</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <input
              type="number"
              value={defaultPort}
              onChange={(e) => {
                const v = parseInt(e.target.value);
                setDefaultPort(v);
                localStorage.setItem('apiprox-default-port', String(v));
              }}
              style={{
                width: '100px',
                padding: '8px 12px',
                background: tokens.surface.input,
                border: `1px solid ${tokens.border.subtle}`,
                borderRadius: tokens.radius.md,
                color: tokens.text.secondary,
                fontSize: tokens.fontSize.base,
              }}
            />
            <span style={{ fontSize: tokens.fontSize.base, color: tokens.text.muted }}>
              Default proxy port for new sessions
            </span>
          </div>
        </div>
      </div>

      {/* HTTPS Interception */}
      <div style={sectionStyle}>
        <h3 style={sectionHeadStyle}>HTTPS Interception</h3>

        <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', marginBottom: '12px' }}>
          <input
            type="checkbox"
            checked={httpsEnabled}
            onChange={(e) => setHttpsEnabled(e.target.checked)}
            style={{ width: '16px', height: '16px' }}
          />
          <div>
            <div style={{ fontSize: tokens.fontSize.base }}>Enable HTTPS Interception</div>
            <div style={{ fontSize: tokens.fontSize.sm, color: tokens.text.muted, marginTop: '2px' }}>
              Allows proxying and modifying HTTPS traffic via on-the-fly certificate signing
            </div>
          </div>
        </label>

        {httpsEnabled && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', paddingLeft: '28px' }}>
            <input
              type="checkbox"
              checked={trustCertificate}
              onChange={(e) => setTrustCertificate(e.target.checked)}
              style={{ width: '16px', height: '16px' }}
            />
            <div>
              <div style={{ fontSize: tokens.fontSize.base }}>Auto-trust generated certificates</div>
              <div style={{ fontSize: tokens.fontSize.sm, color: tokens.text.muted, marginTop: '2px' }}>
                Automatically add the proxy CA to the system trust store after generation
              </div>
            </div>
          </label>
        )}
      </div>

      {/* Certificate Management */}
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ ...sectionHeadStyle, paddingLeft: '4px', marginBottom: '12px' }}>Certificate Management</h3>
        <CertificateManager />
      </div>

      {/* Traffic Ignore List */}
      <div style={{ ...sectionStyle, marginBottom: '16px' }}>
        <h3 style={sectionHeadStyle}>Traffic Ignore List</h3>
        <p style={{ margin: '0 0 14px 0', fontSize: tokens.fontSize.sm, color: tokens.text.muted }}>
          Matching requests are hidden from the Traffic view. Right-click any traffic entry to add rules.
        </p>
        <IgnoreListGrid rules={ignoreRules} onRemove={onRemoveIgnoreRule} onAdd={onAddIgnoreRule} />
      </div>

      {/* Developer Tools */}
      <div style={{ ...sectionStyle, marginBottom: 0 }}>
        <h3 style={sectionHeadStyle}>Developer Tools</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={sendTestRequests}
            disabled={testStatus === 'Sending\u2026'}
            style={{
              padding: '7px 16px',
              background: tokens.surface.input,
              border: `1px solid ${tokens.border.subtle}`,
              borderRadius: tokens.radius.md,
              color: tokens.text.secondary,
              fontSize: tokens.fontSize.sm,
              cursor: testStatus === 'Sending\u2026' ? 'wait' : 'pointer',
              opacity: testStatus === 'Sending\u2026' ? 0.7 : 1,
            }}
          >
            Send Test Requests
          </button>
          {testStatus && (
            <span style={{ fontSize: tokens.fontSize.sm, color: tokens.text.muted }}>
              {testStatus}
            </span>
          )}
          <span style={{ fontSize: tokens.fontSize.xs, color: tokens.text.hint }}>
            Fires 5 requests to httpbin.org \u2014 useful for testing traffic capture
          </span>
        </div>
      </div>
    </div>
  );
}

// ── IgnoreListGrid ────────────────────────────────────────────────────────
function IgnoreListGrid({ rules, onRemove, onAdd }: {
  rules: IgnoreRule[];
  onRemove: (id: string) => void;
  onAdd: (url: string, mode: 'host' | 'host+path') => void;
}) {
  const [newPattern, setNewPattern] = useState('');
  const [newMode, setNewMode] = useState<'host' | 'host+path'>('host');

  function handleAdd() {
    const trimmed = newPattern.trim();
    if (!trimmed) return;
    const asUrl = trimmed.startsWith('http') ? trimmed : `http://${trimmed}`;
    onAdd(asUrl, newMode);
    setNewPattern('');
  }

  const modeBadge = (mode: 'host' | 'host+path') => ({
    fontSize: 10, fontWeight: 700,
    padding: '1px 7px', borderRadius: 8,
    fontFamily: 'monospace',
    ...(mode === 'host'
      ? { background: 'rgba(14,99,156,0.2)', color: '#6db3e8', border: '1px solid rgba(14,99,156,0.45)' }
      : { background: 'rgba(122,90,30,0.2)', color: '#ddb165', border: '1px solid rgba(122,90,30,0.45)' }),
  } as React.CSSProperties);

  return (
    <div>
      {rules.length === 0 ? (
        <div style={{
          padding: '16px', textAlign: 'center',
          fontSize: tokens.fontSize.sm, color: tokens.text.hint,
          fontStyle: 'italic',
          background: tokens.surface.base,
          borderRadius: tokens.radius.md,
          border: `1px dashed ${tokens.border.subtle}`,
          marginBottom: 12,
        }}>
          No ignore rules yet \u2014 right-click any traffic entry to add one
        </div>
      ) : (
        <div style={{
          border: `1px solid ${tokens.border.default}`,
          borderRadius: tokens.radius.md,
          overflow: 'hidden',
          marginBottom: 12,
        }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '90px 1fr 36px',
            background: tokens.surface.elevated,
            borderBottom: `1px solid ${tokens.border.default}`,
            padding: '6px 12px',
            fontSize: tokens.fontSize.xs, fontWeight: 600,
            color: tokens.text.muted, letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            <span>Mode</span>
            <span>Pattern</span>
            <span />
          </div>
          {rules.map((rule, idx) => (
            <div
              key={rule.id}
              style={{
                display: 'grid', gridTemplateColumns: '90px 1fr 36px',
                alignItems: 'center',
                padding: '7px 12px',
                background: idx % 2 === 0 ? 'transparent' : tokens.surface.stripe,
                borderBottom: idx < rules.length - 1 ? `1px solid ${tokens.surface.elevated}` : 'none',
              }}
            >
              <span style={modeBadge(rule.mode)}>{rule.mode}</span>
              <span style={{
                fontSize: tokens.fontSize.sm, fontFamily: 'monospace',
                color: tokens.text.primary, wordBreak: 'break-all',
              }}>{rule.pattern}</span>
              <button
                onClick={() => onRemove(rule.id)}
                title="Remove rule"
                style={{
                  background: 'transparent', border: 'none',
                  color: tokens.text.hint, cursor: 'pointer',
                  fontSize: 15, lineHeight: 1, padding: '2px 4px',
                  borderRadius: tokens.radius.sm,
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = tokens.text.danger)}
                onMouseLeave={e => (e.currentTarget.style.color = tokens.text.hint)}
              >\xD7</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select
          value={newMode}
          onChange={e => setNewMode(e.target.value as 'host' | 'host+path')}
          style={{
            padding: '5px 8px',
            background: tokens.surface.input,
            border: `1px solid ${tokens.border.subtle}`,
            borderRadius: tokens.radius.md,
            color: tokens.text.secondary,
            fontSize: tokens.fontSize.sm,
            flexShrink: 0,
          }}
        >
          <option value="host">host</option>
          <option value="host+path">host+path</option>
        </select>
        <input
          type="text"
          placeholder="e.g. api.example.com or api.example.com/health"
          value={newPattern}
          onChange={e => setNewPattern(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          style={{
            flex: 1,
            padding: '5px 10px',
            background: tokens.surface.input,
            border: `1px solid ${tokens.border.subtle}`,
            borderRadius: tokens.radius.md,
            color: tokens.text.primary,
            fontSize: tokens.fontSize.sm,
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newPattern.trim()}
          style={{
            padding: '5px 14px',
            background: newPattern.trim() ? tokens.status.accentDark : tokens.surface.elevated,
            border: `1px solid ${newPattern.trim() ? tokens.status.accentDark : tokens.border.subtle}`,
            borderRadius: tokens.radius.md,
            color: newPattern.trim() ? '#fff' : tokens.text.hint,
            fontSize: tokens.fontSize.sm,
            cursor: newPattern.trim() ? 'pointer' : 'default',
            transition: 'all 0.15s',
            flexShrink: 0,
          }}
        >Add</button>
      </div>
    </div>
  );
}

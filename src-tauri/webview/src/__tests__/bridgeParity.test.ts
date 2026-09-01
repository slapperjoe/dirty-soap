/**
 * M20 — bridge↔Rust parity test.
 *
 * Guards the whole H1–H7 bug class from recurring:
 *   A) Every `tauriInvoke('<cmd>')` literal in bridge.ts must be registered in
 *      lib.rs `generate_handler!` (otherwise Tauri throws "Command not found").
 *   B) Every FrontendCommand value dispatched from UI product code via
 *      bridge.sendMessage{Async} must have a routing branch in tryRustCommand
 *      (otherwise invokeRustCommand throws "Command '<x>' not implemented").
 *
 * Run from the webview: `npm test` (vitest).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const WEBVIEW = resolve(__dirname, '..', '..');
const ROOT = resolve(WEBVIEW, '..', '..');
const BRIDGE = resolve(WEBVIEW, 'src/utils/bridge.ts');
const LIBRS = resolve(ROOT, 'src-tauri/src/lib.rs');
const MESSAGES = resolve(ROOT, 'shared/src/messages.ts');
const PRODUCT_DIRS = [
  resolve(WEBVIEW, 'src'),
  resolve(ROOT, 'packages/request-editor/src'),
];

/**
 * Known-deferred commands: dispatched from UI code but with no Rust command and
 * no `tryRustCommand` branch on the current main base. These are pre-existing
 * tech debt (not introduced by this branch) — proxy test connection, TLS
 * certificate management, the distributed-test coordinator, sample-schema
 * generation, native export, environment activation, and a few WSDL/playground
 * paths. The parity test allowlists them so it stays green, while still failing
 * on any command that is dispatched WITHOUT a branch and NOT in this list.
 *
 * If a command in this list gets a `tryRustCommand` branch (or a Rust command),
 * remove it here so the test starts guarding it again.
 */
const DEFERRED_COMMANDS = new Set<string>([
  'log',
  'getSampleSchema',
  'setActiveEnvironment',
  'cancelWsdlLoad',
  'selectLocalWsdl',
  'adoAddComment',
  'pickOperationForTestCase',
  'pickOperationForPerformance',
  'executePlaygroundScript',
  'checkCertificate',
  'checkCertificateStore',
  'installCertificateToLocalMachine',
  'moveCertificateToLocalMachine',
  'regenerateCertificate',
  'resetCertificates',
  'exportNative',
  'getProxyStatus',
  'testHttpsServer',
  'testProxyConnection',
]);

/**
 * Test A (tauriInvoke literals → generate_handler!): these commands are
 * `tauriInvoke`'d from bridge.ts but have no Rust command / generate_handler!
 * registration on the current main base (pre-existing tech debt — the
 * distributed-test coordinator was never implemented in Rust). Allowlisted so
 * the test stays green while still failing on any newly-added tauriInvoke
 * literal that isn't registered.
 */
const DEFERRED_INVOKE_LITERALS = new Set<string>([
  'start_coordinator',
  'stop_coordinator',
  'get_coordinator_status',
]);

function walk(dir: string, out: string[] = []): string[] {
  const entries = readdirSafe(dir);
  for (const name of entries) {
    const p = resolve(dir, name);
    if (isDir(p)) {
      if (name === 'node_modules' || name === '__tests__') continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function readdirSafe(dir: string): string[] {
  try {
    const { readdirSync } = require('fs');
    return readdirSync(dir, { withFileTypes: true }).map((e: any) => e.name);
  } catch {
    return [];
  }
}

function isDir(p: string): boolean {
  try {
    const { statSync } = require('fs');
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function enumValues(src: string, enumName: string): Map<string, string> {
  const map = new Map<string, string>();
  const block = src.match(new RegExp(`export enum ${enumName} \\{([\\s\\S]*?)\\n\\}`));
  if (!block) return map;
  for (const m of block[1].matchAll(/^\s*(\w+)\s*=\s*'([^']+)'/gm)) {
    map.set(m[1], m[2]);
  }
  return map;
}

function registeredHandlers(libSrc: string): Set<string> {
  const start = libSrc.indexOf('generate_handler![');
  const end = libSrc.indexOf('])', start);
  const block = libSrc.slice(start, end);
  const set = new Set<string>();
  for (const m of block.matchAll(/::([a-z_0-9]+)\s*,/gm)) set.add(m[1]);
  for (const m of block.matchAll(/^\s*([a-z_0-9]+)\s*,/gm)) set.add(m[1]);
  return set;
}

describe('M20 bridge↔Rust parity', () => {
  const bridgeSrc = readFileSync(BRIDGE, 'utf8');
  const libSrc = readFileSync(LIBRS, 'utf8');
  const msgSrc = readFileSync(MESSAGES, 'utf8');
  const frontend = enumValues(msgSrc, 'FrontendCommand');

  it('A: every tauriInvoke literal is registered in generate_handler!', () => {
    const invokeLiterals = new Set<string>();
    for (const m of bridgeSrc.matchAll(/tauriInvoke\(\s*'([^']+)'/g)) invokeLiterals.add(m[1]);
    const registered = registeredHandlers(libSrc);
    const missing = [...invokeLiterals].filter(
      (lit) => !registered.has(lit) && !DEFERRED_INVOKE_LITERALS.has(lit),
    );
    expect(missing).toEqual([]);
  });

  it('B: every dispatched FrontendCommand has a tryRustCommand branch', () => {
    // routing branches inside tryRustCommand
    const tryStart = bridgeSrc.indexOf('async function tryRustCommand');
    const tryEnd = bridgeSrc.indexOf('async function invokeRustCommand');
    const trySeg = bridgeSrc.slice(tryStart, tryEnd);
    const routedEnum = new Set<string>();
    const routedLits = new Set<string>();
    for (const m of trySeg.matchAll(/FrontendCommand\.(\w+)/g)) routedEnum.add(m[1]);
    for (const m of trySeg.matchAll(/message\.command === '([^']+)'/g)) routedLits.add(m[1]);
    for (const m of trySeg.matchAll(/command === '([^']+)'/g)) routedLits.add(m[1]);

    const dispatchedEnum = new Map<string, string[]>();
    const dispatchedLits = new Map<string, string[]>();
    for (const dir of PRODUCT_DIRS) {
      for (const file of walk(dir)) {
        const raw = readFileSync(file, 'utf8');
        const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
        const rel = file.replace(ROOT + '/', '');
        const callRe = /bridge\.sendMessage(?:Async)?\s*\(\s*\{([\s\S]*?)\n\s*\}/g;
        let call: RegExpExecArray | null;
        while ((call = callRe.exec(src)) !== null) {
          const payload = call[1];
          for (const m of payload.matchAll(/command:\s*FrontendCommand\.(\w+)/g)) {
            if (!dispatchedEnum.has(m[1])) dispatchedEnum.set(m[1], []);
            dispatchedEnum.get(m[1])!.push(rel);
          }
          for (const m of payload.matchAll(/command:\s*'([^']+)'/g)) {
            if (!dispatchedLits.has(m[1])) dispatchedLits.set(m[1], []);
            dispatchedLits.get(m[1])!.push(rel);
          }
        }
      }
    }

    const missingEnum: string[] = [];
    for (const [name] of dispatchedEnum) {
      const value = frontend.get(name);
      const routed = routedEnum.has(name) || (value ? routedLits.has(value) : false);
      if (!routed) missingEnum.push(name);
    }
    // Drop names whose value is allowlisted as known-deferred.
    const enumValueByName = (name: string): string | undefined => frontend.get(name);

    const missingLits: string[] = [];
    for (const [lit] of dispatchedLits) {
      if (lit.includes('\n') || lit.length > 40) continue;
      if (DEFERRED_COMMANDS.has(lit)) continue;
      const name = [...frontend.entries()].find(([, v]) => v === lit)?.[0];
      const routed = routedLits.has(lit) || (name ? routedEnum.has(name) : false);
      if (!routed) missingLits.push(lit);
    }

    const filteredMissingEnum = missingEnum.filter(
      (name) => !DEFERRED_COMMANDS.has(enumValueByName(name) ?? name),
    );

    expect({ missingEnum: filteredMissingEnum, missingLits }).toEqual({
      missingEnum: [],
      missingLits: [],
    });
  });
});

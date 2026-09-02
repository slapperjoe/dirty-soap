import { describe, it, expect } from 'vitest';
import {
    scrapbookCaptureKey,
    resolveScrapbookCapture,
    isScrapbookNode,
} from '../utils/unifiedScrapbookCapture';
import { ScrapbookRequest, ApiRequest } from '@shared/models';

/**
 * R-03b — unified scrapbook auto-save contract (against the UNIFIED
 * selectedNode model).
 *
 * Contract-level tests: the unified capture path itself lands in Phase 2
 * (R-05). These tests pin the semantics that path must honour:
 *   - Q4: update the entry keyed by endpoint+operation, else append (no
 *     unbounded growth).
 *   - A selectedNode of type 'scrapbook' is a quick request that drives the
 *     unified main view.
 * The `scrapbook.json` schema is FROZEN, so the key uses endpoint + entry
 * name (a quick request created from an operation carries the operation name).
 */
const entry = (name: string, endpoint: string, overrides: Partial<ScrapbookRequest> = {}): ScrapbookRequest => ({
    ...overrides,
    id: overrides.id ?? `id-${name}`,
    name,
    request: '<x/>',
    endpoint,
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
} as ScrapbookRequest);

const req = (name: string, endpoint: string): ApiRequest => ({ name, request: '<x/>', endpoint });

describe('scrapbook capture contract (R-03b)', () => {
    describe('scrapbookCaptureKey', () => {
        it('normalizes endpoint casing and trailing slashes', () => {
            expect(scrapbookCaptureKey('http://host:8080/svc', 'Op')).toBe(
                scrapbookCaptureKey('HTTP://HOST:8080/svc/', 'Op'),
            );
        });

        it('keeps operations distinct and case-sensitive', () => {
            expect(scrapbookCaptureKey('http://h/s', 'GetFoo')).not.toBe(
                scrapbookCaptureKey('http://h/s', 'getfoo'),
            );
        });

        it('treats a missing operation as an empty component', () => {
            expect(scrapbookCaptureKey('http://h/s', undefined)).toBe(
                scrapbookCaptureKey('http://h/s', ''),
            );
        });
    });

    describe('resolveScrapbookCapture', () => {
        it('appends when no entry matches', () => {
            const decision = resolveScrapbookCapture([], req('GetFoo', 'http://h/s'), 'GetFoo');
            expect(decision.mode).toBe('append');
        });

        it('updates (not appends) when an entry already matches endpoint+operation', () => {
            const requests = [entry('GetFoo', 'http://h/s'), entry('GetBar', 'http://h/s')];
            const decision = resolveScrapbookCapture(requests, req('GetFoo', 'http://h/s/'), 'GetFoo');
            // Normalization: trailing slash + case-insensitive endpoint match.
            expect(decision.mode).toBe('update');
            expect(decision.index).toBe(0);
        });

        it('does not merge distinct operations on the same endpoint', () => {
            const requests = [entry('GetFoo', 'http://h/s')];
            const decision = resolveScrapbookCapture(requests, req('GetBar', 'http://h/s'), 'GetBar');
            expect(decision.mode).toBe('append');
        });

        it('prevents unbounded growth: re-running the same op overwrites the entry', () => {
            // Simulate the Phase-2 hook applying the decision N times.
            let requests = [entry('GetFoo', 'http://h/s')];
            for (let i = 0; i < 5; i++) {
                const decision = resolveScrapbookCapture(requests, req('GetFoo', 'http://h/s'), 'GetFoo');
                expect(decision.mode).toBe('update');
                // In-place overwrite: index is stable, list length unchanged.
                expect(decision.index).toBe(0);
            }
            expect(requests.length).toBe(1);
        });
    });

    describe('isScrapbookNode (unified selectedNode routing)', () => {
        it('is true for a scrapbook node', () => {
            expect(isScrapbookNode({ type: 'scrapbook', id: 'abc' })).toBe(true);
        });

        it('is false for project/operation/request nodes and null', () => {
            expect(isScrapbookNode({ type: 'project', id: 'p' })).toBe(false);
            expect(isScrapbookNode({ type: 'operation', id: 'o' })).toBe(false);
            expect(isScrapbookNode({ type: 'request', id: 'r' })).toBe(false);
            expect(isScrapbookNode(null)).toBe(false);
            expect(isScrapbookNode(undefined)).toBe(false);
        });
    });
});

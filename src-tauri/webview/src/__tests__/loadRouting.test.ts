import { describe, it, expect } from 'vitest';
import { detectLoadFormat } from '../utils/loadRouting';

/**
 * R-03c — bridge load-routing test floor.
 *
 * URL/file extension → WSDL vs OpenAPI vs GraphQL routing, extracted into a
 * pure function (`detectLoadFormat`) and pinned here. The rules mirror the
 * legacy `bridge.ts` LoadWsdl routing (the parity baseline):
 *   - `.json` / `.yaml` / `.yml` (query string stripped) → OpenAPI
 *   - path containing `graphql` or `/gql` → GraphQL
 *   - everything else → WSDL (unknown formats fall to the WSDL path, which
 *     errors cleanly — matching legacy default-branch behavior)
 */
describe('detectLoadFormat (R-03c load routing)', () => {
    it('routes .json to openapi', () => {
        expect(detectLoadFormat('https://petstore.swagger.io/v2/swagger.json')).toBe('openapi');
    });

    it('routes .yaml and .yml to openapi', () => {
        expect(detectLoadFormat('https://petstore.swagger.io/v2/swagger.yaml')).toBe('openapi');
        expect(detectLoadFormat('file:///specs/openapi.yml')).toBe('openapi');
    });

    it('strips the query string before the extension check', () => {
        // A WSDL URL that ends in `?WSDL` must NOT be mistaken for .json etc.
        expect(detectLoadFormat('http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL')).toBe('wsdl');
        // And an OpenAPI URL with a query still routes to openapi by extension.
        expect(detectLoadFormat('https://example.com/spec.json?cache=123')).toBe('openapi');
    });

    it('routes graphql paths to graphql', () => {
        expect(detectLoadFormat('https://spacex-production.up.railway.app/graphql')).toBe('graphql');
        expect(detectLoadFormat('https://rickandmortyapi.com/graphql')).toBe('graphql');
        expect(detectLoadFormat('https://api.example.com/v1/gql/query')).toBe('graphql');
    });

    it('routes .wsdl and bare service URLs to wsdl', () => {
        expect(detectLoadFormat('http://www.dneonline.com/calculator.asmx?wsdl')).toBe('wsdl');
        expect(detectLoadFormat('http://example.com/service.wsdl')).toBe('wsdl');
        expect(detectLoadFormat('http://example.com/soap-service')).toBe('wsdl');
    });

    it('routes unknown/unsupported formats to the wsdl path (clean error upstream)', () => {
        // No dedicated "unknown" format: default branch is WSDL, which errors
        // cleanly for non-WSDL input (doc §6 phase-1 row).
        expect(detectLoadFormat('https://example.com/some-unknown-format')).toBe('wsdl');
        expect(detectLoadFormat('')).toBe('wsdl');
    });
});

import { describe, it, expect } from 'vitest';
import { SAMPLE_API_CARDS, SampleApiCard } from '../utils/sampleApiCards';
import { detectLoadFormat } from '../utils/loadRouting';

/**
 * R-03d — Sample API cards CONTRACT test (doc §5.2 / F-03).
 *
 * The rendering component lands in Phase 3 (R-07). This test pins the DATA
 * CONTRACT that Phase 3 implements against, so the cards cannot drift from
 * the decision doc:
 *   - exactly 6 cards, grouped OpenAPI ×2 / SOAP ×2 / GraphQL ×2
 *   - exact labels and URLs from doc §5.2 (verbatim, incl. ?WSDL / ?wsdl)
 *   - each card's declared `format` agrees with `detectLoadFormat(url)`, so a
 *     card click pre-fills the URL input AND drives the correct load path
 * Approach chosen (documented for the phase summary): a data-contract spec
 * against the fixture + routing pure function, not a component render test —
 * the component does not exist in Phase 0, so a render test would be
 * red/xfail. Phase 3 should add a render test that asserts these same values
 * appear in the DOM and that clicking sets the URL input.
 */
const DOC_5_2: Array<{ label: string; group: string; url: string }> = [
    { label: 'Swagger Petstore', group: 'OpenAPI', url: 'https://petstore.swagger.io/v2/swagger.json' },
    { label: 'Petstore YAML', group: 'OpenAPI', url: 'https://petstore.swagger.io/v2/swagger.yaml' },
    { label: 'Country Info', group: 'SOAP', url: 'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL' },
    { label: 'Calculator', group: 'SOAP', url: 'http://www.dneonline.com/calculator.asmx?wsdl' },
    { label: 'SpaceX', group: 'GraphQL', url: 'https://spacex-production.up.railway.app/graphql' },
    { label: 'Rick & Morty', group: 'GraphQL', url: 'https://rickandmortyapi.com/graphql' },
];

describe('Sample API cards contract (R-03d / doc §5.2)', () => {
    it('has exactly 6 cards', () => {
        expect(SAMPLE_API_CARDS).toHaveLength(6);
    });

    it('groups: OpenAPI ×2, SOAP ×2, GraphQL ×2', () => {
        const groups = SAMPLE_API_CARDS.reduce<Record<string, number>>((acc, c) => {
            acc[c.group] = (acc[c.group] || 0) + 1;
            return acc;
        }, {});
        expect(groups).toEqual({ OpenAPI: 2, SOAP: 2, GraphQL: 2 });
    });

    it('matches the exact doc §5.2 labels, groups and URLs (order included)', () => {
        expect(
            SAMPLE_API_CARDS.map(c => ({ label: c.label, group: c.group, url: c.url })),
        ).toEqual(DOC_5_2);
    });

    it('every card has a non-empty label and URL', () => {
        for (const c of SAMPLE_API_CARDS) {
            expect(c.label.length).toBeGreaterThan(0);
            expect(c.url.length).toBeGreaterThan(0);
        }
    });

    it('each card format is consistent with detectLoadFormat(url) (click drives the right path)', () => {
        for (const c of SAMPLE_API_CARDS) {
            expect(detectLoadFormat(c.url)).toBe(c.format);
        }
    });

    it('pre-fill contract: a card click would set the URL input to the exact doc URL', () => {
        // Simulate the Phase 3 interaction: urlInput = card.url.
        const prefill = (card: SampleApiCard): string => card.url;
        expect(prefill(SAMPLE_API_CARDS[2])).toBe(
            'http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL',
        );
        expect(prefill(SAMPLE_API_CARDS[5])).toBe('https://rickandmortyapi.com/graphql');
    });
});

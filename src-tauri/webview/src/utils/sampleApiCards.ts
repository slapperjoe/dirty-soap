/**
 * Sample API cards — unified explorer empty state (R-03d / doc §5.2, F-03).
 *
 * Data contract for the six sample cards that Phase 3 renders in the unified
 * `EmptyState`. Labels and URLs are the exact values from
 * `docs/UNIFIED_EXPLORER_PARITY_DECISION.md` §5.2 (re-verified against the
 * legacy `ApiExplorerMain.tsx:334–443` card block). Clicking a card
 * pre-fills the URL input with `url` and loads it via `detectLoadFormat(url)`
 * (see `loadRouting.ts`) — the component contract test in
 * `src/__tests__/sampleApiCards.test.ts` pins this shape.
 *
 * Phase 0 (this file) defines the contract; the rendering component lands in
 * Phase 3 (R-07) and consumes this fixture, so the card data cannot drift
 * from the decision doc.
 */
export type SampleCardGroup = "OpenAPI" | "SOAP" | "GraphQL";
export type SampleCardFormat = "openapi" | "wsdl" | "graphql";

export interface SampleApiCard {
    label: string;
    group: SampleCardGroup;
    url: string;
    /** Load path the card drives — consistent with `detectLoadFormat(url)`. */
    format: SampleCardFormat;
}

/**
 * The six cards, in the documented order (OpenAPI ×2, SOAP ×2, GraphQL ×2).
 * URLs are verbatim from doc §5.2 — the `?WSDL`/`?wsdl` query strings are
 * part of the exact URLs and must be preserved.
 */
export const SAMPLE_API_CARDS: SampleApiCard[] = [
    {
        label: "Swagger Petstore",
        group: "OpenAPI",
        url: "https://petstore.swagger.io/v2/swagger.json",
        format: "openapi",
    },
    {
        label: "Petstore YAML",
        group: "OpenAPI",
        url: "https://petstore.swagger.io/v2/swagger.yaml",
        format: "openapi",
    },
    {
        label: "Country Info",
        group: "SOAP",
        url: "http://webservices.oorsprong.org/websamples.countryinfo/CountryInfoService.wso?WSDL",
        format: "wsdl",
    },
    {
        label: "Calculator",
        group: "SOAP",
        url: "http://www.dneonline.com/calculator.asmx?wsdl",
        format: "wsdl",
    },
    {
        label: "SpaceX",
        group: "GraphQL",
        url: "https://spacex-production.up.railway.app/graphql",
        format: "graphql",
    },
    {
        label: "Rick & Morty",
        group: "GraphQL",
        url: "https://rickandmortyapi.com/graphql",
        format: "graphql",
    },
];

/**
 * PERF HARNESS — temporary page for task t_12cc8444 (Monaco perf baseline).
 *
 * Mounts the REAL Monaco components from the package (same code the Tauri
 * webview ships) in a layout that mimics the Unified Explorer screen:
 * a request editor + response viewer + single-line inputs visible at the
 * same time. Exposes `window.__perf` (see perf-instrumentation.ts) and
 * `window.__editorHandles` for driving type / scroll / autocomplete
 * simulations from DevTools.
 */
import "./perf-instrumentation";

import { useCallback, useEffect, useRef, useState, Profiler } from "react";
import styled from "styled-components";

import { MonacoRequestEditor } from "../src/components/MonacoRequestEditor";
import { MonacoResponseViewer } from "../src/components/MonacoResponseViewer";
import { MonacoSingleLineInput } from "../src/components/MonacoSingleLineInput";
import { ThemeProvider } from "../src/contexts/ThemeContext";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #1e1e1e;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  font-size: 12px;
  color: #d4d4d4;
`;

const Button = styled.button`
  padding: 4px 10px;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  background: #2d2d2d;
  color: #d4d4d4;
  font-size: 12px;
  cursor: pointer;
`;

const Row = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const Col = styled.div`
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid #3c3c3c;
`;

const Label = styled.div`
  padding: 3px 8px;
  font-size: 11px;
  color: #8a8a8a;
  background: #252526;
  border-bottom: 1px solid #3c3c3c;
  white-space: nowrap;
  overflow: hidden;
`;

const Slot = styled.div<{ $h?: string }>`
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: ${({ $h }) => $h ?? "100%"};
  flex: ${({ $h }) => (typeof $h === "string" && $h.includes("px") ? "0 0 auto" : "1 1 auto")};
`;

const buildBigResponse = () => {
  // ~630 lines of response XML so the response viewer has real scroll content.
  const lines: string[] = [
    "<soap:Envelope xmlns:soap=\"http://schemas.xmlsoap.org/soap/envelope/\">",
    "  <soap:Body>",
    "    <ns2:GetCountryListResponse xmlns:ns2=\"http://www.oorsprong.org/websamples/service/v1\">",
    "      <ns2:GetCountryListResult>",
  ];
  for (let i = 0; i < 300; i++) {
    lines.push(
      `        <ns3:CountryInfo xmlns:ns3="http://www.oorsprong.org/websamples/service/v1">`,
      `          <ns3:Code>XX${String(i).padStart(2, "0")}</ns3:Code>`,
      `          <ns3:Name>Country number ${i} with a reasonably long display name to simulate real data</ns3:Name>`,
      `          <ns3:Capital>CapitalCity${i}</ns3:Capital>`,
      `          <ns3:Currency>USD</ns3:Currency>`,
      `          <ns3:Language>English</ns3:Language>`,
      `        </ns3:CountryInfo>`,
    );
  }
  lines.push(
    "      </ns2:GetCountryListResult>",
    "    </ns2:GetCountryListResponse>",
    "  </soap:Body>",
    "</soap:Envelope>",
  );
  return lines.join("\n");
};

function handleRenderCommit(id: string, phase: string, actualDuration: number) {
  const w = window as unknown as {
    __reactCommits?: Array<Record<string, unknown>>;
    __perf?: { getPhases?: () => Array<{ label: string; to: number }> };
  };
  if (!w.__reactCommits) w.__reactCommits = [];
  const phases = w.__perf?.getPhases?.() ?? [];
  const current = phases[phases.length - 1];
  w.__reactCommits.push({
    id,
    phase,
    actualDuration,
    t: performance.now(),
    perfPhase: current && current.to === -1 ? current.label : null,
  });
  if (w.__reactCommits.length > 2000) w.__reactCommits.shift();
}

// Exposed for console-driven analysis:
//   __reactStats({ sincePerfPhase: 'typing-40keys' })
(window as unknown as Record<string, unknown>).__reactStats = (filter?: { sincePerfPhase?: string }) => {
  const w = window as unknown as { __reactCommits?: Array<Record<string, unknown>> };
  const all = w.__reactCommits ?? [];
  let rows = all;
  if (filter?.sincePerfPhase) {
    rows = all.filter((c) => c.perfPhase === filter.sincePerfPhase);
  }
  const durs = rows.map((c) => c.actualDuration as number).sort((a, b) => a - b);
  const pct = (p: number) => (durs.length ? durs[Math.min(durs.length - 1, Math.floor((p / 100) * durs.length))] : 0);
  return {
    commits: rows.length,
    totalMs: Math.round(rows.reduce((a, c) => a + (c.actualDuration as number), 0)),
    p50: pct(50),
    p90: pct(90),
    p99: pct(99),
    max: durs[durs.length - 1] ?? 0,
    byId: all
      .filter((c) => !filter || c.perfPhase === filter.sincePerfPhase)
      .reduce((acc: Record<string, { n: number; ms: number }>, c) => {
        acc[c.id as string] = acc[c.id as string] || { n: 0, ms: 0 };
        acc[c.id as string].n += 1;
        acc[c.id as string].ms += c.actualDuration as number;
        return acc;
      }, {}),
  };
};

const BIG_RESPONSE = buildBigResponse();

function PerfHarnessApp() {
  const [requestBody, setRequestBody] = useState(
    `<GetUserRequest xmlns="http://www.oorsprong.org/websamples/service/v1">
  <UserName>mark</UserName>
</GetUserRequest>`,
  );
  const [requestBody2, setRequestBody2] = useState(
    `<GetCountryListRequest xmlns="http://www.oorsprong.org/websamples/service/v1">
</GetCountryListRequest>`,
  );
  const [headerVal, setHeaderVal] = useState("Content-Type: text/xml; charset=utf-8");
  const [authVal, setAuthVal] = useState("Basic dXNlcjpwYXNz");
  const [actionVal, setActionVal] = useState(
    "http://www.oorsprong.org/websamples/service/v1/GetUser",
  );

  // NOTE: onChange handlers are deliberately inline arrows here, matching how
  // the webview passes handlers (inline arrows in UnifiedExplorerMain). This
  // reproduces the per-render listener teardown/re-subscribe churn found in
  // the callback audit (P2) so the baseline reflects shipping usage.
  const handlesRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    (window as unknown as { __editorHandles: Record<string, unknown> }).__editorHandles =
      handlesRef.current;
  }, []);

  // Grab editor handles after mount so scripted simulation can find them.
  // Monaco stores instances per model; match by model value prefix.
  useEffect(() => {
    const t = setTimeout(() => {
      const w = window as unknown as {
        __monaco?: { editor?: { getModels?: () => { getValue?: () => string }[] } };
      };
      const models = w.__monaco?.editor?.getModels?.() ?? [];
      for (const m of models) {
        const v = m.getValue?.() ?? "";
        if (v.startsWith("<GetUserRequest")) handlesRef.current["request1"] = m;
        else if (v.startsWith("<GetCountryListRequest")) handlesRef.current["request2"] = m;
        else if (v.startsWith("<soap:Envelope")) handlesRef.current["response"] = m;
        else if (v.startsWith("Content-Type:")) handlesRef.current["header"] = m;
        else if (v.startsWith("Basic ")) handlesRef.current["auth"] = m;
        else if (v.startsWith("http://www.oorsprong.org")) handlesRef.current["action"] = m;
      }
      (window as unknown as { __editorHandles: Record<string, unknown> }).__editorHandles =
        handlesRef.current;
      console.log("[perf-harness] model handles:", Object.keys(handlesRef.current));
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider>
      <Profiler id="perf-harness" onRender={handleRenderCommit}>
        <Container>
        <Toolbar>
          <strong>PERF HARNESS (t_12cc8444)</strong>
          <span>
            {Object.keys(handlesRef.current).length > 0
              ? "ready — drive via window.__perf / window.__editorHandles"
              : "loading…"}
          </span>
          <Button onClick={() => (window as unknown as { __perf?: { report: () => void } }).__perf?.report()}>
            Print report
          </Button>
          <Button
            onClick={() => {
              (window as unknown as { __perf?: { beginCapture: (label: string) => void; endCapture: () => void } }).__perf
                ?.beginCapture("idle");
              setTimeout(() => (window as unknown as { __perf?: { endCapture: () => void } }).__perf?.endCapture(), 5000);
            }}
          >
            Capture 5s idle
          </Button>
        </Toolbar>
        <Row>
          <Col style={{ flex: "1 1 50%" }}>
            <Label>Request editor (xml, autocomplete, wildcard decorations)</Label>
            <Slot data-editor-name="request1">
              <MonacoRequestEditor
                value={requestBody}
                onChange={(v) => setRequestBody(v)}
                language="xml"
              />
            </Slot>
            <Label>Single-line: Content-Type</Label>
            <Slot $h="28px" data-editor-name="header">
              <MonacoSingleLineInput
                value={headerVal}
                onChange={(v) => setHeaderVal(v)}
                placeholder="Content-Type"
              />
            </Slot>
            <Label>Single-line: Authorization</Label>
            <Slot $h="28px" data-editor-name="auth">
              <MonacoSingleLineInput
                value={authVal}
                onChange={(v) => setAuthVal(v)}
                placeholder="Authorization"
              />
            </Slot>
            <Label>Single-line: SOAP Action</Label>
            <Slot $h="28px" data-editor-name="action">
              <MonacoSingleLineInput
                value={actionVal}
                onChange={(v) => setActionVal(v)}
                placeholder="Action"
              />
            </Slot>
          </Col>
          <Col style={{ flex: "1 1 50%" }}>
            <Label>Response viewer (read-only, ~630-line XML)</Label>
            <Slot data-editor-name="response">
              <MonacoResponseViewer value={BIG_RESPONSE} language="xml" />
            </Slot>
            <Label>Request editor #2 (second per-keystroke model, mimics multi-op screen)</Label>
            <Slot $h="180px" data-editor-name="request2">
              <MonacoRequestEditor
                value={requestBody2}
                onChange={(v) => setRequestBody2(v)}
                language="xml"
              />
            </Slot>
          </Col>
        </Row>
      </Container>
      </Profiler>
    </ThemeProvider>
  );
}

export default () => (
  <ErrorBoundary>
    <PerfHarnessApp />
  </ErrorBoundary>
);
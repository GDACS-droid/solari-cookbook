"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type InvestigationStep = {
  id: string;
  source: string;
  surface: "Browser" | "Sandbox" | "Direct" | "Review";
  status: "pending" | "running" | "complete" | "warning" | "failed";
  detail: string;
  timestamp?: string;
  replayUrl?: string;
};

type StreamPayload = Partial<InvestigationStep> & {
  type?: string;
  stage?: "queued" | "source" | "normalizing" | "complete" | "review_required" | "configuration_required" | "failed";
  runId?: string;
  message?: string;
  error?: string;
  sourceId?: string;
  sessionId?: string;
  sandboxId?: string;
  replayStatus?: "recording_requested" | "available_later";
  clearlyLabeledReplay?: boolean;
  graph?: {
    property: { siteAddress?: string; candidateId?: string; parcelId?: string; countyParcelId?: string; strap?: string; legalDescription?: string; assessment?: { year: number; status: string; justValue: number; assessedValue: number; taxableValue: number; landValue: number; actualYearBuilt: number | null; livingAreaSquareFeet: number | null; landUseCode: string } };
    events: Array<{ eventId: string; eventType: string; eventDate: string; confidence: string; match: string }>;
    evidence: Array<{ evidenceId: string; sourceId: string; sourceUrl: string; retrievedAt: string; confidence: string }>;
  };
  score?: {
    score: number;
    confidence: string;
    reasons: Array<{ points: number; label: string }>;
    unknown: string[];
    disclaimer: string;
  };
};

type OperationsSource = {
  sourceId: string;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  checkedAt: string;
  recordsObserved: number;
  transitionsEmitted: number;
  durationMs: number | null;
  generation: number | null;
};

const property = {
  address: "1447 SE 17th Ter, Cape Coral, FL 33990",
  shortAddress: "1447 SE 17th Ter",
  parcel: "304424C2007000560",
  case: "CODE26-020878",
};

const sampleSteps: InvestigationStep[] = [
  { id: "florida_dor_property_tax_data", source: "Florida DOR — 2026 Lee roll", surface: "Direct", status: "pending", detail: "Replay the privacy-minimized official parcel projection" },
  { id: "cape_coral_open_data_code_cases", source: "Cape Coral — Foreclosure Registration", surface: "Direct", status: "pending", detail: "Replay the source-dated municipal registration" },
  { id: "normalization", source: "Evidence normalization", surface: "Review", status: "pending", detail: "Replay the saved normalized graph and score" },
];

const liveSteps: InvestigationStep[] = [
  { id: "florida_dor_property_tax_data", source: "Florida DOR public-data catalog", surface: "Browser", status: "pending", detail: "Verify the official public-download source" },
  { id: "florida-dor-lee-nal", source: "DOR 2026 Lee NAL roll", surface: "Sandbox", status: "pending", detail: "Download, validate, unzip, and project one parcel" },
  { id: "cape_coral_open_data_code_cases", source: "Cape Coral Foreclosure Registration", surface: "Direct", status: "pending", detail: "Fetch one exact privacy-minimized registration record" },
  { id: "normalization", source: "Exact parcel join + evidence manifest", surface: "Sandbox", status: "pending", detail: "Validate STRAP join, provenance, and transparent score" },
];

const sourceLabels: Record<string, string> = {
  cape_coral_open_data_code_cases: "Cape Coral Code Enforcement",
  cape_coral_open_data_utility_liens: "Cape Coral Utility Liens",
  cape_coral_open_data_building_permits: "Cape Coral Building Permits",
};

function checkedAt(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }).format(date) : "Unknown";
}

function Mark({ kind = "check" }: { kind?: "check" | "warn" | "arrow" | "dot" }) {
  return <span aria-hidden="true" className={`mark mark-${kind}`}>{kind === "check" ? "✓" : kind === "warn" ? "!" : kind === "arrow" ? "↗" : "•"}</span>;
}

function SurfaceBadge({ surface }: { surface: InvestigationStep["surface"] }) {
  return <span className={`surface surface-${surface.toLowerCase()}`}>{surface === "Browser" ? "Solari Browser" : surface === "Sandbox" ? "Solari Sandbox" : surface}</span>;
}

function Status({ status }: { status: InvestigationStep["status"] }) {
  const word = status === "complete" ? "Complete" : status === "running" ? "Checking" : status === "warning" ? "Partial" : status === "failed" ? "Failed" : "Queued";
  return <span className={`run-status run-${status}`}><Mark kind={status === "warning" || status === "failed" ? "warn" : status === "pending" ? "dot" : "check"} />{word}</span>;
}

export default function Home() {
  const [steps, setSteps] = useState(liveSteps);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState("Ready for a fresh, source-by-source check.");
  const [replayUrl, setReplayUrl] = useState<string | undefined>();
  const [runResult, setRunResult] = useState<(Pick<StreamPayload, "graph" | "score" | "clearlyLabeledReplay"> & { reviewRequired?: boolean }) | undefined>();
  const [signup, setSignup] = useState<"idle" | "sending" | "success" | "unavailable">("idle");
  const [pilotAvailability, setPilotAvailability] = useState<"checking" | "available" | "unavailable">("checking");
  const [operations, setOperations] = useState<OperationsSource[]>([]);
  const [operationsAvailable, setOperationsAvailable] = useState<boolean | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const liveInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/pilot-signup", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ configured?: boolean }> : Promise.reject())
      .then((value) => setPilotAvailability(value.configured ? "available" : "unavailable"))
      .catch(() => { if (!controller.signal.aborted) setPilotAvailability("unavailable"); });
    fetch("/api/operations", { signal: controller.signal })
      .then((response) => response.ok ? response.json() as Promise<{ configured?: boolean; sources?: OperationsSource[] }> : Promise.reject())
      .then((value) => { setOperations(value.sources ?? []); setOperationsAvailable(Boolean(value.configured)); })
      .catch(() => { if (!controller.signal.aborted) setOperationsAvailable(false); });
    return () => { controller.abort(); abortRef.current?.abort(); };
  }, []);

  const completed = useMemo(() => steps.filter((step) => step.status === "complete").length, [steps]);

  function updateStep(payload: StreamPayload) {
    const stageId = payload.stage === "normalizing" || payload.stage === "review_required" ? "normalization" : undefined;
    const id = payload.id ?? stageId ?? payload.sourceId ?? payload.source?.toLowerCase().replace(/[^a-z]+/g, "-");
    if (!id) return;
    const source = payload.source ?? (id === "florida_dor_property_tax_data" ? "Florida DOR public-data catalog" : id === "florida-dor-lee-nal" ? "DOR 2026 Lee NAL roll" : id === "cape_coral_open_data_code_cases" ? "Cape Coral Foreclosure Registration" : id === "cape_coral_open_data_utility_liens" ? "Cape Coral Utility Lien Open Data" : id === "normalization" ? "Exact parcel join + evidence manifest" : "Investigation source");
    const surface = payload.surface ?? (id === "normalization" || id === "florida-dor-lee-nal" || payload.sandboxId ? "Sandbox" : id === "florida_dor_property_tax_data" ? "Browser" : id === "cape_coral_open_data_code_cases" || id === "cape_coral_open_data_utility_liens" ? "Direct" : "Review");
    const status = payload.status ?? (payload.stage === "complete" ? "complete" : payload.stage === "review_required" ? "warning" : payload.stage === "failed" || payload.stage === "configuration_required" ? "failed" : "running");
    setSteps((current) => {
      const existing = current.find((item) => item.id === id || item.source === source);
      if (!existing) {
        return [...current, {
          id,
          source,
          surface,
          status,
          detail: payload.detail ?? payload.message ?? "Update received",
          timestamp: payload.timestamp,
          replayUrl: payload.replayUrl,
        }];
      }
      return current.map((item) => (item.id === id || item.source === payload.source ? {
        ...item,
        ...payload,
        source,
        surface,
        status,
        detail: payload.detail ?? payload.message ?? item.detail,
      } : item));
    });
    if (payload.replayUrl) setReplayUrl(payload.replayUrl);
    if ((payload.stage === "complete" || payload.stage === "review_required") && payload.graph && payload.score) setRunResult({ graph: payload.graph, score: payload.score, clearlyLabeledReplay: payload.clearlyLabeledReplay, reviewRequired: payload.stage === "review_required" });
  }

  async function investigate() {
    if (running) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const liveMode = liveInputRef.current?.checked ?? false;
    setRunning(true);
    setReplayUrl(undefined);
    setRunResult(undefined);
    setSteps((liveMode ? liveSteps : sampleSteps).map((item) => ({ ...item })));
    setRunNote("Starting an evidence-backed investigation…");

    try {
      const response = await fetch("/api/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({ mode: liveMode ? "live" : "verified_sample", caseNumber: property.case, propertyAddress: property.address }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const problem = await response.json().catch(() => null) as { error?: string; fallback?: string } | null;
        throw new Error(problem?.error ? `${problem.error}${problem.fallback ? `. ${problem.fallback}` : ""}` : `Investigation service returned ${response.status}`);
      }

      const type = response.headers.get("content-type") ?? "";
      if (type.includes("application/json")) {
        const data = await response.json() as { steps?: StreamPayload[]; replayUrl?: string; message?: string };
        data.steps?.forEach(updateStep);
        if (data.replayUrl) setReplayUrl(data.replayUrl);
        setRunNote(data.message ?? "Investigation finished. Review every claim against its evidence.");
      } else if (response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let receivedTerminal = false;
        while (true) {
          const result = await reader.read();
          if (result.done) break;
          buffer += decoder.decode(result.value, { stream: true });
          const records = buffer.split("\n\n");
          buffer = records.pop() ?? "";
          for (const record of records) {
            const dataLine = record.split("\n").find((line) => line.startsWith("data:"));
            if (!dataLine) continue;
            try {
              const payload = JSON.parse(dataLine.slice(5).trim()) as StreamPayload;
              if (payload.type === "error" || payload.stage === "failed" || payload.stage === "configuration_required") throw new Error(payload.error ?? payload.message ?? "Source check failed");
              if (payload.stage === "queued") setRunNote(payload.message ?? "Investigation queued.");
              else if (payload.stage === "complete" || payload.stage === "review_required") {
                receivedTerminal = true;
                updateStep({ ...payload, id: "normalization", source: "Evidence normalization", surface: payload.clearlyLabeledReplay ? "Review" : "Sandbox", status: payload.stage === "review_required" ? "warning" : "complete" });
                setRunNote(payload.message ?? "Investigation finished. Review every claim against its evidence.");
              } else updateStep(payload);
            } catch (error) {
              if (error instanceof SyntaxError) continue;
              throw error;
            }
          }
        }
        if (!receivedTerminal) setRunNote(liveMode ? "Live investigation ended without a supported terminal result." : "Verified sample replay ended without a supported terminal result.");
        else if (!liveMode) setRunNote("Verified sample replay finished. It does not claim a live Solari session.");
      }
    } catch (error) {
      if ((error as DOMException).name === "AbortError") return;
      const message = error instanceof Error ? error.message : "The investigation could not start.";
      setRunNote(`${message}. No new facts were added.`);
      setSteps((current) => current.map((item) => item.status === "running" || item.status === "pending" ? { ...item, status: "failed", detail: "Not completed — retry when source access is available." } : item));
    } finally {
      setRunning(false);
    }
  }

  async function submitPilot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSignup("sending");
    try {
      const response = await fetch("/api/pilot-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email"), consent: data.get("consent") === "on", website: data.get("website") }) });
      setSignup(response.ok ? "success" : "unavailable");
    } catch {
      setSignup("unavailable");
    }
  }

  function investigateAndShowProgress() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("run-heading")?.focus({ preventScroll: true });
    document.getElementById("live-run")?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
    void investigate();
  }

  return (
    <main>
      <header className="topbar wrap">
        <a className="wordmark" href="#top" aria-label="AcreBrief home"><span>acre</span>brief<span className="wordmark-mark">.</span></a>
        <nav aria-label="Primary navigation"><a href="#today">Today</a><a href="/florida/cape-coral/property-distress">Research</a><a href="#operations">Operations</a><a href="#pilot">Pilot</a></nav>
        <a className="text-link" href="#pilot">Request access <Mark kind="arrow" /></a>
      </header>

      <section id="top" className="hero wrap">
        <div className="eyebrow"><span className="pulse" /> LEE COUNTY · DAILY BRIEF <span className="mode-badge">LIVE-READY OFFICIAL DATA</span></div>
        <div className="hero-grid">
          <div>
            <h1>What changed in Southwest Florida property distress today?</h1>
            <p className="lede">AcreBrief connects the filings, parcels, and official records that acquisition teams normally hunt down by hand — with the evidence attached.</p>
          </div>
          <aside className="verification-card" aria-label="Data mode">
            <span className="tiny-label">VERIFIED SOURCE-DATED CHANGE</span>
            <strong><span className="verified-dot" /> 5 registrations source-opened Aug 31</strong>
            <p>Official Cape Coral timestamps, exact parcel resolution, and current Florida DOR data. Press Investigate to rerun the selected property live.</p>
          </aside>
        </div>
      </section>

      <section id="today" className="wrap summary" aria-labelledby="today-heading">
        <div className="section-heading"><div><span className="tiny-label">OFFICIAL-DATA SNAPSHOT</span><h2 id="today-heading">Acquisition investigation queue</h2></div><span className="as-of">Last live verification: Sep 1, 2026</span></div>
        <div className="metrics" aria-label="Daily property distress summary">
          <div><strong>5</strong><span>foreclosure registrations source-opened Aug 31</span></div>
          <div><strong>1</strong><span>exact parcel resolution</span></div>
          <div><strong>2</strong><span>official source artifacts</span></div>
          <div><strong>4</strong><span>important unknowns</span></div>
        </div>
      </section>

      <section className="wrap ranked" aria-labelledby="ranked-heading">
        <div className="section-heading"><div><span className="tiny-label">RANKED BY EXPLAINABLE SIGNAL</span><h2 id="ranked-heading">Start here</h2></div><span className="sample-note">Sample results — not a representation of live market volume</span></div>
        <article className="property-card">
          <div className="rank">01</div>
          <div className="property-main">
            <div className="card-kicker"><span className="new-chip">SOURCE-DATED AUG 31</span> Municipal foreclosure registration · not yet a snapshot diff</div>
            <h3>{property.shortAddress}</h3>
            <p>Cape Coral, Florida <span aria-hidden="true">·</span> DOR parcel {property.parcel}</p>
            <div className="signal-row"><span><Mark /> Open at Sep 1 retrieval</span><span><Mark /> Exact STRAP match</span><span><Mark /> 2026 DOR roll</span></div>
          </div>
          <div className="score-block"><span className="tiny-label">PRELIMINARY SIGNAL SCORE</span><strong>32</strong><span className="confidence high">High evidence confidence</span></div>
          <button className="investigate-link" type="button" disabled={running} onClick={investigateAndShowProgress}>{running ? "Investigating…" : "Investigate this property live"} <Mark kind="arrow" /></button>
        </article>
      </section>

      <section id="investigate" className="detail wrap" aria-labelledby="brief-heading">
        <div className="detail-header">
          <div><span className="tiny-label">EVIDENCE-BACKED BRIEF · LIVE VERIFIED</span><h2 id="brief-heading">{property.address}</h2><p>Property-centric investigation. Owner, account, mailing, and contact fields are excluded.</p></div>
          <div className="investigate-control"><label className="live-switch"><input ref={liveInputRef} id="live-mode" type="checkbox" defaultChecked /> <span>Run live with Solari</span></label><button className="primary-button" onClick={investigateAndShowProgress} disabled={running} aria-describedby="investigate-status">{running ? "Investigating…" : "Investigate live"}<Mark kind="arrow" /></button><small>Live mode is locked to one approved official-data investigation. Turn it off for the clearly labeled verified replay; failures never fall back silently.</small></div>
        </div>

        <div className="brief-grid">
          <div className="brief-content">
            <section className="facts-panel" aria-labelledby="facts-heading">
              <div className="panel-title"><span className="panel-number">01</span><h3 id="facts-heading">Property facts</h3><span>Source facts · DOR 2026 preliminary</span></div>
              <dl className="facts-grid"><div><dt>DOR parcel / STRAP</dt><dd>{property.parcel}</dd></div><div><dt>County</dt><dd>Lee</dd></div><div><dt>Site address</dt><dd>{property.address}</dd></div><div><dt>Resolution</dt><dd>Exact / high confidence</dd></div><div><dt>2026 preliminary just value</dt><dd>$368,980</dd></div><div><dt>Built / living area</dt><dd>2005 · 3,694 sq ft</dd></div></dl>
            </section>

            <section className="timeline-panel" aria-labelledby="timeline-heading">
              <div className="panel-title"><span className="panel-number">02</span><h3 id="timeline-heading">Event timeline</h3><span>Publication and observed dates</span></div>
              <ol className="timeline">
                <li><time>Aug 31 · 17:42Z</time><div><strong>Foreclosure registration opened</strong><p>Source fact: the City marks municipal case CODE26-020878 as FORECLOSURE REGISTRATION / REGISTERED / Open. It is not a court-case filing.</p><a href="https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5" target="_blank" rel="noreferrer">City Open Data source <Mark kind="arrow" /></a></div></li>
                <li><time>Aug 31 · 17:43Z</time><div><strong>Source record updated</strong><p>Source fact: the official row&apos;s updated timestamp is 50.64 seconds after its opened timestamp. AcreBrief retains both clocks.</p></div></li>
                <li><time>Sep 01 · 15:11Z</time><div><strong>First seen and retrieved</strong><p>AcreBrief observation: this is when the source row was first captured for the verified demo. Retrieval time never replaces the underlying event date.</p></div></li>
                <li><time>2026 roll</time><div><strong>Exact cross-source parcel join</strong><p>Calculated: City STRAP exactly equals DOR PARCEL_ID. No address-only or LLM-imagined join is promoted.</p><a href="https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx" target="_blank" rel="noreferrer">Florida DOR catalog <Mark kind="arrow" /></a></div></li>
              </ol>
            </section>

            <section className="evidence-panel" aria-labelledby="evidence-heading">
              <div className="panel-title"><span className="panel-number">03</span><h3 id="evidence-heading">Evidence ledger</h3><span>Every claim has a trace</span></div>
              <div className="evidence-table" role="table" aria-label="Evidence ledger">
                <div role="row" className="evidence-head"><span role="columnheader">Source</span><span role="columnheader">Observed</span><span role="columnheader">Retrieval</span><span role="columnheader">Confidence</span></div>
                <div role="row"><span role="cell"><span className="mobile-field-label">Source</span><span><strong>Florida DOR NAL</strong><small>Lee 46 · 2026 preliminary</small></span></span><span role="cell"><span className="mobile-field-label">Observed</span><span>Parcel / assessment facts</span></span><span role="cell"><span className="mobile-field-label">Retrieval</span><span>Sep 1 · live-ready</span></span><span role="cell"><span className="mobile-field-label">Confidence</span><span><span className="confidence high">High</span></span></span></div>
                <div role="row"><span role="cell"><span className="mobile-field-label">Source</span><span><strong>Cape Coral Open Data</strong><small>Foreclosure registration</small></span></span><span role="cell"><span className="mobile-field-label">Observed</span><span>Opened Aug 31 · updated Aug 31</span></span><span role="cell"><span className="mobile-field-label">Retrieval</span><span>Sep 1 · live-ready</span></span><span role="cell"><span className="mobile-field-label">Confidence</span><span><span className="confidence high">High</span></span></span></div>
              </div>
              <p className="caption">Source facts are distinct from calculations and inferences. The public demo excludes owners, account numbers, customers, mailing addresses, and contact data. Review originals and title evidence before acting.</p>
            </section>
          </div>

          <aside className="brief-aside">
            <section className="score-card" aria-labelledby="score-heading"><span className="tiny-label">PRELIMINARY SIGNAL SCORE</span><div><strong id="score-heading">32</strong><span className="confidence high">High evidence confidence</span></div><p>Decision support, not a finding of equity, title condition, current payoff, or willingness to sell.</p><ul><li><b>+18</b> Source-dated registration within 7 days</li><li><b>+14</b> Vacant-property foreclosure registration signal</li></ul><div className="unknown"><strong>Unavailable</strong><p>Underlying court case, filing date, tax balance, lien priority, mortgage payoff, equity, title clearance, and seller intent were not established.</p></div></section>
            <section className="unresolved-card"><span className="tiny-label">CALCULATED</span><h3>Exact parcel join</h3><p>City STRAP equals Florida DOR PARCEL_ID after whitespace trim. Both sources return the same property identifier; no owner matching was used.</p><span className="review-state"><Mark /> High-confidence property resolution</span></section>
          </aside>
        </div>
      </section>

      <section id="live-run" className="live-run wrap" aria-labelledby="run-heading">
        <div className="run-heading"><div><span className="tiny-label">SOLARI-POWERED INVESTIGATION</span><h2 id="run-heading" tabIndex={-1}>Watch the evidence come together</h2><p id="investigate-status" aria-live="polite">{runNote}</p></div><div className="run-count"><strong>{completed}/{steps.length}</strong><span>checks complete</span></div></div>
        <div className="run-list">
          {steps.map((step) => <div className="run-item" key={step.id}><Status status={step.status} /><div><strong>{step.source}</strong><p>{step.detail}</p></div><SurfaceBadge surface={step.surface} />{step.timestamp && <time>{step.timestamp}</time>}</div>)}
        </div>
        {runResult?.graph && runResult.score && <section className="run-result" aria-label="Investigation result"><div><span className="tiny-label">{runResult.clearlyLabeledReplay ? "VERIFIED REPLAY RESULT" : runResult.reviewRequired ? "LIVE PUBLICATION CHECK · REVIEW REQUIRED" : "LIVE VERIFIED RESULT"}</span><h3>{runResult.graph.property.siteAddress ?? "Candidate Lee County property"}</h3><p>{runResult.graph.events.length} supported event signal{runResult.graph.events.length === 1 ? "" : "s"} · {runResult.graph.evidence.length} evidence observation{runResult.graph.evidence.length === 1 ? "" : "s"}</p></div><div className="result-score"><strong>{runResult.score.score}</strong><span>{runResult.score.confidence} evidence confidence</span></div><ul>{runResult.score.reasons.map((reason) => <li key={`${reason.points}-${reason.label}`}><b>+{reason.points}</b> {reason.label}</li>)}</ul><div className="result-unknown"><strong>Still unknown</strong><p>{runResult.score.unknown.join(" · ")}</p></div></section>}
        {replayUrl ? <a className="replay-link" href={replayUrl} target="_blank" rel="noreferrer">Watch Solari session replay <Mark kind="arrow" /></a> : <p className="replay-muted">A session replay appears here only when the source run safely provides one.</p>}
      </section>

      <section id="operations" className="operations wrap" aria-labelledby="operations-heading">
        <div className="section-heading"><div><span className="tiny-label">OPERATIONS</span><h2 id="operations-heading">Source readiness, at a glance</h2></div><p className="sample-note">Only affirmative public-download/open-data sources can be LIVE_READY.</p></div>
        <div className="operations-table" role="table" aria-label="Source health">
          <div className="operations-row header" role="row"><span role="columnheader">Source</span><span role="columnheader">Last check</span><span role="columnheader">Status</span><span role="columnheader">Observed result</span></div>
          {operations.map((source) => <div className="operations-row" role="row" key={source.sourceId}><span role="cell"><span className="mobile-field-label">Source</span><strong>{sourceLabels[source.sourceId] ?? source.sourceId}</strong></span><span role="cell"><span className="mobile-field-label">Checked</span><span>{checkedAt(source.checkedAt)}</span></span><span role="cell"><span className="mobile-field-label">Status</span><span className={`health ${source.status === "SUCCEEDED" ? "healthy" : "degraded"}`}><Mark kind={source.status === "SUCCEEDED" ? "check" : "warn"} />{source.status === "SUCCEEDED" ? "LIVE_READY" : source.status}</span></span><span role="cell"><span className="mobile-field-label">Result</span><span>{source.transitionsEmitted} changed · {source.recordsObserved} observed</span></span></div>)}
          {operations.length === 0 && <div className="operations-empty" role="row"><span role="cell">{operationsAvailable === null ? "Loading durable source status…" : operationsAvailable ? "Durable state is ready; the first scheduled source run has not completed yet." : "Durable source status is temporarily unavailable."}</span></div>}
        </div>
      </section>

      <section id="pilot" className="pilot wrap" aria-labelledby="pilot-heading">
        <div><span className="tiny-label">EARLY ACCESS</span><h2 id="pilot-heading">Stop opening five county websites for one property.</h2><p>AcreBrief is built for acquisition teams that need a defensible first look at newly changed property distress. Pilot plans are being shaped with working teams, not invented benchmarks.</p><div className="pricing"><span>Founding concierge pilot</span><strong>$750–$1,500<span>/month</span></strong><p>AcreBrief works your real buy box and delivers source-backed investigations. Final pricing follows paid pilot discovery.</p></div></div>
        {pilotAvailability === "available" ? <form className="pilot-form" onSubmit={submitPilot}><label htmlFor="pilot-email">Work email</label><input id="pilot-email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" /><input className="pilot-honeypot" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" /><label className="pilot-consent"><input name="consent" type="checkbox" required /> <span>AcreBrief may email me about the founding pilot.</span></label><button className="primary-button" type="submit" disabled={signup === "sending"}>{signup === "sending" ? "Sending…" : "Request pilot access"}<Mark kind="arrow" /></button>{signup === "success" && <p className="form-success" aria-live="polite">Thanks — your request is stored in the pilot queue.</p>}{signup === "unavailable" && <p className="form-error" aria-live="polite">The approved intake database did not accept this request. Nothing was claimed as stored.</p>}<small>Public records only. No contact enrichment or automated outreach.</small></form> : <div className="pilot-form pilot-unavailable" role="status"><span className="tiny-label">{pilotAvailability === "checking" ? "CHECKING INTAKE" : "INTAKE NOT YET OPEN"}</span><h3>{pilotAvailability === "checking" ? "Confirming the pilot queue…" : "Pilot applications need an approved destination."}</h3><p>{pilotAvailability === "checking" ? "AcreBrief is checking whether this deployment has a real storage sink." : "The durable intake database is unavailable, so AcreBrief will not show a form that returns an error or pretend an application was saved."}</p><small>Public records only. No contact enrichment or automated outreach.</small></div>}
      </section>

      <footer className="footer wrap"><a className="wordmark" href="#top"><span>acre</span>brief<span className="wordmark-mark">.</span></a><p>Public-record property intelligence · Evidence-first by design</p><a href="/florida/cape-coral/property-distress">Cape Coral monitor <Mark kind="arrow" /></a></footer>
    </main>
  );
}

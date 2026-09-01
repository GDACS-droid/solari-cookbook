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
    property: { siteAddress?: string; candidateId?: string; parcelId?: string };
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

const property = {
  address: "3302 E 3rd St, Lehigh Acres, FL 33936",
  shortAddress: "3302 E 3rd St",
  parcel: "35-44-27-09-00035.001B",
  case: "26-CA-001793",
};

const sampleSteps: InvestigationStep[] = [
  { id: "lee-business-observer-notice-of-action", source: "Legal notice — notice of action", surface: "Direct", status: "pending", detail: "Replay the May 8 public notice artifact" },
  { id: "lee-business-observer-foreclosure-sale", source: "Legal notice — foreclosure sale", surface: "Direct", status: "pending", detail: "Replay the Aug 28 public notice artifact" },
  { id: "lee-community-development-permit-report", source: "Lee County permit report", surface: "Direct", status: "pending", detail: "Replay the official May 2021 permit artifact" },
  { id: "normalization", source: "Evidence normalization", surface: "Review", status: "pending", detail: "Replay the saved normalized graph and score" },
];

const liveSteps: InvestigationStep[] = [
  { id: "lee-clerk-matrix", source: "Lee Clerk — Circuit Civil", surface: "Browser", status: "pending", detail: "Confirm public case evidence" },
  { id: "lee-property-appraiser", source: "Lee Property Appraiser", surface: "Browser", status: "pending", detail: "Resolve the address crosswalk" },
  { id: "lee-tax-collector", source: "Lee Tax Collector", surface: "Browser", status: "pending", detail: "Check availability; do not assert an unverified tax balance" },
  { id: "lee-business-observer-notice-of-action", source: "Legal notice — notice of action", surface: "Browser", status: "pending", detail: "Check redacted case/property markers without recording the page" },
  { id: "lee-business-observer-foreclosure-sale", source: "Legal notice — foreclosure sale", surface: "Browser", status: "pending", detail: "Check redacted sale markers without recording the page" },
  { id: "normalization", source: "Evidence normalization", surface: "Sandbox", status: "pending", detail: "Normalize, deduplicate, and score" },
];

const sourceHealth = [
  ["Public legal notices", "Aug 31", "Verified fixture", "2"],
  ["Lee permit report", "Aug 31", "Verified fixture", "0"],
  ["Lee Clerk Matrix", "Not run", "Gated", "—"],
  ["Lee Property Appraiser", "Not run", "Gated", "—"],
  ["Lee Tax Collector", "Not run", "Research", "—"],
];

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
  const [steps, setSteps] = useState(sampleSteps);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState("Ready for a fresh, source-by-source check.");
  const [replayUrl, setReplayUrl] = useState<string | undefined>();
  const [runResult, setRunResult] = useState<(Pick<StreamPayload, "graph" | "score" | "clearlyLabeledReplay"> & { reviewRequired?: boolean }) | undefined>();
  const [signup, setSignup] = useState<"idle" | "sending" | "success" | "unavailable">("idle");
  const abortRef = useRef<AbortController | null>(null);
  const liveInputRef = useRef<HTMLInputElement | null>(null);
  const liveTokenRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const completed = useMemo(() => steps.filter((step) => step.status === "complete").length, [steps]);

  function updateStep(payload: StreamPayload) {
    const stageId = payload.stage === "normalizing" || payload.stage === "review_required" ? "normalization" : undefined;
    const id = payload.id ?? stageId ?? payload.sourceId ?? payload.source?.toLowerCase().replace(/[^a-z]+/g, "-");
    if (!id) return;
    const source = payload.source ?? (id === "lee-clerk-court-cases" || id === "lee-clerk-matrix" ? "Lee Clerk — Circuit Civil" : id === "lee-property-appraiser" ? "Lee Property Appraiser" : id === "lee-tax-collector" ? "Lee Tax Collector" : id === "lee-business-observer-notice-of-action" ? "Legal notice — notice of action" : id === "lee-business-observer-foreclosure-sale" ? "Legal notice — foreclosure sale" : id === "lee-community-development-permit-report" ? "Lee County permit report" : id === "normalization" ? "Evidence normalization" : "Investigation source");
    const surface = payload.surface ?? (id === "normalization" || payload.sandboxId ? "Sandbox" : id === "lee-clerk-court-cases" || id === "lee-clerk-matrix" || id === "lee-property-appraiser" || id === "lee-tax-collector" || id === "lee-business-observer-notice-of-action" || id === "lee-business-observer-foreclosure-sale" ? "Browser" : "Review");
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
          ...(liveMode && liveTokenRef.current?.value ? { "x-acrebrief-live-token": liveTokenRef.current.value } : {}),
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
      const response = await fetch("/api/pilot-signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: data.get("email") }) });
      setSignup(response.ok ? "success" : "unavailable");
    } catch {
      setSignup("unavailable");
    }
  }

  return (
    <main>
      <header className="topbar wrap">
        <a className="wordmark" href="#top" aria-label="AcreBrief home"><span>acre</span>brief<span className="wordmark-mark">.</span></a>
        <nav aria-label="Primary navigation"><a href="#today">Today</a><a href="#operations">Operations</a><a href="#pilot">Pilot</a></nav>
        <a className="text-link" href="#pilot">Request access <Mark kind="arrow" /></a>
      </header>

      <section id="top" className="hero wrap">
        <div className="eyebrow"><span className="pulse" /> LEE COUNTY · DAILY BRIEF <span className="mode-badge">VERIFIED SAMPLE</span></div>
        <div className="hero-grid">
          <div>
            <h1>What changed in Southwest Florida property distress today?</h1>
            <p className="lede">AcreBrief connects the filings, parcels, and official records that acquisition teams normally hunt down by hand — with the evidence attached.</p>
          </div>
          <aside className="verification-card" aria-label="Data mode">
            <span className="tiny-label">DATA MODE</span>
            <strong><span className="verified-dot" /> Verified public-record sample</strong>
            <p>Demonstration fixture, last checked Aug 31. Run a live investigation to fetch fresh source evidence.</p>
          </aside>
        </div>
      </section>

      <section id="today" className="wrap summary" aria-labelledby="today-heading">
        <div className="section-heading"><div><span className="tiny-label">VERIFIED FIXTURE</span><h2 id="today-heading">Acquisition investigation queue</h2></div><span className="as-of">Snapshot retrieved: Aug 31, 2026</span></div>
        <div className="metrics" aria-label="Daily property distress summary">
          <div><strong>2</strong><span>public-record signals</span></div>
          <div><strong>1</strong><span>candidate property brief</span></div>
          <div><strong>3</strong><span>evidence artifacts</span></div>
          <div><strong>3</strong><span>important unknowns</span></div>
        </div>
      </section>

      <section className="wrap ranked" aria-labelledby="ranked-heading">
        <div className="section-heading"><div><span className="tiny-label">RANKED BY EXPLAINABLE SIGNAL</span><h2 id="ranked-heading">Start here</h2></div><span className="sample-note">Sample results — not a representation of live market volume</span></div>
        <article className="property-card">
          <div className="rank">01</div>
          <div className="property-main">
            <div className="card-kicker"><span className="new-chip">SAMPLE</span> Legal notice published · Aug 28</div>
            <h3>{property.shortAddress}</h3>
            <p>Lehigh Acres, Florida <span aria-hidden="true">·</span> Permit-era parcel ref. {property.parcel}</p>
            <div className="signal-row"><span><Mark /> Foreclosure case signal</span><span><Mark /> Auction scheduled</span><span><Mark kind="warn" /> Candidate property join</span></div>
          </div>
          <div className="score-block"><span className="tiny-label">OPPORTUNITY</span><strong>46</strong><span className="confidence medium">Medium confidence</span></div>
          <a className="investigate-link" href="#investigate">Review brief <Mark kind="arrow" /></a>
        </article>
      </section>

      <section id="investigate" className="detail wrap" aria-labelledby="brief-heading">
        <div className="detail-header">
          <div><span className="tiny-label">EVIDENCE-BACKED BRIEF · {property.case}</span><h2 id="brief-heading">{property.address}</h2><p>Property-centric investigation. No contact enrichment is displayed.</p></div>
          <div className="investigate-control"><label className="live-switch"><input ref={liveInputRef} id="live-mode" type="checkbox" /> <span>Use authorized live Solari run</span></label><label className="token-field" htmlFor="live-token">Demo access token<input ref={liveTokenRef} id="live-token" type="password" autoComplete="off" placeholder="Required for paid live runs" /></label><button className="primary-button" onClick={investigate} disabled={running} aria-describedby="investigate-status">{running ? "Investigating…" : "Investigate"}<Mark kind="arrow" /></button><small>Default: clearly labeled verified-sample replay. Live runs require a server-approved source policy, Solari key, and demo token; failure never falls back to sample.</small></div>
        </div>

        <div className="brief-grid">
          <div className="brief-content">
            <section className="facts-panel" aria-labelledby="facts-heading">
              <div className="panel-title"><span className="panel-number">01</span><h3 id="facts-heading">Property facts</h3><span>Candidate crosswalk</span></div>
              <dl className="facts-grid"><div><dt>Permit-era parcel ref.</dt><dd>{property.parcel}</dd></div><div><dt>County</dt><dd>Lee</dd></div><div><dt>Site address</dt><dd>{property.address}</dd></div><div><dt>Resolution</dt><dd>Candidate / medium confidence</dd></div><div><dt>Legal description</dt><dd>E 1/2 Lot 1 Block 35 Unit 9</dd></div><div><dt>Not asserted</dt><dd>Current assessor ID, value, tax balance</dd></div></dl>
            </section>

            <section className="timeline-panel" aria-labelledby="timeline-heading">
              <div className="panel-title"><span className="panel-number">02</span><h3 id="timeline-heading">Event timeline</h3><span>Publication and observed dates</span></div>
              <ol className="timeline">
                <li><time>May 08</time><div><strong>Foreclosure case signal detected</strong><p>Case {property.case} is associated with this candidate property join. Confirm against the court docket before acting.</p><a href="https://legals.businessobserverfl.com/news/2026/may/08/26-01775l/" target="_blank" rel="noreferrer">Legal-notice evidence <Mark kind="arrow" /></a></div></li>
                <li><time>Aug 28</time><div><strong>Auction scheduled</strong><p>Legal notice gives a scheduled auction date of Sep 17. This is a public notice, not proof of current sale status.</p><a href="https://legals.businessobserverfl.com/news/2026/aug/28/26-03493l/" target="_blank" rel="noreferrer">Notice evidence <Mark kind="arrow" /></a></div></li>
                <li><time>May 18 ’21</time><div><strong>Permit report crosswalk</strong><p>Official permit report aligns on address and legal reference; its parcel reference is not asserted as a current assessor identifier.</p><a href="https://www.leegov.com/dcd/rpts/Documents/LehighPermits/2021/May/LA2021MayBPR.PDF" target="_blank" rel="noreferrer">Lee County permit report <Mark kind="arrow" /></a></div></li>
              </ol>
            </section>

            <section className="evidence-panel" aria-labelledby="evidence-heading">
              <div className="panel-title"><span className="panel-number">03</span><h3 id="evidence-heading">Evidence ledger</h3><span>Every claim has a trace</span></div>
              <div className="evidence-table" role="table" aria-label="Evidence ledger">
                <div role="row" className="evidence-head"><span role="columnheader">Source</span><span role="columnheader">Observed</span><span role="columnheader">Retrieval</span><span role="columnheader">Confidence</span></div>
                <div role="row"><span role="cell"><strong>Legal notice</strong><small>Case {property.case}</small></span><span role="cell">Foreclosure &amp; auction signal</span><span role="cell">Aug 31 · 11:00 ET</span><span role="cell"><span className="confidence high">High</span></span></div>
                <div role="row"><span role="cell"><strong>Lee County permit report</strong><small>RES2020-09004</small></span><span role="cell">Address / legal crosswalk</span><span role="cell">Aug 31 · 11:00 ET</span><span role="cell"><span className="confidence high">High</span></span></div>
              </div>
              <p className="caption">Source facts are distinct from scoring. Evidence URLs open the exact public artifact; the legal notices are not a county-hosted docket. Review originals before outreach or an offer.</p>
            </section>
          </div>

          <aside className="brief-aside">
            <section className="score-card" aria-labelledby="score-heading"><span className="tiny-label">PRELIMINARY SCORE</span><div><strong id="score-heading">46</strong><span className="confidence medium">Medium confidence</span></div><p>Decision support, not a finding of distress, equity, title condition, or willingness to sell.</p><ul><li><b>+18</b> Recent auction-scheduled signal (4d)</li><li><b>+16</b> Foreclosure case signal</li><li><b>+12</b> Auction scheduled</li></ul><div className="unknown"><strong>Unknown</strong><p>Current assessor parcel ID, tax balance, mortgage payoff, and equity are unavailable in this public-record sample.</p></div></section>
            <section className="unresolved-card"><span className="tiny-label">REVIEW QUEUE</span><h3>Candidate property join</h3><p>Legal-notice address/legal and the permit report align. Resolve to the current assessor parcel before promoting this candidate as a property fact.</p><span className="review-state"><Mark kind="warn" /> Official assessor confirmation required</span></section>
          </aside>
        </div>
      </section>

      <section className="live-run wrap" aria-labelledby="run-heading">
        <div className="run-heading"><div><span className="tiny-label">SOLARI-POWERED INVESTIGATION</span><h2 id="run-heading">Watch the evidence come together</h2><p id="investigate-status" aria-live="polite">{runNote}</p></div><div className="run-count"><strong>{completed}/{steps.length}</strong><span>checks complete</span></div></div>
        <div className="run-list">
          {steps.map((step) => <div className="run-item" key={step.id}><Status status={step.status} /><div><strong>{step.source}</strong><p>{step.detail}</p></div><SurfaceBadge surface={step.surface} />{step.timestamp && <time>{step.timestamp}</time>}</div>)}
        </div>
        {runResult?.graph && runResult.score && <section className="run-result" aria-label="Investigation result"><div><span className="tiny-label">{runResult.clearlyLabeledReplay ? "VERIFIED REPLAY RESULT" : runResult.reviewRequired ? "FRESH PUBLICATION VERIFICATION · REVIEW REQUIRED" : "FRESH LIVE RESULT"}</span><h3>{runResult.graph.property.siteAddress ?? "Candidate Lee County property"}</h3><p>{runResult.graph.events.length} supported event signal{runResult.graph.events.length === 1 ? "" : "s"} · {runResult.graph.evidence.length} evidence observation{runResult.graph.evidence.length === 1 ? "" : "s"}</p></div><div className="result-score"><strong>{runResult.score.score}</strong><span>{runResult.score.confidence} confidence</span></div><ul>{runResult.score.reasons.map((reason) => <li key={`${reason.points}-${reason.label}`}><b>+{reason.points}</b> {reason.label}</li>)}</ul><div className="result-unknown"><strong>Still unknown</strong><p>{runResult.score.unknown.join(" · ")}</p></div></section>}
        {replayUrl ? <a className="replay-link" href={replayUrl} target="_blank" rel="noreferrer">Watch Solari session replay <Mark kind="arrow" /></a> : <p className="replay-muted">A session replay appears here only when the source run safely provides one.</p>}
      </section>

      <section id="operations" className="operations wrap" aria-labelledby="operations-heading">
        <div className="section-heading"><div><span className="tiny-label">OPERATIONS</span><h2 id="operations-heading">Source readiness, at a glance</h2></div><p className="sample-note">Observed fixture state — unrun sources are never shown as healthy.</p></div>
        <div className="operations-table" role="table" aria-label="Source health">
          <div className="operations-row header" role="row"><span role="columnheader">Source</span><span role="columnheader">Last check</span><span role="columnheader">Status</span><span role="columnheader">New events</span></div>
          {sourceHealth.map(([source, check, health, events]) => <div className="operations-row" role="row" key={source}><span role="cell"><strong>{source}</strong></span><span role="cell">{check}</span><span role="cell"><span className={`health ${health === "Verified fixture" ? "healthy" : "degraded"}`}><Mark kind={health === "Verified fixture" ? "check" : "warn"} />{health}</span></span><span role="cell">{events}</span></div>)}
        </div>
      </section>

      <section id="pilot" className="pilot wrap" aria-labelledby="pilot-heading">
        <div><span className="tiny-label">EARLY ACCESS</span><h2 id="pilot-heading">Stop opening five county websites for one property.</h2><p>AcreBrief is built for acquisition teams that need a defensible first look at newly changed property distress. Pilot plans are being shaped with working teams, not invented benchmarks.</p><div className="pricing"><span>Pilot hypothesis</span><strong>$499<span>/seat/month</span></strong><p>Daily briefs, live investigations, evidence export, and review queue. Final pricing follows pilot discovery.</p></div></div>
        <form className="pilot-form" onSubmit={submitPilot}><label htmlFor="pilot-email">Work email</label><input id="pilot-email" name="email" type="email" autoComplete="email" required placeholder="you@company.com" /><button className="primary-button" type="submit" disabled={signup === "sending"}>{signup === "sending" ? "Sending…" : "Request pilot access"}<Mark kind="arrow" /></button>{signup === "success" && <p className="form-success" aria-live="polite">Thanks — your request is in the pilot queue.</p>}{signup === "unavailable" && <p className="form-error" aria-live="polite">Pilot signup is not configured on this deployment yet. Please try again after the demo is connected.</p>}<small>Public records only. No contact enrichment or automated outreach.</small></form>
      </section>

      <footer className="footer wrap"><a className="wordmark" href="#top"><span>acre</span>brief<span className="wordmark-mark">.</span></a><p>Public-record property intelligence · Evidence-first by design</p><a href="#today">Back to today <Mark kind="arrow" /></a></footer>
    </main>
  );
}

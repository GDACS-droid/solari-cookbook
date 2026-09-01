import type { Metadata } from "next";
import Link from "next/link";

const pageUrl = "https://acrebrief.com/florida/cape-coral/property-distress";
const citySource = "https://capeims.capecoral.gov/arcgis/rest/services/OpenData/OpenData/MapServer/5";
const dorSource = "https://www.floridarevenue.com/property/Pages/DataPortal_RequestAssessmentRollGISData.aspx";

export const metadata: Metadata = {
  title: "Cape Coral Property Distress Monitor",
  description:
    "A source-backed Cape Coral property-distress snapshot with event clocks, parcel resolution, methodology, and explicit unknowns.",
  alternates: { canonical: pageUrl },
  openGraph: {
    type: "article",
    url: pageUrl,
    title: "Cape Coral Property Distress Monitor",
    description:
      "Verified municipal foreclosure-registration events joined to Florida DOR parcel facts, with source provenance and limitations.",
    publishedTime: "2026-09-01T00:00:00.000Z",
    modifiedTime: "2026-09-01T00:00:00.000Z",
  },
};

const articleStructuredData = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Cape Coral Property Distress Monitor",
  description:
    "A source-backed Cape Coral property-distress snapshot with event clocks, parcel resolution, methodology, and explicit unknowns.",
  datePublished: "2026-09-01",
  dateModified: "2026-09-01",
  mainEntityOfPage: pageUrl,
  author: { "@type": "Organization", name: "AcreBrief", url: "https://acrebrief.com" },
  publisher: { "@type": "Organization", name: "AcreBrief", url: "https://acrebrief.com" },
};

const breadcrumbStructuredData = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "AcreBrief", item: "https://acrebrief.com" },
    { "@type": "ListItem", position: 2, name: "Cape Coral Property Distress Monitor", item: pageUrl },
  ],
};

function structuredData(value: object) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

export default function CapeCoralPropertyDistressPage() {
  return (
    <main className="intel-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData(articleStructuredData) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredData(breadcrumbStructuredData) }} />

      <header id="top" className="topbar wrap">
        <Link className="wordmark" href="/" aria-label="AcreBrief home"><span>acre</span>brief<span className="wordmark-mark">.</span></Link>
        <nav aria-label="Research navigation"><Link href="/#today">Live brief</Link><a href="#methodology">Methodology</a><a href="#limitations">Limits</a></nav>
        <Link className="text-link" href="/#today">Open live app <span aria-hidden="true">↗</span></Link>
      </header>

      <article>
        <header className="intel-hero wrap">
          <div className="intel-breadcrumb" aria-label="Breadcrumb"><Link href="/">AcreBrief</Link><span aria-hidden="true">/</span><span>Florida</span><span aria-hidden="true">/</span><span>Cape Coral</span></div>
          <span className="eyebrow">PUBLIC-RECORD MARKET INTELLIGENCE · VERIFIED SEP 1, 2026</span>
          <h1>Cape Coral Property Distress Monitor</h1>
          <p className="lede">A privacy-minimized view of property-level changes from approved government sources—separating event time, observation time, source facts, calculations, and unknowns.</p>
        </header>

        <section className="intel-answer wrap" aria-labelledby="answer-heading">
          <div>
            <span className="tiny-label">DIRECT ANSWER</span>
            <h2 id="answer-heading">What changed in Cape Coral property distress?</h2>
            <p>In AcreBrief&apos;s verified August 31 source window, Cape Coral&apos;s official Code Enforcement Open Data returned <strong>five municipal foreclosure-registration records</strong>. AcreBrief resolved one registration to an exact Florida DOR parcel for a live investigation.</p>
            <p className="intel-caveat"><strong>Scope:</strong> these are municipal registrations—not court filings, judgments, auctions, title findings, or proof that an owner wants to sell. This is a verified source window, not a complete current market count.</p>
          </div>
          <dl className="intel-clocks" aria-label="Temporal provenance">
            <div><dt>Event window</dt><dd>Aug 31, 2026</dd></div>
            <div><dt>First observed</dt><dd>Sep 1, 2026</dd></div>
            <div><dt>Last verified</dt><dd>Sep 1, 2026</dd></div>
            <div><dt>Jurisdiction</dt><dd>Cape Coral · Lee County</dd></div>
          </dl>
        </section>

        <section className="intel-section wrap" aria-labelledby="sample-heading">
          <div className="intel-section-heading">
            <div><span className="tiny-label">ONE PUBLIC, PROPERTY-FIRST SAMPLE</span><h2 id="sample-heading">1447 SE 17th Ter, Cape Coral</h2></div>
            <Link className="primary-button" href="/#investigate">Open live investigation <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="intel-fact-grid">
            <div><span>Source fact</span><strong>CODE26-020878</strong><p>Municipal case type: FORECLOSURE REGISTRATION / REGISTERED.</p></div>
            <div><span>Source fact</span><strong>Aug 31 · 17:42Z</strong><p>City-published opened timestamp; updated 50.64 seconds later.</p></div>
            <div><span>Calculation</span><strong>Exact parcel join</strong><p>City STRAP equals DOR PARCEL_ID after whitespace normalization.</p></div>
            <div><span>Source fact</span><strong>$368,980</strong><p>Florida DOR 2026 preliminary just value; not a sale price or AVM.</p></div>
          </div>
          <p className="intel-privacy">The public sample excludes owner names, account numbers, mailing addresses, phone numbers, emails, and free-text complaint descriptions.</p>
        </section>

        <section className="intel-section wrap" aria-labelledby="meaning-heading">
          <span className="tiny-label">INTERPRETATION</span>
          <h2 id="meaning-heading">What does a Cape Coral foreclosure registration establish?</h2>
          <div className="intel-provenance-grid">
            <div className="intel-provenance source"><strong>Source fact</strong><p>The City row identifies a municipal case as a foreclosure registration, records an opened timestamp, reports an open status at retrieval, and links the row to a STRAP.</p></div>
            <div className="intel-provenance calculated"><strong>Calculated</strong><p>AcreBrief can join the City STRAP to the same identifier in Florida&apos;s DOR property roll and retain the evidence path for that match.</p></div>
            <div className="intel-provenance inference"><strong>Inference</strong><p>The registration is an acquisition-research signal. It is not, by itself, proof of present equity, title condition, sale readiness, or seller intent.</p></div>
            <div className="intel-provenance unknown"><strong>Unavailable</strong><p>The demo does not establish the court filing, filing date, mortgage payoff, tax balance, lien priority, or title clearance.</p></div>
          </div>
        </section>

        <section id="methodology" className="intel-section wrap" aria-labelledby="method-heading">
          <span className="tiny-label">REPRODUCIBLE METHOD</span>
          <h2 id="method-heading">How AcreBrief produced this investigation</h2>
          <ol className="intel-method">
            <li><span>01</span><div><strong>Read an approved event source</strong><p>Query only the fields required from the City&apos;s official ArcGIS Open Data layer; omit person/contact and free-text fields.</p></div></li>
            <li><span>02</span><div><strong>Preserve independent clocks</strong><p>Retain the City&apos;s opened and updated timestamps separately from AcreBrief&apos;s first-seen and retrieval timestamps.</p></div></li>
            <li><span>03</span><div><strong>Resolve the parcel conservatively</strong><p>Require an exact STRAP-to-DOR parcel match. Uncertain joins enter review instead of becoming facts.</p></div></li>
            <li><span>04</span><div><strong>Attach evidence and unknowns</strong><p>Render source facts, calculations, inferences, and unavailable facts as distinct categories.</p></div></li>
          </ol>
          <div className="intel-sources" aria-label="Official sources">
            <a href={citySource} target="_blank" rel="noreferrer"><span>Official source</span><strong>City of Cape Coral Code Enforcement Open Data</strong><em>ArcGIS layer 5 ↗</em></a>
            <a href={dorSource} target="_blank" rel="noreferrer"><span>Official source</span><strong>Florida DOR Property Tax Data Portal</strong><em>Assessment roll catalog ↗</em></a>
          </div>
        </section>

        <section id="limitations" className="intel-section intel-limitations wrap" aria-labelledby="limits-heading">
          <span className="tiny-label">LIMITATIONS</span>
          <h2 id="limits-heading">What this page does not claim</h2>
          <ul>
            <li>It is not a foreclosure-case list, title report, appraisal, legal opinion, or proof of distress or willingness to sell.</li>
            <li>The count describes one verified source window and is not silently presented as a continuously updated market total.</li>
            <li>The 2026 DOR value is a preliminary assessment-roll fact, not an estimated resale value or current equity calculation.</li>
            <li>A professional must review originals and current title, tax, court, and property evidence before acting.</li>
          </ul>
        </section>

        <section className="intel-cta wrap" aria-labelledby="cta-heading">
          <div><span className="tiny-label">FROM MARKET SIGNAL TO EVIDENCE-BACKED BRIEF</span><h2 id="cta-heading">See the source checks run.</h2><p>The live AcreBrief demo uses Solari Browser and Sandbox to verify, retrieve, parse, join, and explain approved official data for the selected property.</p></div>
          <div><Link className="primary-button" href="/#investigate">Investigate the property <span aria-hidden="true">↗</span></Link><Link className="text-link" href="/#pilot">Discuss a founding pilot <span aria-hidden="true">↗</span></Link></div>
        </section>
      </article>

      <footer className="footer wrap"><Link className="wordmark" href="/"><span>acre</span>brief<span className="wordmark-mark">.</span></Link><p>Public-record property intelligence · Evidence-first by design</p><a href="#top">Back to top <span aria-hidden="true">↑</span></a></footer>
    </main>
  );
}

import { Fragment, useEffect, useRef, useState } from "react";
import { api, getUser } from "../api.js";
import { readPassengerSheet, latinDigits } from "../utils/passengerSheet.js";
import { readTableSheet } from "../utils/readTableSheet.js";
import "./PassengerChecker.css";

const labels = { matched: "Matched", mismatch: "Passenger mismatch", missing: "Bus missing on this date", ambiguous: "Ambiguous bus number" };
const blank = () => ({ date: "", bus: "", passengers: "", source: "Manual row" });
const endpoint = "/passenger-checks";
const diagnosticKey = row => `${row.table}:${row.band}`;
function SourceCells({ cells = [] }) {
  return <div className="checker-cell-evidence">{cells.map((cell, index) => <div key={index} className="checker-cell-crop">
    <strong>{cell.label}</strong><span className="checker-unverified">Unverified engine output</span>
    {cell.image && <a href={cell.image} target="_blank" rel="noopener noreferrer" aria-label={`Open ${cell.label} source crop`}><img src={cell.image} alt={`${cell.label} source crop — check against the original sheet`} /></a>}
    <span>Raw text</span><pre>{cell.text || "(No text recognized)"}</pre>
  </div>)}</div>;
}
export default function PassengerChecker({ canWrite }) {
  const user = getUser();
  const isAdmin = ["admin", "super_admin"].includes(user?.role);
  const [rows, setRows] = useState([]), [pages, setPages] = useState([]), [page, setPage] = useState(0);
  const [filename, setFilename] = useState("Manual check"), [channel, setChannel] = useState("digital");
  const [confirmed, setConfirmed] = useState(false), [result, setResult] = useState(null), [saved, setSaved] = useState(null);
  const [history, setHistory] = useState([]), [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [decision, setDecision] = useState("reviewed"), [note, setNote] = useState("");
  const [readerEnabled, setReaderEnabled] = useState(false), [readerMode, setReaderMode] = useState("local"), [consent, setConsent] = useState(false);
  const [readerStatus, setReaderStatus] = useState("Checking whether this website has the Bengali beta assets…");
  const [diagnostics, setDiagnostics] = useState([]);
  const [dirty, setDirty] = useState(false), [audit, setAudit] = useState(null);
  const controller = useRef(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    let active = true;
    const readiness = new AbortController();
    if (!globalThis.isSecureContext || !globalThis.crypto?.subtle || typeof WebAssembly !== "object" || typeof Worker !== "function" || typeof createImageBitmap !== "function") {
      setReaderStatus("The Bengali beta needs HTTPS (or localhost) and a browser with WebAssembly, Web Workers, image decoding and secure cryptography. Open the secure website in a current browser, or use the printed reader / manual entry.");
      return () => { active = false; };
    }
    // Read only the same-origin manifest here. Model and WASM downloads require consent and an image upload.
    fetch("/checker-handwriting/bengali-specialist/manifest.json", { cache: "no-store", mode: "same-origin", redirect: "error", signal: readiness.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!active) return;
        const available = data?.alphabet?.length === 91 && /^[a-f0-9]{64}$/.test(data?.sha256 || "") && Number.isSafeInteger(data?.bytes) && data.bytes > 0;
        setReaderEnabled(available);
        setReaderStatus(available ? "" : "Bengali beta assets are missing or incomplete on this website. Ask an administrator to deploy the specialist model and runtime files, then refresh. Printed reading and manual entry remain available.");
      })
      .catch(() => { if (active) setReaderStatus("Could not check this website’s Bengali beta assets. Check your connection and refresh; if this continues, ask an administrator to deploy the specialist model and runtime files. Printed reading and manual entry remain available."); });
    return () => { active = false; readiness.abort(); };
  }, []);
  useEffect(() => { let active = true; api.get(`${endpoint}?offset=${offset}`).then(data => active && setHistory(data)).catch(e => active && setError(e.message)); return () => { active = false; }; }, [offset]);
  const refresh = () => api.get(`${endpoint}?offset=${offset}`).then(setHistory);
  const invalidate = () => { setConfirmed(false); setResult(null); setNotice(""); setDirty(true); };
  const editable = !saved || isAdmin || saved.created_by === user?.id;
  async function run(label, action) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (e) { if (mounted.current) setError(e.message || "Unable to complete the check."); } finally { if (mounted.current) setBusy(""); }
  }
  function acceptSaved(data, keepSource = false) {
    setSaved(data); setFilename(data.input.filename); setChannel(data.input.channel);
    setRows(data.input.rows.map((row, index) => keepSource && rows[index]?._specialist ? { ...row, _specialist: rows[index]._specialist } : row)); setResult(data.result); setConfirmed(false);
    if (!keepSource) setDiagnostics([]);
    setDirty(false); setAudit(null);
    setNote(data.review_note || ""); setDecision(data.review_status === "pending" ? "reviewed" : data.review_status);
  }
  async function upload(file) {
    if (!file) return;
    await run("Opening document…", async () => {
      const specialist = readerMode === "specialist";
      if (specialist && (!readerEnabled || !consent)) throw new Error("Confirm the local Bengali model and WASM download before reading.");
      if (specialist && (!/\.(png|jpe?g|webp)$/i.test(file.name) || file.size > 15 * 1024 * 1024)) throw new Error("The Bengali beta accepts JPG, PNG or WebP images up to 15 MB. Use the printed reader for PDFs.");
      const reading = new AbortController(); controller.current = reading;
      setSaved(null); setRows([]); setPages([]); setDiagnostics([]); setAudit(null); setPage(0); setFilename(file.name); invalidate();
      const progress = message => { if (mounted.current && !reading.signal.aborted) setBusy(message); };
      let loaded;
      try { loaded = specialist ? await readTableSheet(file, progress, reading.signal, "specialist") : await readPassengerSheet(file, progress, reading.signal); }
      finally { if (controller.current === reading) controller.current = null; }
      if (!mounted.current) return;
      if (reading.signal.aborted) throw new Error("Reading cancelled.");
      if (loaded.rows.length > 500) throw new Error("This document produced more than 500 rows. Split it into smaller documents and try again.");
      setPages(loaded.pages); setDiagnostics(specialist ? loaded.diagnostics || [] : []);
      setRows(loaded.rows.map(row => specialist ? { ...row, _specialist: { key: diagnosticKey(row), reviewed: false } } : row));
      setNotice(loaded.rows.length ? `${loaded.rows.length} unverified suggested rows. ${specialist ? "Compare each source crop with the full image, correct its values and confirm each row. " : ""}Verify all pages and add any missed rows before checking.` : "No reliable rows detected. Read the preview and add rows manually. Nothing has been saved.");
      if (loaded.warnings?.length) setError(loaded.warnings.join(" "));
    });
  }
  function newCheck() { setRows([]); setPages([]); setDiagnostics([]); setSaved(null); setAudit(null); setFilename("Manual check"); setPage(0); setError(""); invalidate(); }
  const unreviewed = rows.filter(row => row._specialist && !row._specialist.reviewed).length;
  const evidence = new Map(diagnostics.map(item => [diagnosticKey(item), item]));
  const unassignedDiagnostics = diagnostics.filter(item => !rows.some(row => row._specialist?.key === diagnosticKey(item)));
  const payload = () => {
    if (unreviewed) throw new Error("Review and confirm every Bengali beta row before comparing or saving.");
    // Source images, raw OCR, diagnostics and review metadata stay only in this tab’s memory.
    return { rows: rows.map(({ date, bus, passengers, source }) => ({ date, bus, passengers, source })), filename, channel, confirmed, revision: saved?.revision };
  };
  const repeated = rows.filter((row, index) => rows.findIndex(r => r.date === row.date && latinDigits(r.bus).trim() === latinDigits(row.bus).trim()) !== index).length;
  return <section className="passenger-checker" aria-label="Passenger checker">
    <div className="card checker-heading"><div><span className="settings-eyebrow">CHECK ONLY · NO ACCOUNT CHANGES</span><h2>Passenger checker</h2><p>Compare a collection sheet with Online Accounts, by bus and journey date. Administrators decide what to do with flagged differences.</p></div><button type="button" disabled={!!busy} onClick={newCheck}>New check</button></div>
    <p className="checker-warning">Handwriting recognition is only a suggestion, not a verified reading. Check every date, bus number and passenger count against the original. The heading date is not substituted for a row’s journey date.</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <div className="checker-loading" role="status"><span className="checker-spinner" />{busy}{controller.current && !controller.current.signal.aborted && <button onClick={() => controller.current.abort()}>Cancel reading</button>}</div>}
    <fieldset disabled={!!busy} className="checker-fieldset">
      <div className="card checker-controls">
        <label>Document reader<select value={readerMode} onChange={e => { setReaderMode(e.target.value); setConsent(false); }}><option value="local">Local reader — printed text / manual correction</option><option value="specialist" disabled={!readerEnabled}>Bengali handwriting specialist — review-only beta</option></select></label>
        {readerMode === "specialist" && <><p className="checker-warning">Review-only beta: this model can read bus digits incorrectly and may leave journey dates blank when their separators are unsupported. Table detection can miss rows or whole sections. Every suggestion is unverified. Check the original image, correct every value and manually confirm each imported row before comparison or saving.</p><label className="checker-confirm checker-model-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to download about 71 MB of model files plus the WebAssembly (WASM) runtime from this website on first use. Reading stays on my device and may take several minutes or fail on low-memory devices. I will manually verify every suggestion.</label></>}
        {!readerEnabled && <p className="checker-warning" role="status">{readerStatus}</p>}
        <label>{readerMode === "specialist" ? "Collection sheet image (JPG, PNG or WebP · up to 15 MB)" : "Collection sheet (PDF or image)"}<input type="file" disabled={readerMode === "specialist" && (!readerEnabled || !consent)} accept={readerMode === "specialist" ? ".png,.jpg,.jpeg,.webp" : ".pdf,.png,.jpg,.jpeg,.webp"} onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label>Compare with<select value={channel} disabled={!editable} onChange={e => { setChannel(e.target.value); invalidate(); }}>
          <option value="digital">All digital — Website + Android + iOS + legacy</option><option value="website">Website only</option><option value="android">Android only</option><option value="ios">iOS only</option><option value="website_android">Legacy combined only</option><option value="cash">Cash only</option><option value="all">Digital and cash</option>
        </select></label>
        <p>Both readers run in your browser, without an external OCR API. Only reviewed row values and comparison snapshots are saved here. Original images, source crops and raw specialist output stay in this tab’s memory. Maximum 15 MB / 500 rows; the printed reader also accepts PDFs up to 20 pages. The Bengali beta accepts one image at a time.</p>
      </div>
      <div className={`checker-workspace ${pages.length ? "has-preview" : ""}`}>
        {pages.length > 0 && <aside className="card checker-source"><div className="checker-actions"><button onClick={() => setPage(page - 1)} disabled={!page}>Previous page</button><span>{page + 1} / {pages.length}</span><button onClick={() => setPage(page + 1)} disabled={page >= pages.length - 1}>Next page</button></div><a href={pages[page].image} download={`${filename}-page-${page + 1}.jpg`}>Download page for closer inspection</a><img src={pages[page].image} alt={`Original collection sheet page ${page + 1}`} /><details><summary>Extracted text (may contain errors)</summary><pre>{pages[page].text}</pre></details></aside>}
        <div className="card checker-rows"><h3>{saved ? `Edit check #${saved.id}` : "Review extracted rows"}</h3><label>Document label<input value={filename} maxLength={200} disabled={!editable} onChange={e => { setFilename(e.target.value); invalidate(); }} /></label>
          {!pages.length && saved && <p>Original file is not stored. Reopen your original document separately to verify these saved rows.</p>}
          <div className="online-table-scroll"><table><thead><tr><th>#</th><th>Journey date</th><th>Bus number</th><th>Total passengers</th><th>Action</th></tr></thead><tbody>
            {rows.map((row, index) => <Fragment key={index}>
              <tr className={row._specialist ? "checker-suggestion-row" : undefined}><td title={row.source}>{index + 1}{row._specialist && <small className="checker-unverified">Unverified suggestion</small>}</td>{["date", "bus", "passengers"].map(field => <td key={field}><input aria-label={`Row ${index + 1} ${field}`} type={field === "date" ? "date" : "text"} inputMode={field === "passengers" ? "numeric" : undefined} value={row[field]} disabled={!editable} onChange={e => { setRows(rows.map((r, i) => i === index ? { ...r, [field]: e.target.value, ...(r._specialist ? { _specialist: { ...r._specialist, reviewed: false } } : {}) } : r)); invalidate(); }} /></td>)}<td><button disabled={!editable} onClick={() => { setRows(rows.filter((_, i) => i !== index)); invalidate(); }}>Remove row</button></td></tr>
              {row._specialist && <tr className="checker-row-review"><td colSpan={5}>
                <details><summary>Row {index + 1} source crops and raw text — unverified</summary><p>{row.source}. Crops can miss strokes; compare with the full original image.</p>{evidence.has(row._specialist.key) ? <SourceCells cells={evidence.get(row._specialist.key).cells} /> : <p>Source crops are unavailable. Use the original image to verify this row.</p>}</details>
                <label className="checker-confirm"><input type="checkbox" checked={row._specialist.reviewed} disabled={!editable} onChange={e => { setRows(rows.map((r, i) => i === index ? { ...r, _specialist: { ...r._specialist, reviewed: e.target.checked } } : r)); invalidate(); }} />I checked row {index + 1} against the original and corrected its journey date, bus number and total passengers.</label>
              </td></tr>}
            </Fragment>)}
          </tbody></table></div>
          {unassignedDiagnostics.length > 0 && <details className="checker-extra-evidence"><summary>{unassignedDiagnostics.length} detected band(s) not in this check — unverified</summary><p>These may include headings, unreadable entries or rows you removed. Check the original and add any missing passenger rows manually.</p>{unassignedDiagnostics.map(item => <details key={diagnosticKey(item)}><summary>Table {item.table}, band {item.band} — unverified output</summary><SourceCells cells={item.cells} /></details>)}</details>}
          {!rows.length && <p>No rows yet. Upload a document or add a row below.</p>}
          <button disabled={!editable || rows.length >= 500} onClick={() => { setRows([...rows, blank()]); invalidate(); }}>+ Add missing row</button>
          {repeated > 0 && <p className="checker-warning">{repeated} repeated bus/date row(s): their passenger counts will be added together. Remove accidental duplicate pages or rows before confirming.</p>}
          {unreviewed > 0 && <p className="checker-warning" role="status">{unreviewed} Bengali beta row(s) still need individual confirmation. Editing a row clears its confirmation.</p>}
          <label className="checker-confirm"><input type="checkbox" checked={confirmed} disabled={unreviewed > 0} onChange={e => setConfirmed(e.target.checked)} />I checked every page, corrected the suggested values and added any missed rows. Repeated bus/date rows are intentional.</label>
          <div className="checker-actions"><button className="btn-primary" disabled={!confirmed || !rows.length || unreviewed > 0} onClick={() => run("Comparing passengers…", async () => { const data = await api.post(`${endpoint}/compare`, payload()); setResult(data.result); setDirty(true); setNotice("Compared with current records. No account records changed. Save to keep this snapshot."); })}>Compare passengers</button>
            {canWrite && editable && <button disabled={!confirmed || !rows.length || unreviewed > 0} onClick={() => run("Saving check…", async () => { const data = saved ? await api.put(`${endpoint}/${saved.id}`, payload()) : await api.post(endpoint, payload()); acceptSaved(data, true); await refresh(); setNotice("Check saved. Sales and accounts were not changed. Administrator review is pending."); })}>{saved ? "Save edits & recheck" : "Save check & results"}</button>}
          </div>
        </div>
      </div>
      {result && <div className="card checker-results"><h3>Comparison results</h3><p>{result.summary.buses} bus/day groups · {result.summary.sheetPassengers} sheet passengers · {result.summary.flagged} flagged</p><p>Snapshot: {new Date(result.checkedAt).toLocaleString()} · {result.scope}</p><div className="online-table-scroll"><table><thead><tr><th>Journey date</th><th>Bus</th><th>Sheet</th><th>Accounts</th><th>Difference¹</th><th>Result</th></tr></thead><tbody>{result.results.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.bus}<small>Sheet rows: {r.sourceRows.join(", ")}</small></td><td>{r.expected}</td><td>{r.actual ?? "—"}</td><td>{r.difference ?? "—"}</td><td><span className={`checker-status ${r.status}`}>{labels[r.status]}</span>{r.status === "ambiguous" && <small>Enter a full bus number: {r.candidates.join(", ")}</small>}</td></tr>)}</tbody></table></div><p>¹ Accounts passengers minus sheet passengers. “Missing” means no sale for this bus/date in the selected platform(s), not that the bus should be deleted.</p></div>}
      {saved && <div className="card checker-review"><h3>Administrator decision · {saved.review_status.replaceAll("_", " ")}</h3><p>{saved.review_note || "Awaiting Admin or Super Admin review."}</p>{isAdmin && <><label>Decision<select value={decision} onChange={e => setDecision(e.target.value)}><option value="reviewed">Reviewed — no automatic action</option><option value="follow_up">Needs follow-up</option><option value="pending">Pending</option></select></label><label>Decision note<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label><button disabled={!note.trim() || dirty} onClick={() => run("Saving decision…", async () => { acceptSaved(await api.put(`${endpoint}/${saved.id}/review`, { status: decision, note, revision: saved.revision }), true); await refresh(); setNotice("Decision recorded only. No sales, buses or passenger entries changed."); })}>Save decision for saved snapshot</button><p>Decisions apply to the last saved snapshot. Save edits first; editing a check resets its decision to pending.</p></>}<button onClick={() => run("Loading audit history…", async () => setAudit(await api.get(`${endpoint}/${saved.id}/audit`)))}>Show previous revisions</button>{audit && <div>{!audit.length && <p>No earlier revisions.</p>}{audit.map(item => <details key={item.revision}><summary>Revision {item.revision} · {item.review_status} · {item.result.summary.flagged} flagged</summary><p>{item.review_note || "No decision note"}</p><pre style={{whiteSpace:"pre-wrap"}}>{item.input.rows.map(r => `${r.date} · ${r.bus} · ${r.passengers} passengers`).join("\n")}</pre></details>)}</div>}</div>}
      <div className="card checker-history"><h3>Saved checks</h3><p>Open a check to view its snapshot or edit and recheck it. Previous revisions are retained in the audit history.</p><div className="online-table-scroll"><table><thead><tr><th>Check</th><th>Document</th><th>Decision</th><th>Saved</th><th>Action</th></tr></thead><tbody>{history.map(check => <tr key={check.id}><td>#{check.id} · revision {check.revision}</td><td>{check.filename}</td><td>{check.review_status.replaceAll("_", " ")}</td><td>{check.updated_at} UTC</td><td><button onClick={() => run("Opening check…", async () => { acceptSaved(await api.get(`${endpoint}/${check.id}`)); setPages([]); setPage(0); })}>View / edit</button></td></tr>)}</tbody></table></div>{!history.length && <p>No saved checks on this page.</p>}<div className="checker-actions"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous checks</button><span>Page {offset / 20 + 1}</span><button disabled={history.length < 20} onClick={() => setOffset(offset + 20)}>Next checks</button></div></div>
    </fieldset>
  </section>;
}

import { useEffect, useRef, useState } from "react";
import { api, getUser } from "../api.js";
import { readPassengerSheet, latinDigits } from "../utils/passengerSheet.js";
import "./PassengerChecker.css";

const labels = { matched: "Matched", mismatch: "Passenger mismatch", missing: "Bus missing on this date", ambiguous: "Ambiguous bus number" };
const blank = () => ({ date: "", bus: "", passengers: "", source: "Manual row" });
const endpoint = "/passenger-checks";
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
  const [dirty, setDirty] = useState(false), [audit, setAudit] = useState(null);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { let active = true; api.get("/passenger-checker-ocr/status").then(data => active && setReaderEnabled(data.enabled)).catch(() => {}); return () => { active = false; }; }, []);
  useEffect(() => { let active = true; api.get(`${endpoint}?offset=${offset}`).then(data => active && setHistory(data)).catch(e => active && setError(e.message)); return () => { active = false; }; }, [offset]);
  const refresh = () => api.get(`${endpoint}?offset=${offset}`).then(setHistory);
  const invalidate = () => { setConfirmed(false); setResult(null); setNotice(""); setDirty(true); };
  const editable = !saved || isAdmin || saved.created_by === user?.id;
  async function run(label, action) {
    if (busy) return;
    setBusy(label); setError(""); setNotice("");
    try { await action(); } catch (e) { setError(e.message || "Unable to complete the check."); } finally { setBusy(""); }
  }
  function acceptSaved(data) {
    setSaved(data); setFilename(data.input.filename); setChannel(data.input.channel);
    setRows(data.input.rows); setResult(data.result); setConfirmed(false);
    setDirty(false); setAudit(null);
    setNote(data.review_note || ""); setDecision(data.review_status === "pending" ? "reviewed" : data.review_status);
  }
  async function upload(file) {
    if (!file) return;
    await run("Opening document…", async () => {
      controller.current = new AbortController();
      setSaved(null); setRows([]); setPages([]); setPage(0); setFilename(file.name); invalidate();
      const remoteReader = readerMode === "handwriting" ? image => api.post("/passenger-checker-ocr/read", { image, consent }) : undefined;
      const loaded = await readPassengerSheet(file, setBusy, controller.current.signal, remoteReader);
      setPages(loaded.pages); setRows(loaded.rows);
      setNotice(loaded.rows.length ? `${loaded.rows.length} suggested rows. Verify all pages and add any missed rows before checking.` : "No reliable rows detected. Read the preview and add rows manually. Nothing has been saved.");
      if (loaded.warnings?.length) setError(loaded.warnings.join(" "));
    });
  }
  function newCheck() { setRows([]); setPages([]); setSaved(null); setAudit(null); setFilename("Manual check"); setPage(0); setError(""); invalidate(); }
  const payload = () => ({ rows, filename, channel, confirmed, revision: saved?.revision });
  const repeated = rows.filter((row, index) => rows.findIndex(r => r.date === row.date && latinDigits(r.bus).trim() === latinDigits(row.bus).trim()) !== index).length;
  return <section className="passenger-checker" aria-label="Passenger checker">
    <div className="card checker-heading"><div><span className="settings-eyebrow">CHECK ONLY · NO ACCOUNT CHANGES</span><h2>Passenger checker</h2><p>Compare a collection sheet with Online Accounts, by bus and journey date. Administrators decide what to do with flagged differences.</p></div><button type="button" disabled={!!busy} onClick={newCheck}>New check</button></div>
    <p className="checker-warning">Handwriting recognition is only a suggestion, not a verified reading. Check every date, bus number and passenger count against the original. The heading date is not substituted for a row’s journey date.</p>
    {error && <p role="alert" className="error-text">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {busy && <div className="checker-loading" role="status"><span className="checker-spinner" />{busy}{controller.current && !controller.current.signal.aborted && busy.includes("Page") && <button onClick={() => controller.current.abort()}>Cancel reading</button>}</div>}
    <fieldset disabled={!!busy} className="checker-fieldset">
      <div className="card checker-controls">
        <label>Document reader<select value={readerMode} onChange={e => { setReaderMode(e.target.value); setConsent(false); }}><option value="local">Local reader — printed text / manual correction</option><option value="handwriting" disabled={!readerEnabled || !canWrite}>Handwriting reader {readerEnabled ? "(external service)" : "(server setup required)"}</option></select></label>
        {readerMode === "handwriting" && <label className="checker-confirm"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />Send the selected document pages to the configured OpenAI service for reading. API usage costs apply to the administrator’s account. I will verify its suggestions.</label>}
        {!readerEnabled && <p className="checker-warning">Automatic handwriting reading needs server configuration. The local reader is for printed text and may not read handwritten numbers. Use the preview to add or correct rows manually.</p>}
        <label>Collection sheet (PDF or image)<input type="file" disabled={readerMode === "handwriting" && !consent} accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => { upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label>Compare with<select value={channel} disabled={!editable} onChange={e => { setChannel(e.target.value); invalidate(); }}>
          <option value="digital">All digital — Website + Android + iOS + legacy</option><option value="website">Website only</option><option value="android">Android only</option><option value="ios">iOS only</option><option value="website_android">Legacy combined only</option><option value="cash">Cash only</option><option value="all">Digital and cash</option>
        </select></label>
        <p>The local reader runs in your browser. Only reviewed row values and comparison snapshots are saved here, not the original document. The optional handwriting service receives pages only with your confirmation. Maximum 15 MB / 20 pages / 500 rows.</p>
      </div>
      <div className={`checker-workspace ${pages.length ? "has-preview" : ""}`}>
        {pages.length > 0 && <aside className="card checker-source"><div className="checker-actions"><button onClick={() => setPage(page - 1)} disabled={!page}>Previous page</button><span>{page + 1} / {pages.length}</span><button onClick={() => setPage(page + 1)} disabled={page >= pages.length - 1}>Next page</button></div><a href={pages[page].image} download={`${filename}-page-${page + 1}.jpg`}>Download page for closer inspection</a><img src={pages[page].image} alt={`Original collection sheet page ${page + 1}`} /><details><summary>Extracted text (may contain errors)</summary><pre>{pages[page].text}</pre></details></aside>}
        <div className="card checker-rows"><h3>{saved ? `Edit check #${saved.id}` : "Review extracted rows"}</h3><label>Document label<input value={filename} maxLength={200} disabled={!editable} onChange={e => { setFilename(e.target.value); invalidate(); }} /></label>
          {!pages.length && saved && <p>Original file is not stored. Reopen your original document separately to verify these saved rows.</p>}
          <div className="online-table-scroll"><table><thead><tr><th>#</th><th>Journey date</th><th>Bus number</th><th>Total passengers</th><th>Action</th></tr></thead><tbody>
            {rows.map((row, index) => <tr key={index}><td title={row.source}>{index + 1}</td>{["date", "bus", "passengers"].map(field => <td key={field}><input aria-label={`Row ${index + 1} ${field}`} type={field === "date" ? "date" : "text"} inputMode={field === "passengers" ? "numeric" : undefined} value={row[field]} disabled={!editable} onChange={e => { setRows(rows.map((r, i) => i === index ? { ...r, [field]: e.target.value } : r)); invalidate(); }} /></td>)}<td><button disabled={!editable} onClick={() => { setRows(rows.filter((_, i) => i !== index)); invalidate(); }}>Remove row</button></td></tr>)}
          </tbody></table></div>
          {!rows.length && <p>No rows yet. Upload a document or add a row below.</p>}
          <button disabled={!editable || rows.length >= 500} onClick={() => { setRows([...rows, blank()]); invalidate(); }}>+ Add missing row</button>
          {repeated > 0 && <p className="checker-warning">{repeated} repeated bus/date row(s): their passenger counts will be added together. Remove accidental duplicate pages or rows before confirming.</p>}
          <label className="checker-confirm"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I checked every page, corrected the suggested values and added any missed rows. Repeated bus/date rows are intentional.</label>
          <div className="checker-actions"><button className="btn-primary" disabled={!confirmed || !rows.length} onClick={() => run("Comparing passengers…", async () => { const data = await api.post(`${endpoint}/compare`, payload()); setResult(data.result); setDirty(true); setNotice("Compared with current records. No account records changed. Save to keep this snapshot."); })}>Compare passengers</button>
            {canWrite && editable && <button disabled={!confirmed || !rows.length} onClick={() => run("Saving check…", async () => { const data = saved ? await api.put(`${endpoint}/${saved.id}`, payload()) : await api.post(endpoint, payload()); acceptSaved(data); await refresh(); setNotice("Check saved. Sales and accounts were not changed. Administrator review is pending."); })}>{saved ? "Save edits & recheck" : "Save check & results"}</button>}
          </div>
        </div>
      </div>
      {result && <div className="card checker-results"><h3>Comparison results</h3><p>{result.summary.buses} bus/day groups · {result.summary.sheetPassengers} sheet passengers · {result.summary.flagged} flagged</p><p>Snapshot: {new Date(result.checkedAt).toLocaleString()} · {result.scope}</p><div className="online-table-scroll"><table><thead><tr><th>Journey date</th><th>Bus</th><th>Sheet</th><th>Accounts</th><th>Difference¹</th><th>Result</th></tr></thead><tbody>{result.results.map((r, i) => <tr key={i}><td>{r.date}</td><td>{r.bus}<small>Sheet rows: {r.sourceRows.join(", ")}</small></td><td>{r.expected}</td><td>{r.actual ?? "—"}</td><td>{r.difference ?? "—"}</td><td><span className={`checker-status ${r.status}`}>{labels[r.status]}</span>{r.status === "ambiguous" && <small>Enter a full bus number: {r.candidates.join(", ")}</small>}</td></tr>)}</tbody></table></div><p>¹ Accounts passengers minus sheet passengers. “Missing” means no sale for this bus/date in the selected platform(s), not that the bus should be deleted.</p></div>}
      {saved && <div className="card checker-review"><h3>Administrator decision · {saved.review_status.replaceAll("_", " ")}</h3><p>{saved.review_note || "Awaiting Admin or Super Admin review."}</p>{isAdmin && <><label>Decision<select value={decision} onChange={e => setDecision(e.target.value)}><option value="reviewed">Reviewed — no automatic action</option><option value="follow_up">Needs follow-up</option><option value="pending">Pending</option></select></label><label>Decision note<textarea value={note} maxLength={2000} onChange={e => setNote(e.target.value)} /></label><button disabled={!note.trim() || dirty} onClick={() => run("Saving decision…", async () => { acceptSaved(await api.put(`${endpoint}/${saved.id}/review`, { status: decision, note, revision: saved.revision })); await refresh(); setNotice("Decision recorded only. No sales, buses or passenger entries changed."); })}>Save decision for saved snapshot</button><p>Decisions apply to the last saved snapshot. Save edits first; editing a check resets its decision to pending.</p></>}<button onClick={() => run("Loading audit history…", async () => setAudit(await api.get(`${endpoint}/${saved.id}/audit`)))}>Show previous revisions</button>{audit && <div>{!audit.length && <p>No earlier revisions.</p>}{audit.map(item => <details key={item.revision}><summary>Revision {item.revision} · {item.review_status} · {item.result.summary.flagged} flagged</summary><p>{item.review_note || "No decision note"}</p><pre style={{whiteSpace:"pre-wrap"}}>{item.input.rows.map(r => `${r.date} · ${r.bus} · ${r.passengers} passengers`).join("\n")}</pre></details>)}</div>}</div>}
      <div className="card checker-history"><h3>Saved checks</h3><p>Open a check to view its snapshot or edit and recheck it. Previous revisions are retained in the audit history.</p><div className="online-table-scroll"><table><thead><tr><th>Check</th><th>Document</th><th>Decision</th><th>Saved</th><th>Action</th></tr></thead><tbody>{history.map(check => <tr key={check.id}><td>#{check.id} · revision {check.revision}</td><td>{check.filename}</td><td>{check.review_status.replaceAll("_", " ")}</td><td>{check.updated_at} UTC</td><td><button onClick={() => run("Opening check…", async () => { acceptSaved(await api.get(`${endpoint}/${check.id}`)); setPages([]); setPage(0); })}>View / edit</button></td></tr>)}</tbody></table></div>{!history.length && <p>No saved checks on this page.</p>}<div className="checker-actions"><button disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous checks</button><span>Page {offset / 20 + 1}</span><button disabled={history.length < 20} onClick={() => setOffset(offset + 20)}>Next checks</button></div></div>
    </fieldset>
  </section>;
}

import { useState } from "react";

export default function PdfExportButton({ onExport, label = "Download PDF", disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    if (busy) return;
    setBusy(true); setError("");
    try { await onExport(); } catch (err) { setError(err.message || "Could not create the PDF. Please try again."); }
    finally { setBusy(false); }
  }
  return <span className="pdf-export-control"><button type="button" className="settings-edit-button" onClick={download} disabled={disabled || busy} aria-busy={busy}><span className="online-button-content">{busy ? <span className="online-button-spinner" aria-hidden="true" /> : <svg aria-hidden="true" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M12 12v6m-3-3 3 3 3-3"/></svg>}{busy ? "Creating PDF…" : label}</span></button>{error && <small className="error-text" role="alert">{error}</small>}</span>;
}

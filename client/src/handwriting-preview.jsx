// Development-only entry. Not included in the production HTML build.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createLocalHandwritingReader } from './utils/localHandwriting.js';
import { readPassengerSheet } from './utils/passengerSheet.js';
import { readTableSheet } from './utils/readTableSheet.js';
import './handwriting-preview.css';
function Preview() {
  const [progress, setProgress] = useState('Choose a sheet to test. Nothing connects to the live database.');
  const [result, setResult] = useState(null), [busy, setBusy] = useState(false);
  const [mode, setMode] = useState('specialist');
  const controller = useRef(null);
  async function read(file) {
    if (!file || busy) return;
    setBusy(true); setResult(null); controller.current = new AbortController();
    const reader = mode === 'model' ? createLocalHandwritingReader(setProgress, controller.current.signal) : null;
    const started = performance.now();
    try {
      const data = mode !== 'model' ? await readTableSheet(file, setProgress, controller.current.signal, mode === 'specialist' ? 'specialist' : 'printed')
        : await readPassengerSheet(file, setProgress, controller.current.signal, reader.read);
      setResult(data); setProgress(`Finished in ${Math.round((performance.now() - started) / 1000)} seconds. ${data.rows.length} unverified candidate rows.${data.diagnostics ? ` ${data.rows.filter(row => row.complete).length} have all three fields in a valid format (not verified accurate).` : ''} Nothing accepted or saved.`);
    } catch (error) { setProgress(error.message); }
    finally { reader?.dispose(); setBusy(false); }
  }
  return <main><small>LOCAL PROTOTYPE · VERSION 1.28.0 · NOT DEPLOYED</small><h1>Bengali handwriting lab</h1>
    <p>Local reading only. No external OCR API and no connection to accounts. Handwriting recognition has NOT passed testing.</p>
    <label>Reading experiment<select value={mode} disabled={busy} onChange={e => { setMode(e.target.value); setResult(null); setProgress('Choose a sheet to test with the selected reader. Nothing connects to the live database.'); }}><option value="specialist">Bengali handwriting specialist — images, ~71 MB, experimental</option><option value="cells">Printed Bengali table — images, lightweight OCR</option><option value="model">Experimental vision model — PDF/images, ~1.7 GB, WebGPU</option></select></label>
    {mode === 'specialist' && <p>Specialist model: better handwritten count readings in initial tests, but bus digits remain unreliable and date separators are unsupported. Every field needs review.</p>}
    <p>Browser WebGPU: {navigator.gpu ? 'available (adapter/memory checked during reading)' : 'unavailable'}</p>
    <div className="lab-actions"><label>{mode !== 'model' ? 'Choose image' : 'Choose PDF or image'}<input aria-label="Choose sheet" type="file" accept={mode !== 'model' ? '.jpg,.jpeg,.png,.webp' : '.pdf,.jpg,.jpeg,.png,.webp'} disabled={busy} onChange={e => { read(e.target.files[0]); e.target.value = ''; }} /></label>
      <button disabled={busy} onClick={async () => {
        try { const res = await fetch('/__handwriting_test_sheet'); if (!res.ok) throw new Error('No local test sheet configured. Choose a file instead.'); await read(new File([await res.blob()], 'test-sheet.jpeg', { type: 'image/jpeg' })); }
        catch (error) { setProgress(error.message); }
      }}>Read configured test sheet</button><button disabled={!busy} onClick={() => controller.current?.abort()}>Cancel reading</button></div>
    <p role="status">{progress}</p>
    {result && <><p role="alert">{result.warnings.join(' ')}</p><section><div>{result.pages.map((page, i) => <figure key={i}><img src={page.image} alt={`Original page ${i + 1}`} /><figcaption>{page.text}</figcaption></figure>)}</div><div><h2>Unverified suggestions</h2>{result.detectedTables != null && <p>{result.detectedTables} table sections detected. Check the original for missing sections and rows.</p>}<div className="suggestions-scroll"><table><caption>Every value below needs review, including numbers that look valid.</caption><thead><tr>{result.diagnostics && <th>Source crop</th>}<th>Journey date</th><th>Bus</th><th>Passengers</th></tr></thead><tbody>{result.rows.map((r, i) => <tr key={i}>{result.diagnostics && <td><a href={`#crop-${r.table}-${r.band}`}>{r.source}</a></td>}<td>{r.date || 'Needs review'}</td><td>{r.bus || 'Needs review'}</td><td>{r.passengers === '' ? 'Needs review' : r.passengers}</td></tr>)}</tbody></table></div><p>No sales, passenger entries or account records are changed by this lab.</p></div></section>
      {result.diagnostics && <div className="cell-results"><h2>Actual engine output · inspect every crop</h2><p>Confidence is the OCR engine's estimate, not measured accuracy. Invalid values are never repaired or filled from another row.</p>{result.diagnostics.map((row, i) => <article id={`crop-${row.table}-${row.band}`} key={i}><h3>Table {row.table} · band {row.band} · Needs review</h3>{row.estimatedColumns && <p>Column boundaries estimated from a neighbouring row. Check the crop.</p>}<div className="cell-grid">{row.cells.map(cell => <figure key={cell.label}><figcaption>{cell.label}</figcaption><img src={cell.image} alt={`${cell.label}, table ${row.table}, band ${row.band}`} /><p>Raw: <code>{cell.text || '(nothing read)'}</code></p><small>{cell.confidence == null ? 'Confidence not calibrated — review required' : `Engine confidence: ${cell.confidence}/100`}</small></figure>)}</div><p>{row.issues.join(' · ')}</p></article>)}</div>}
    </>}
  </main>;
}
// Reuse the development root across hot updates instead of mounting twice.
const labRoot = import.meta.hot?.data.labRoot || createRoot(document.getElementById('root'));
if (import.meta.hot) import.meta.hot.data.labRoot = labRoot;
labRoot.render(<Preview />);

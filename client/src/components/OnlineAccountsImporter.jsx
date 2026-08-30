import { useMemo, useRef, useState } from "react";
import { api } from "../api.js";
import {
  buildPreviewRows,
  IMPORT_DESTINATIONS,
  readImportFile,
  suggestMappings,
  validateImportRow,
} from "../utils/onlineImport.js";

const channelOptions = [
  ["website", "Website"],
  ["android", "Android App"],
  ["ios", "iOS App"],
];

function SpinnerLabel({ active, activeText, children }) {
  return <span className="online-button-content">{active && <span className="online-button-spinner" aria-hidden="true" />}{active ? activeText : children}</span>;
}

function PreviewInput({ value, onChange, type = "text", min, step }) {
  return <input type={type} min={min} step={step} value={value ?? ""} onChange={(event) => onChange(event.target.value)} />;
}

function ImportPreviewTable({ destination, rows, setRows, categories }) {
  const update = (index, key, value) => setRows((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, [key]: value } : row));
  const errors = rows.map((row) => row.selected ? validateImportRow(row, destination) : []);

  return <div className="online-import-preview">
    <div className="online-import-preview-heading">
      <div><h4>Editable import preview</h4><p>Review every value. Untick a row to leave it out of the import.</p></div>
      <span>{rows.filter((row) => row.selected).length} selected</span>
    </div>
    <div className="online-table-scroll">
      <table className="online-import-table">
        <thead><tr>
          <th>Use</th><th>Source row</th><th>Date</th>
          {destination === "digital" && <th>Platform</th>}
          {destination !== "expense" && <><th>Coach</th><th>Bus (optional)</th></>}
          {destination === "digital" && <><th>Normal</th><th>Long</th></>}
          {destination === "cash" && <th>Passengers</th>}
          {destination === "expense" && <><th>Category</th><th>Note</th></>}
          <th>Amount</th><th>Check</th>
        </tr></thead>
        <tbody>{rows.map((row, index) => <tr key={`${row.sourceRow}-${index}`} className={row.selected && errors[index].length ? "has-error" : ""}>
          <td><input type="checkbox" aria-label={`Include source row ${row.sourceRow}`} checked={row.selected} onChange={(event) => update(index, "selected", event.target.checked)} /></td>
          <td><strong>{row.sourceRow}</strong></td>
          <td><PreviewInput type="date" value={destination === "expense" ? row.expense_date : row.entry_date} onChange={(value) => update(index, destination === "expense" ? "expense_date" : "entry_date", value)} /></td>
          {destination === "digital" && <td><select value={row.channel} onChange={(event) => update(index, "channel", event.target.value)}>{channelOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></td>}
          {destination !== "expense" && <><td><PreviewInput value={row.coach_number} onChange={(value) => update(index, "coach_number", value)} /></td><td><PreviewInput value={row.bus_number} onChange={(value) => update(index, "bus_number", value)} /></td></>}
          {destination === "digital" && <><td><PreviewInput type="number" min="0" step="1" value={row.normal_passengers} onChange={(value) => update(index, "normal_passengers", value)} /></td><td><PreviewInput type="number" min="0" step="1" value={row.long_passengers} onChange={(value) => update(index, "long_passengers", value)} /></td></>}
          {destination === "cash" && <td><PreviewInput type="number" min="0" step="1" value={row.passenger_count} onChange={(value) => update(index, "passenger_count", value)} /></td>}
          {destination === "expense" && <><td><select value={row.category_id} onChange={(event) => update(index, "category_id", event.target.value)}><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{Number(category.active) ? "" : " (archived)"}</option>)}</select></td><td><PreviewInput value={row.description} onChange={(value) => update(index, "description", value)} /></td></>}
          <td><PreviewInput type="number" min="0" step="0.01" value={row.amount} onChange={(value) => update(index, "amount", value)} /></td>
          <td>{!row.selected ? <span className="online-import-skipped">Skipped</span> : errors[index].length ? <span className="online-import-error">{errors[index].join(" · ")}</span> : <span className="online-import-ready">Ready</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}

export default function OnlineAccountsImporter({ selectedDate, categories, onImported }) {
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState("");
  const [tables, setTables] = useState([]);
  const [tableIndex, setTableIndex] = useState(0);
  const [destination, setDestination] = useState("digital");
  const [mapping, setMapping] = useState({});
  const [defaultChannel, setDefaultChannel] = useState("website");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [previewRows, setPreviewRows] = useState([]);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const table = tables[tableIndex];
  const fields = IMPORT_DESTINATIONS[destination].fields;
  const selectedRows = previewRows.filter((row) => row.selected);
  const invalidCount = selectedRows.filter((row) => validateImportRow(row, destination).length).length;
  const mappedCount = Object.values(mapping).filter(Boolean).length;
  const activeCategories = useMemo(() => categories.filter((category) => Number(category.active)), [categories]);

  function resetPreview(nextDestination = destination, nextTable = table) {
    setMapping(nextTable ? suggestMappings(nextTable.headers, nextDestination) : {});
    setPreviewRows([]);
    setError("");
    setNotice("");
  }

  async function chooseFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    setError("");
    setNotice("");
    setPreviewRows([]);
    try {
      const found = await readImportFile(file);
      setFileName(file.name);
      setTables(found);
      setTableIndex(0);
      setMapping(suggestMappings(found[0].headers, destination));
      if (found[0].totalRows > 500) setNotice("The first 500 data rows are available. Split larger files into smaller imports.");
    } catch (err) {
      setFileName("");
      setTables([]);
      setMapping({});
      setError(err.message);
    } finally {
      setReading(false);
    }
  }

  function selectTable(index) {
    const nextIndex = Number(index);
    setTableIndex(nextIndex);
    resetPreview(destination, tables[nextIndex]);
    if (tables[nextIndex]?.totalRows > 500) setNotice("The first 500 data rows are available. Split larger files into smaller imports.");
  }

  function selectDestination(value) {
    setDestination(value);
    resetPreview(value, table);
  }

  function changeMapping(sourceIndex, target) {
    setMapping((current) => {
      const next = { ...current };
      Object.keys(next).forEach((key) => {
        if (next[key] === target && key !== String(sourceIndex)) next[key] = "";
      });
      next[sourceIndex] = target;
      return next;
    });
    setPreviewRows([]);
    setNotice("");
  }

  function createPreview() {
    setError("");
    setNotice("");
    if (!table || !mappedCount) {
      setError("Map at least one uploaded column before creating the preview.");
      return;
    }
    const rows = buildPreviewRows(table, mapping, destination, {
      date: selectedDate,
      channel: defaultChannel,
      categoryId: defaultCategoryId || activeCategories[0]?.id,
    }, categories);
    setPreviewRows(rows);
    const bad = rows.filter((row) => validateImportRow(row, destination).length).length;
    setNotice(bad ? `${bad} row${bad === 1 ? " needs" : "s need"} your attention before importing.` : `${rows.length} rows are ready to import.`);
  }

  async function confirmImport() {
    if (!selectedRows.length || invalidCount || importing) return;
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const rows = selectedRows.map(({ selected, sourceRow, ...row }) => row);
      const result = await api.post("/online-accounts/import", {
        destination,
        rows,
        file_name: fileName,
        source_name: table?.name,
      });
      setNotice(`${result.imported} ${result.imported === 1 ? "entry" : "entries"} imported successfully.`);
      setPreviewRows([]);
      await onImported?.({
        ...result,
        imported_date: destination === "expense" ? rows[0].expense_date : rows[0].entry_date,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setImporting(false);
    }
  }

  function clearImporter() {
    setFileName("");
    setTables([]);
    setTableIndex(0);
    setMapping({});
    setPreviewRows([]);
    setError("");
    setNotice("");
    if (inputRef.current) inputRef.current.value = "";
  }

  return <section className="card online-import-panel">
    <div className="online-panel-title">
      <div><span className="settings-eyebrow">DOCUMENT IMPORT</span><h3>Upload and map your collection sheet</h3><p>Read PDF, Excel, CSV, TSV, or text tables. You decide where every detected column goes before saving.</p></div>
      <span className="online-panel-number">04</span>
    </div>

    <div className="online-import-upload">
      <label className="online-import-file">
        <input ref={inputRef} type="file" accept=".pdf,.xlsx,.csv,.tsv,.txt,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/tab-separated-values,text/plain" onChange={chooseFile} disabled={reading || importing} />
        <span><strong>{fileName || "Choose a document"}</strong><small>PDF, Excel (.xlsx), CSV, TSV, or text · maximum 15 MB</small></span>
      </label>
      {fileName && <button type="button" className="settings-edit-button" onClick={clearImporter} disabled={reading || importing}>Clear file</button>}
      {reading && <span className="online-import-reading"><span className="online-button-spinner" aria-hidden="true" />Reading document…</span>}
    </div>

    {error && <p className="error-text online-import-message" role="alert">{error}</p>}
    {notice && <p className="success-text online-import-message" aria-live="polite">{notice}</p>}

    {table && <>
      <div className="online-import-controls">
        <label><span>Detected table or sheet</span><select value={tableIndex} onChange={(event) => selectTable(event.target.value)}>{tables.map((item, index) => <option key={item.id} value={index}>{item.name} · {item.rows.length} rows</option>)}</select></label>
        <label><span>Send this table to</span><select value={destination} onChange={(event) => selectDestination(event.target.value)}>{Object.entries(IMPORT_DESTINATIONS).map(([value, item]) => <option key={value} value={value}>{item.label}</option>)}</select></label>
        {destination === "digital" && <label><span>Default platform</span><select value={defaultChannel} onChange={(event) => { setDefaultChannel(event.target.value); setPreviewRows([]); }}>{channelOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        {destination === "expense" && <label><span>Default category</span><select value={defaultCategoryId || String(activeCategories[0]?.id || "")} onChange={(event) => { setDefaultCategoryId(event.target.value); setPreviewRows([]); }}><option value="">Choose category</option>{activeCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
      </div>

      <div className="online-import-mapping">
        <div className="online-import-step-heading"><div><span>STEP 1</span><h4>Map uploaded columns</h4></div><p>Choose a destination field for each column, or leave it ignored.</p></div>
        <div className="online-import-map-grid">{table.headers.map((header, index) => <div className="online-import-map-card" key={`${header}-${index}`}>
          <div><strong>{header}</strong><small>Example: {table.rows.find((row) => row[index])?.[index] || "Empty"}</small></div>
          <span aria-hidden="true">→</span>
          <select aria-label={`Destination for ${header}`} value={mapping[index] || ""} onChange={(event) => changeMapping(index, event.target.value)}>
            <option value="">Ignore this column</option>
            {fields.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>)}</div>
        <button type="button" className="primary" onClick={createPreview} disabled={!mappedCount || reading || importing}>Create editable preview</button>
      </div>

      {previewRows.length > 0 && <>
        <ImportPreviewTable destination={destination} rows={previewRows} setRows={setPreviewRows} categories={categories} />
        <div className="online-import-confirm">
          <div><strong>{selectedRows.length} rows selected</strong><small>{invalidCount ? `${invalidCount} selected rows still need correction.` : "All selected rows passed the checks."}</small></div>
          <button type="button" className="primary" onClick={confirmImport} disabled={!selectedRows.length || Boolean(invalidCount) || importing} aria-busy={importing}>
            <SpinnerLabel active={importing} activeText="Importing entries…">Confirm import</SpinnerLabel>
          </button>
        </div>
      </>}
    </>}
  </section>;
}

// Data-driven tables keep long reports readable and include every filtered row,
// even when the screen displays just one page or a collapsed section.
export async function downloadReportPdf({ filename, title, subtitle = "", summary = [], sections = [], orientation = "landscape", save = true }) {
  const clean = (value) => String(value ?? "—").replace(/৳/g, "BDT ").replace(/[–—]/g, "-").replace(/×/g, "x");
  // Built-in PDF fonts do not shape Bangla. Use the browser's native print
  // renderer for multilingual records instead of downloading broken glyphs.
  const text = [title, subtitle, ...summary.flatMap((r) => [r.label, r.value]), ...sections.flatMap((s) => [s.title, s.note || "", ...s.columns, ...(s.rows || []).flat(), ...(s.totals || []).flat()])].map(clean).join(" ");
  if (save && /[^\x00-\xff]/.test(text) && typeof document !== "undefined") {
    showUnicodePdfPreview({ filename, title, subtitle, summary, sections, orientation });
    return;
  }
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4" });
  const width = doc.internal.pageSize.getWidth();
  doc.setFontSize(17); doc.setTextColor(15, 88, 61);
  doc.text(clean(title), 14, 18);
  doc.setFontSize(9); doc.setTextColor(70);
  const lines = doc.splitTextToSize(clean(subtitle), width - 28);
  doc.text(lines, 14, 25);
  let y = 29 + lines.length * 4;
  const table = (head, body, foot = []) => {
    autoTable(doc, { startY: y, head: [head.map(clean)], body: body.map((row) => row.map(clean)), foot: foot.map((row) => row.map(clean)),
      theme: "striped", margin: { top: 16, bottom: 16, left: 14, right: 14 },
      styles: { fontSize: 8, cellPadding: 2.5, overflow: "linebreak" }, headStyles: { fillColor: [15, 103, 70] },
      footStyles: { fillColor: [231, 242, 236], textColor: [20, 50, 35] }, showFoot: "lastPage", rowPageBreak: "avoid" });
    y = doc.lastAutoTable.finalY + 9;
  };
  if (summary.length) table(["Summary", "Value"], summary.map((item) => [item.label, item.value]));
  for (const section of sections) {
    if (y > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); y = 20; }
    doc.setFontSize(11); doc.setTextColor(35); doc.text(clean(section.title || "Records"), 14, y); y += 5;
    if (section.note) { doc.setFontSize(8); const note = doc.splitTextToSize(clean(section.note), width - 28); doc.text(note, 14, y); y += note.length * 4 + 3; }
    table(section.columns, section.rows?.length ? section.rows : [section.columns.map((_, i) => i === 0 ? "No records in this period." : "")], section.totals || []);
  }
  const totalPages = doc.getNumberOfPages();
  for (let page = 1; page <= totalPages; page++) {
    doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100);
    doc.text(`Lal Sabuj Paribahan | ${page} / ${totalPages}`, 14, doc.internal.pageSize.getHeight() - 8);
  }
  if (save) doc.save(`${String(filename || "report").replace(/\.pdf$/i, "").replace(/[<>:"/\\|?*]/g, "-")}.pdf`);
  return doc;
}

function showUnicodePdfPreview({ filename, title, subtitle, summary, sections, orientation }) {
  const previousFocus = document.activeElement;
  const dialog = document.createElement("dialog");
  dialog.setAttribute("aria-label", "PDF print preview");
  dialog.style.cssText = "width:min(1100px,94vw);height:90vh;border:1px solid #b8cdbf;border-radius:16px;padding:16px;background:white;color:#203b2d";
  const heading = document.createElement("h3"); heading.textContent = "Save your report as PDF";
  const note = document.createElement("p"); note.textContent = "This report contains multilingual text. Choose Print / Save as PDF, then select Save as PDF in your browser to preserve every name correctly.";
  const print = document.createElement("button"); print.textContent = "Print / Save as PDF"; print.className = "primary"; print.disabled = true;
  const close = document.createElement("button"); close.textContent = "Close preview"; close.className = "settings-edit-button"; close.style.marginLeft = "12px";
  const frame = document.createElement("iframe"); frame.title = title; frame.style.cssText = "display:block;width:100%;height:calc(100% - 150px);border:0;margin-top:16px";
  dialog.append(heading, note, print, close, frame); document.body.append(dialog);
  close.onclick = () => dialog.close();
  dialog.addEventListener("close", () => { dialog.remove(); previousFocus?.focus(); });
  dialog.showModal();
  const doc = frame.contentDocument;
  doc.open(); doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 ${orientation === "portrait" ? "portrait" : "landscape"};margin:14mm}body{font:11px 'Nirmala UI',Arial,sans-serif;color:#203b2d;padding:16px}h1{font-size:22px;color:#106746}h2{font-size:15px;break-after:avoid}p{line-height:1.5}table{border-collapse:collapse;width:100%;margin:12px 0 24px;table-layout:auto}th,td{text-align:left;vertical-align:top;padding:7px;border-bottom:1px solid #dce5df;overflow-wrap:anywhere}th{background:#106746;color:white}tbody tr:nth-child(even){background:#f2f6f3}thead{display:table-header-group}tr{break-inside:avoid}tfoot{font-weight:bold}@media print{body{padding:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body></body></html>`); doc.close();
  doc.title = filename || title;
  const add = (tag, text, parent = doc.body) => { const el = doc.createElement(tag); el.textContent = String(text ?? "—"); parent.append(el); return el; };
  const table = (columns, rows, totals = []) => {
    const el = add("table", ""); const head = add("tr", "", add("thead", "", el)); columns.forEach((c) => add("th", c, head));
    const body = add("tbody", "", el);
    (rows.length ? rows : [columns.map((_, i) => i === 0 ? "No records in this period." : "")]).forEach((row) => { const tr = add("tr", "", body); row.forEach((c) => add("td", c, tr)); });
    if (totals.length) { const foot = add("tfoot", "", el); totals.forEach((row) => { const tr = add("tr", "", foot); row.forEach((c) => add("td", c, tr)); }); }
  };
  add("h1", title); add("p", subtitle);
  if (summary.length) table(["Summary", "Value"], summary.map((r) => [r.label, r.value]));
  for (const section of sections) { add("h2", section.title); if (section.note) add("p", section.note); table(section.columns, section.rows || [], section.totals || []); }
  doc.fonts.ready.then(() => { if (dialog.isConnected) print.disabled = false; });
  print.onclick = () => { frame.contentWindow.focus(); frame.contentWindow.print(); };
}

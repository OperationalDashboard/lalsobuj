const HEADER_PATTERNS = {
  entry_date: /(^|\b)(date|day)(\b|$)/i,
  channel: /(^|\b)(platform|channel|source|medium)(\b|$)/i,
  coach_number: /(^|\b)(coach|coach\s*(number|no|#)?)(\b|$)/i,
  bus_number: /(^|\b)(bus|bus\s*(number|no|#)?|registration|reg\s*(number|no)?)(\b|$)/i,
  normal_passengers: /(^|\b)(normal|regular)(\s*(passenger|pax|ticket)s?)?(\b|$)/i,
  long_passengers: /(^|\b)(long)(\s*(passenger|pax|ticket)s?)?(\b|$)/i,
  passenger_count: /(^|\b)(passenger|passengers|pax|ticket|tickets|passenger\s*(count|number|total)|total\s*passengers?)(\b|$)/i,
  amount: /(^|\b)(amount|sale|sales|fare|price|revenue|collection|total\s*(amount|sale|sales|fare)?)(\b|$)/i,
  category_name: /(^|\b)(category|expense\s*(category|type)|cost\s*(category|type)|type)(\b|$)/i,
  description: /(^|\b)(description|details|note|notes|remarks?)(\b|$)/i,
};

export const IMPORT_DESTINATIONS = {
  digital: {
    label: "Digital Sales",
    fields: [
      ["entry_date", "Entry date"],
      ["channel", "Platform"],
      ["coach_number", "Coach number"],
      ["bus_number", "Bus number"],
      ["normal_passengers", "Normal passengers"],
      ["long_passengers", "Long passengers"],
      ["passenger_count", "Total passengers"],
      ["amount", "Sale amount"],
    ],
  },
  cash: {
    label: "Cash Sales",
    fields: [
      ["entry_date", "Entry date"],
      ["coach_number", "Coach number"],
      ["bus_number", "Bus number"],
      ["passenger_count", "Total passengers"],
      ["amount", "Cash sale amount"],
    ],
  },
  expense: {
    label: "Daily Cash Costs",
    fields: [
      ["expense_date", "Expense date"],
      ["category_name", "Expense category"],
      ["description", "Note / description"],
      ["amount", "Expense amount"],
    ],
  },
};

function cleanText(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 10);
  }
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function uniqueHeaders(values) {
  const used = new Map();
  return values.map((value, index) => {
    const base = cleanText(value) || `Column ${index + 1}`;
    const count = (used.get(base.toLowerCase()) || 0) + 1;
    used.set(base.toLowerCase(), count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function headerScore(row) {
  return row.reduce((score, cell) => {
    const text = cleanText(cell);
    return score + (Object.values(HEADER_PATTERNS).some((pattern) => pattern.test(text)) ? 1 : 0);
  }, 0);
}

function matrixToTable(matrix, name) {
  const rows = matrix
    .map((row) => Array.isArray(row) ? row.map(cleanText) : [])
    .filter((row) => row.some(Boolean));
  if (!rows.length) return null;

  const candidates = rows.slice(0, 20).map((row, index) => ({ index, score: headerScore(row), filled: row.filter(Boolean).length }));
  candidates.sort((a, b) => b.score - a.score || b.filled - a.filled || a.index - b.index);
  const headerIndex = candidates[0]?.score >= 2 ? candidates[0].index : rows.findIndex((row) => row.filter(Boolean).length >= 2);
  if (headerIndex < 0) return null;

  const width = Math.max(rows[headerIndex].length, ...rows.slice(headerIndex + 1).map((row) => row.length));
  const headers = uniqueHeaders(Array.from({ length: width }, (_, index) => rows[headerIndex][index]));
  const data = rows.slice(headerIndex + 1)
    .map((row) => Array.from({ length: width }, (_, index) => cleanText(row[index])))
    .filter((row) => row.some(Boolean));
  if (!data.length) return null;
  return { id: `${name}-${headerIndex}`, name, headers, rows: data.slice(0, 500), totalRows: data.length, sourceStart: headerIndex + 2 };
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value !== "") || rows.length === 0) rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = [[",", (firstLine.match(/,/g) || []).length], ["\t", (firstLine.match(/\t/g) || []).length], [";", (firstLine.match(/;/g) || []).length]];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] ? counts[0][0] : ",";
}

function groupPdfLines(items) {
  const lines = [];
  for (const item of items.filter((entry) => cleanText(entry.str))) {
    const y = Number(item.transform?.[5] || 0);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
    if (!line) {
      line = { y, tokens: [] };
      lines.push(line);
    }
    line.tokens.push({ x: Number(item.transform?.[4] || 0), width: Number(item.width || 0), height: Math.abs(Number(item.height || item.transform?.[3] || 10)), text: cleanText(item.str) });
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => ({ ...line, tokens: line.tokens.sort((a, b) => a.x - b.x) }));
}

function segmentPdfHeader(tokens) {
  const cells = [];
  for (const token of tokens) {
    const previous = cells[cells.length - 1];
    const gap = previous ? token.x - previous.end : Number.POSITIVE_INFINITY;
    const threshold = Math.max(8, (previous?.height || token.height || 10) * .85);
    if (!previous || gap > threshold) cells.push({ x: token.x, end: token.x + token.width, height: token.height, text: token.text });
    else {
      previous.text = `${previous.text} ${token.text}`.trim();
      previous.end = Math.max(previous.end, token.x + token.width);
      previous.height = Math.max(previous.height, token.height);
    }
  }
  return cells;
}

function pdfLinesToTable(lines, name) {
  const scored = lines.slice(0, 30).map((line, index) => ({ index, score: headerScore(segmentPdfHeader(line.tokens).map((cell) => cell.text)) }));
  scored.sort((a, b) => b.score - a.score || a.index - b.index);
  if (!scored[0] || scored[0].score < 2) return null;
  const headerIndex = scored[0].index;
  const headerCells = segmentPdfHeader(lines[headerIndex].tokens);
  if (headerCells.length < 2) return null;
  const boundaries = headerCells.slice(0, -1).map((cell, index) => (cell.x + headerCells[index + 1].x) / 2);
  const matrix = [headerCells.map((cell) => cell.text)];

  for (const line of lines.slice(headerIndex + 1)) {
    const repeatedHeader = headerScore(segmentPdfHeader(line.tokens).map((cell) => cell.text)) >= Math.max(2, scored[0].score - 1);
    if (repeatedHeader) continue;
    const row = Array.from({ length: headerCells.length }, () => "");
    for (const token of line.tokens) {
      let column = boundaries.findIndex((boundary) => token.x < boundary);
      if (column < 0) column = headerCells.length - 1;
      row[column] = `${row[column]} ${token.text}`.trim();
    }
    if (row.filter(Boolean).length >= 2) matrix.push(row);
  }
  return matrixToTable(matrix, name);
}

async function readPdf(file) {
  const [{ getDocument, GlobalWorkerOptions }, workerUrl] = await Promise.all([
    import("pdfjs-dist/build/pdf.mjs"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  GlobalWorkerOptions.workerSrc = workerUrl.default;
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  const tables = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const table = pdfLinesToTable(groupPdfLines(content.items), `${file.name} — page ${pageNumber}`);
    if (table) tables.push(table);
  }
  if (!tables.length) throw new Error("No readable table was found. This PDF may be scanned, or its rows may not have clear column headings.");
  return tables;
}

async function readWorkbook(file) {
  const { default: readExcelFile } = await import("read-excel-file/browser");
  const sheets = await readExcelFile(file);
  return sheets.map(({ sheet, data }) => matrixToTable(data, `${file.name} — ${sheet}`)).filter(Boolean);
}

export async function readImportFile(file) {
  if (!file) throw new Error("Choose a file first.");
  if (file.size > 15 * 1024 * 1024) throw new Error("Choose a file smaller than 15 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension === "pdf") return readPdf(file);
  if (extension === "xlsx") {
    const tables = await readWorkbook(file);
    if (!tables.length) throw new Error("No usable table was found in this Excel workbook.");
    return tables;
  }
  if (["csv", "tsv", "txt"].includes(extension)) {
    const text = await file.text();
    const table = matrixToTable(parseDelimited(text.replace(/^\ufeff/, ""), extension === "tsv" ? "\t" : detectDelimiter(text)), file.name);
    if (!table) throw new Error("No usable table was found in this file.");
    return [table];
  }
  throw new Error("Use a PDF, Excel (.xlsx), CSV, TSV, or text table file.");
}

function normalizedHeader(value) {
  return cleanText(value).toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9# ]/g, " ").replace(/\s+/g, " ").trim();
}

export function suggestMappings(headers, destination) {
  const allowed = new Set(IMPORT_DESTINATIONS[destination].fields.map(([value]) => value));
  const mapping = {};
  const used = new Set();
  headers.forEach((header, index) => {
    const text = normalizedHeader(header);
    let target = Object.entries(HEADER_PATTERNS).find(([key, pattern]) => (allowed.has(key) || (destination === "expense" && key === "entry_date")) && pattern.test(text))?.[0] || "";
    if (destination === "expense" && target === "entry_date") target = "expense_date";
    if (target && allowed.has(target) && !used.has(target)) {
      mapping[index] = target;
      used.add(target);
    } else mapping[index] = "";
  });
  return mapping;
}

function parseNumber(value) {
  const cleaned = cleanText(value).replace(/bdt|taka|tk\.?/gi, "").replace(/,/g, "").replace(/[^0-9.-]/g, "");
  if (cleaned === "") return "";
  const number = Number(cleaned);
  return Number.isFinite(number) ? String(number) : cleanText(value);
}

function parseDate(value, fallback) {
  const text = cleanText(value);
  if (!text) return fallback;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2}|\d{4})$/);
  if (match) {
    const year = match[3].length === 2 ? Number(`20${match[3]}`) : Number(match[3]);
    const month = Number(match[2]);
    const day = Number(match[1]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  return text;
}

function parseChannel(value, fallback) {
  const text = normalizedHeader(value);
  if (!text) return fallback;
  if (/android/.test(text)) return "android";
  if (/ios|iphone|apple/.test(text)) return "ios";
  if (/web/.test(text)) return "website";
  return "";
}

export function buildPreviewRows(table, mapping, destination, defaults, categories) {
  return table.rows.map((source, rowIndex) => {
    const values = {};
    Object.entries(mapping).forEach(([sourceIndex, target]) => {
      if (target) values[target] = cleanText(source[Number(sourceIndex)]);
    });
    if (destination === "digital") {
      const total = parseNumber(values.passenger_count);
      const hasSplit = values.normal_passengers !== undefined || values.long_passengers !== undefined;
      return {
        selected: true,
        sourceRow: (table.sourceStart || 2) + rowIndex,
        entry_date: parseDate(values.entry_date, defaults.date),
        channel: parseChannel(values.channel, defaults.channel),
        coach_number: values.coach_number || "",
        bus_number: values.bus_number || "",
        normal_passengers: parseNumber(hasSplit ? values.normal_passengers : total || 0),
        long_passengers: parseNumber(hasSplit ? values.long_passengers : 0),
        amount: parseNumber(values.amount),
      };
    }
    if (destination === "cash") {
      return {
        selected: true,
        sourceRow: (table.sourceStart || 2) + rowIndex,
        entry_date: parseDate(values.entry_date, defaults.date),
        channel: "cash",
        coach_number: values.coach_number || "",
        bus_number: values.bus_number || "",
        passenger_count: parseNumber(values.passenger_count),
        amount: parseNumber(values.amount),
      };
    }
    const suppliedCategory = cleanText(values.category_name);
    const matchedCategory = categories.find((category) => normalizedHeader(category.name) === normalizedHeader(suppliedCategory));
    return {
      selected: true,
      sourceRow: (table.sourceStart || 2) + rowIndex,
      expense_date: parseDate(values.expense_date, defaults.date),
      category_id: String(matchedCategory?.id || (suppliedCategory ? "" : defaults.categoryId) || ""),
      description: values.description || "",
      amount: parseNumber(values.amount),
    };
  });
}

export function validateImportRow(row, destination) {
  const errors = [];
  const date = destination === "expense" ? row.expense_date : row.entry_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) errors.push("Enter a valid date");
  if (destination !== "expense") {
    if (!cleanText(row.coach_number)) errors.push("Coach number is required");
    if (!cleanText(row.bus_number)) errors.push("Bus number is required");
    if (destination === "digital") {
      if (!["website", "android", "ios"].includes(row.channel)) errors.push("Choose a platform");
      if (![row.normal_passengers, row.long_passengers].every((value) => Number.isInteger(Number(value)) && Number(value) >= 0)) errors.push("Passenger counts must be whole numbers");
    } else if (!Number.isInteger(Number(row.passenger_count)) || Number(row.passenger_count) < 0) errors.push("Passenger count must be a whole number");
  } else if (!row.category_id) errors.push("Choose an expense category");
  if (row.amount === "" || !Number.isFinite(Number(row.amount)) || Number(row.amount) < 0) errors.push("Enter a valid amount");
  return errors;
}

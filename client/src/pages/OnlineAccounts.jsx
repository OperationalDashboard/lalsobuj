import { useCallback, useEffect, useMemo, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";

const today = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};
const firstDayOfMonth = () => `${today().slice(0, 8)}01`;
const onlineBlank = (date = today()) => ({
  entry_date: date,
  channel: "website",
  coach_number: "",
  bus_number: "",
  normal_passengers: "",
  long_passengers: "",
  amount: "",
});
const cashBlank = (date = today()) => ({
  entry_date: date,
  channel: "cash",
  coach_number: "",
  bus_number: "",
  passenger_count: "",
  amount: "",
});
const expenseBlank = (date = today(), categoryId = "") => ({
  expense_date: date,
  category_id: categoryId,
  description: "",
  amount: "",
});

const channelLabels = {
  website: "Website",
  android: "Android App",
  ios: "iOS App",
  website_android: "Website / Android App (legacy)",
  cash: "Cash",
};

const money = (value) => `BDT ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const plainNumber = (value) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });

function Field({ label, children, className = "" }) {
  return <label className={`online-field ${className}`}><span>{label}</span>{children}</label>;
}

function EntryTable({ rows, type, onEdit, onDelete, canWrite }) {
  const isOnline = type === "online";
  return (
    <div className="online-table-scroll">
      <table className="online-entry-table">
        <thead><tr>
          {isOnline && <th>Platform</th>}
          <th>Coach</th><th>Bus</th>
          {isOnline ? <><th>Normal</th><th>Long</th><th>Total</th></> : <th>Passengers</th>}
          <th>Sale</th>{canWrite && <th>Actions</th>}
        </tr></thead>
        <tbody>
          {rows.map((row) => <tr key={row.id}>
            {isOnline && <td><span className={`online-channel-badge ${row.channel}`}>{channelLabels[row.channel]}</span></td>}
            <td>{row.coach_number}</td>
            <td>{row.bus_number}</td>
            {isOnline ? <><td>{row.normal_passengers}</td><td>{row.long_passengers}</td><td><strong>{row.passenger_count}</strong></td></> : <td>{row.passenger_count}</td>}
            <td><strong>{money(row.amount)}</strong></td>
            {canWrite && <td><div className="online-row-actions"><button type="button" className="settings-edit-button" onClick={() => onEdit(row)}>Edit</button><button type="button" className="link-danger" onClick={() => onDelete(row.id)}>Delete</button></div></td>}
          </tr>)}
          {rows.length === 0 && <tr><td colSpan={isOnline ? (canWrite ? 8 : 7) : (canWrite ? 5 : 4)}>No {isOnline ? "online" : "cash"} entries for this date.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export default function OnlineAccounts() {
  const user = getUser();
  const canWrite = isFullAccess(user?.role) || user?.role === ROLES.ONLINE_MANAGER || Boolean(user?.permissions?.online_accounts?.can_write);
  const [view, setView] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(today());
  const [entries, setEntries] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [onlineForm, setOnlineForm] = useState(onlineBlank());
  const [cashForm, setCashForm] = useState(cashBlank());
  const [expenseForm, setExpenseForm] = useState(expenseBlank());
  const [editingOnlineId, setEditingOnlineId] = useState(null);
  const [editingCashId, setEditingCashId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [newCategory, setNewCategory] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [range, setRange] = useState({ from: firstDayOfMonth(), to: today() });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reportLoading, setReportLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeCategories = useMemo(() => categories.filter((category) => Number(category.active)), [categories]);
  const onlineEntries = useMemo(() => entries.filter((entry) => entry.channel !== "cash"), [entries]);
  const cashEntries = useMemo(() => entries.filter((entry) => entry.channel === "cash"), [entries]);
  const dailyChannelTotals = useMemo(() => entries.reduce((totals, entry) => {
    if (!totals[entry.channel]) totals[entry.channel] = { sales: 0, passengers: 0, normal: 0, long: 0 };
    totals[entry.channel].sales += Number(entry.amount || 0);
    totals[entry.channel].passengers += Number(entry.passenger_count || 0);
    totals[entry.channel].normal += Number(entry.normal_passengers || 0);
    totals[entry.channel].long += Number(entry.long_passengers || 0);
    return totals;
  }, {}), [entries]);
  const dailyOnlineSale = onlineEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const dailyOnlinePassengers = onlineEntries.reduce((sum, entry) => sum + Number(entry.passenger_count || 0), 0);
  const dailyCashSale = cashEntries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const dailyCashPassengers = cashEntries.reduce((sum, entry) => sum + Number(entry.passenger_count || 0), 0);
  const dailyExpense = expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  const flash = (text) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2600);
  };

  const loadCategories = useCallback(async () => {
    const rows = await api.get("/online-accounts/expense-categories");
    setCategories(rows);
    const firstActive = rows.find((category) => Number(category.active));
    setExpenseForm((current) => ({ ...current, category_id: current.category_id || (firstActive ? String(firstActive.id) : "") }));
  }, []);

  const loadDaily = useCallback(async (date) => {
    setLoading(true);
    setError("");
    try {
      const query = `from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`;
      const [entryRows, expenseRows] = await Promise.all([
        api.get(`/online-accounts/entries?${query}`),
        api.get(`/online-accounts/expenses?${query}`),
      ]);
      setEntries(entryRows);
      setExpenses(expenseRows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    setError("");
    try {
      const data = await api.get(`/online-accounts/report?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setReportLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => {
    loadCategories().catch((err) => setError(err.message));
  }, [loadCategories]);

  useEffect(() => {
    setOnlineForm(onlineBlank(selectedDate));
    setCashForm(cashBlank(selectedDate));
    setExpenseForm((current) => expenseBlank(selectedDate, current.category_id));
    setEditingOnlineId(null);
    setEditingCashId(null);
    setEditingExpenseId(null);
    loadDaily(selectedDate);
  }, [loadDaily, selectedDate]);

  useEffect(() => {
    if (!cashForm.entry_date) return;
    setExpenseForm((current) => current.expense_date === cashForm.entry_date
      ? current
      : { ...current, expense_date: cashForm.entry_date });
  }, [cashForm.entry_date]);

  useEffect(() => {
    if (view === "report" && !report) loadReport();
  }, [loadReport, report, view]);

  async function saveEntry(event, kind) {
    event.preventDefault();
    setError("");
    const isOnline = kind === "online";
    const form = isOnline ? onlineForm : cashForm;
    const editingId = isOnline ? editingOnlineId : editingCashId;
    if (isOnline && form.channel === "website_android") {
      setError("Choose Website or Android App for this older combined entry before saving.");
      return;
    }
    if (!form.coach_number.trim() || !form.bus_number.trim() || form.amount === "") {
      setError("Coach number, bus number, and amount are required.");
      return;
    }
    const payload = {
      ...form,
      normal_passengers: Number(form.normal_passengers || 0),
      long_passengers: Number(form.long_passengers || 0),
      passenger_count: Number(form.passenger_count || 0),
      amount: Number(form.amount),
    };
    try {
      if (editingId) await api.put(`/online-accounts/entries/${editingId}`, payload);
      else await api.post("/online-accounts/entries", payload);
      if (isOnline) {
        setOnlineForm(onlineBlank(selectedDate));
        setEditingOnlineId(null);
      } else {
        setCashForm(cashBlank(selectedDate));
        setEditingCashId(null);
      }
      setReport(null);
      if (form.entry_date !== selectedDate) setSelectedDate(form.entry_date);
      else await loadDaily(selectedDate);
      flash(editingId ? "Sale entry updated." : "Sale entry added.");
    } catch (err) {
      setError(err.message);
    }
  }

  function editEntry(entry) {
    setError("");
    if (entry.channel === "cash") {
      setEditingCashId(entry.id);
      setCashForm({
        entry_date: entry.entry_date,
        channel: "cash",
        coach_number: entry.coach_number,
        bus_number: entry.bus_number,
        passenger_count: String(entry.passenger_count),
        amount: String(entry.amount),
      });
    } else {
      setEditingOnlineId(entry.id);
      setOnlineForm({
        entry_date: entry.entry_date,
        channel: entry.channel,
        coach_number: entry.coach_number,
        bus_number: entry.bus_number,
        normal_passengers: String(entry.normal_passengers),
        long_passengers: String(entry.long_passengers),
        amount: String(entry.amount),
      });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteEntry(id) {
    if (!window.confirm("Delete this sale entry?")) return;
    try {
      await api.del(`/online-accounts/entries/${id}`);
      setReport(null);
      await loadDaily(selectedDate);
      flash("Sale entry deleted.");
    } catch (err) { setError(err.message); }
  }

  async function saveExpense(event) {
    event.preventDefault();
    setError("");
    if (!expenseForm.category_id || expenseForm.amount === "") {
      setError("Choose an expense category and enter the amount.");
      return;
    }
    try {
      const payload = { ...expenseForm, category_id: Number(expenseForm.category_id), amount: Number(expenseForm.amount) };
      if (editingExpenseId) await api.put(`/online-accounts/expenses/${editingExpenseId}`, payload);
      else await api.post("/online-accounts/expenses", payload);
      setExpenseForm(expenseBlank(selectedDate, activeCategories[0] ? String(activeCategories[0].id) : ""));
      setEditingExpenseId(null);
      setReport(null);
      if (expenseForm.expense_date !== selectedDate) {
        setSelectedDate(expenseForm.expense_date);
        await loadCategories();
      } else await Promise.all([loadDaily(selectedDate), loadCategories()]);
      flash(editingExpenseId ? "Expense updated." : "Expense added.");
    } catch (err) { setError(err.message); }
  }

  function editExpense(expense) {
    setEditingExpenseId(expense.id);
    setExpenseForm({
      expense_date: expense.expense_date,
      category_id: String(expense.category_id),
      description: expense.description || "",
      amount: String(expense.amount),
    });
  }

  async function deleteExpense(id) {
    if (!window.confirm("Delete this cash expense?")) return;
    try {
      await api.del(`/online-accounts/expenses/${id}`);
      setReport(null);
      await Promise.all([loadDaily(selectedDate), loadCategories()]);
      flash("Expense deleted.");
    } catch (err) { setError(err.message); }
  }

  async function addCategory(event) {
    event.preventDefault();
    if (!newCategory.trim()) return;
    try {
      await api.post("/online-accounts/expense-categories", { name: newCategory.trim() });
      setNewCategory("");
      await loadCategories();
      flash("Expense category added.");
    } catch (err) { setError(err.message); }
  }

  async function saveCategory(category) {
    const name = editingCategory?.name?.trim();
    if (!name) return;
    try {
      await api.put(`/online-accounts/expense-categories/${category.id}`, { name });
      setEditingCategory(null);
      setReport(null);
      await Promise.all([loadCategories(), loadDaily(selectedDate)]);
      flash("Expense category renamed everywhere.");
    } catch (err) { setError(err.message); }
  }

  async function toggleCategory(category) {
    const willActivate = !Number(category.active);
    if (!willActivate && !window.confirm(`Archive '${category.name}'? Previous expenses will remain in reports.`)) return;
    try {
      await api.put(`/online-accounts/expense-categories/${category.id}`, { active: willActivate });
      await loadCategories();
      flash(willActivate ? "Expense category restored." : "Expense category archived.");
    } catch (err) { setError(err.message); }
  }

  function reportText() {
    if (!report) return "";
    return [
      `Online Accounts final report (${report.from} to ${report.to})`,
      `Website: ${money(report.platforms.find((item) => item.channel === "website")?.sales)}`,
      `Android App: ${money(report.platforms.find((item) => item.channel === "android")?.sales)}`,
      `iOS App: ${money(report.platforms.find((item) => item.channel === "ios")?.sales)}`,
      ...(report.has_legacy_entries ? [`Legacy Website / Android: ${money(report.platforms.find((item) => item.channel === "website_android")?.sales)}`] : []),
      `Cash: ${money(report.totals.cash_sale)}`,
      `Online sale: ${money(report.totals.online_sale)}`,
      `Total sale: ${money(report.totals.combined_sale)}`,
      `Expenses: ${money(report.totals.total_expense)}`,
      `Final cash: ${money(report.totals.final_cash)}`,
    ].join("\n");
  }

  async function makePdf() {
    if (!report) return;
    const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(17);
    doc.text("Lal Sabuj Paribahan - Online Accounts", 14, 16);
    doc.setFontSize(10);
    doc.text(`Final report: ${report.from} to ${report.to}`, 14, 23);
    doc.text(`Online sale: ${money(report.totals.online_sale)}   Cash sale: ${money(report.totals.cash_sale)}   Expenses: ${money(report.totals.total_expense)}   Final cash: ${money(report.totals.final_cash)}`, 14, 30);
    autoTable(doc, {
      startY: 37,
      head: [["Platform", "Normal", "Long", "Total passengers", "Sales (BDT)"]],
      body: report.platforms.map((item) => [channelLabels[item.channel], item.channel === "cash" ? "-" : item.normal_passengers, item.channel === "cash" ? "-" : item.long_passengers, item.passenger_count, plainNumber(item.sales)]),
      theme: "grid",
      headStyles: { fillColor: [4, 106, 56] },
    });
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 8,
      head: [["Expense category", "Entries", "Days used", "Total (BDT)"]],
      body: report.expense_categories.length ? report.expense_categories.map((item) => [item.category_name, item.entry_count, item.days_used, plainNumber(item.total)]) : [["No expenses", "-", "-", "0"]],
      theme: "grid",
      headStyles: { fillColor: [169, 93, 115] },
    });
    doc.save(`online-accounts-${report.from}-to-${report.to}.pdf`);
  }

  async function shareReport() {
    if (!report) return;
    const text = reportText();
    try {
      if (navigator.share) await navigator.share({ title: "Online Accounts final report", text });
      else {
        await navigator.clipboard.writeText(text);
        flash("Report summary copied. Paste it into any app to share.");
      }
    } catch (err) {
      if (err.name !== "AbortError") setError("Could not share this report from the current browser.");
    }
  }

  function exportExcel() {
    if (!report) return;
    const rows = [
      ["ONLINE ACCOUNTS FINAL REPORT"],
      ["From", report.from, "To", report.to],
      [],
      ["Platform", "Normal passengers", "Long passengers", "Total passengers", "Sales (BDT)"],
      ...report.platforms.map((item) => [channelLabels[item.channel], item.channel === "cash" ? "" : item.normal_passengers, item.channel === "cash" ? "" : item.long_passengers, item.passenger_count, item.sales]),
      [],
      ["Online sale", report.totals.online_sale],
      ["Cash sale", report.totals.cash_sale],
      ["Total sale", report.totals.combined_sale],
      ["Total expense", report.totals.total_expense],
      ["Final cash", report.totals.final_cash],
      [],
      ["CLUSTERED EXPENSES"],
      ["Category", "Entries", "Days used", "Total (BDT)"],
      ...report.expense_categories.map((item) => [item.category_name, item.entry_count, item.days_used, item.total]),
      [],
      ["DAILY SUMMARY"],
      ["Date", "Website", "Android App", "iOS App", ...(report.has_legacy_entries ? ["Legacy Website/Android"] : []), "Cash", "Online passengers", "Cash passengers", "Expenses", "Final cash"],
      ...report.daily.map((day) => [day.date, day.website_sales, day.android_sales, day.ios_sales, ...(report.has_legacy_entries ? [day.website_android_sales] : []), day.cash_sales, day.online_passengers, day.cash_passengers, day.expenses, day.final_cash]),
    ];
    const escape = (cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`;
    const csv = `\ufeff${rows.map((row) => row.map(escape).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `online-accounts-${report.from}-to-${report.to}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="online-accounts-page">
    <div className="page-header online-page-header">
      <div><h1>Online Accounts</h1><p>Standalone sales and cash-expense records. Nothing here is posted to the main Accounts or Reports modules.</p></div>
      <span className="online-isolated-mark">Isolated module</span>
    </div>

    <div className="online-module-tabs" role="tablist" aria-label="Online Accounts sections">
      <button type="button" className={view === "daily" ? "active" : ""} onClick={() => setView("daily")}>Daily entries</button>
      <button type="button" className={view === "report" ? "active" : ""} onClick={() => setView("report")}>Final report</button>
    </div>
    {error && <p className="error-text online-notice">{error}</p>}
    {message && <p className="success-text online-notice">{message}</p>}
    {!canWrite && <p className="online-read-only-note">View-only access: an Admin can enable Edit permission from Users & Permissions.</p>}

    {view === "daily" && <>
      <div className="online-day-toolbar card">
        <div><span className="settings-eyebrow">WORKING DAY</span><h3>Daily collection sheet</h3><p>Choose a date to enter or revise that day’s sales and expenses.</p></div>
        <Field label="Entry date"><input type="date" value={selectedDate} onChange={(event) => event.target.value && setSelectedDate(event.target.value)} required /></Field>
      </div>

      <div className="online-summary-strip">
        {(["website", "android", "ios"]).map((channel) => {
          const total = dailyChannelTotals[channel] || { sales: 0, passengers: 0, normal: 0, long: 0 };
          return <div key={channel}><span>{channelLabels[channel]} sale</span><strong>{money(total.sales)}</strong><small>{total.passengers} passengers · {total.normal} normal · {total.long} long</small></div>;
        })}
        {dailyChannelTotals.website_android && <div><span>Legacy combined sale</span><strong>{money(dailyChannelTotals.website_android.sales)}</strong><small>{dailyChannelTotals.website_android.passengers} passengers · awaiting platform classification</small></div>}
        <div><span>Online total</span><strong>{money(dailyOnlineSale)}</strong><small>{dailyOnlinePassengers} digital passengers</small></div>
        <div><span>Cash sale</span><strong>{money(dailyCashSale)}</strong><small>{dailyCashPassengers} passengers</small></div>
        <div className="expense"><span>Cash expenses</span><strong>{money(dailyExpense)}</strong></div>
        <div className={dailyCashSale - dailyExpense < 0 ? "negative" : ""}><span>Final cash</span><strong>{money(dailyCashSale - dailyExpense)}</strong></div>
      </div>

      <div className="online-entry-grid">
        <section className="card online-entry-panel">
          <div className="online-panel-title"><div><span className="settings-eyebrow">DIGITAL SALES</span><h3>Website, Android App & iOS App</h3><p>Each platform is recorded separately. Normal and Long passengers are counted separately.</p></div><span className="online-panel-number">01</span></div>
          {canWrite && <form className="online-form-grid" onSubmit={(event) => saveEntry(event, "online")}>
            <Field label="Platform"><select value={onlineForm.channel} onChange={(event) => setOnlineForm({ ...onlineForm, channel: event.target.value })}><option value="website">Website</option><option value="android">Android App</option><option value="ios">iOS App</option>{onlineForm.channel === "website_android" && <option value="website_android" disabled>Legacy combined — choose Website or Android</option>}</select></Field>
            <Field label="Entry date"><input type="date" value={onlineForm.entry_date} onChange={(event) => setOnlineForm({ ...onlineForm, entry_date: event.target.value })} required /></Field>
            <Field label="Coach number"><input value={onlineForm.coach_number} onChange={(event) => setOnlineForm({ ...onlineForm, coach_number: event.target.value })} placeholder="Coach number" required /></Field>
            <Field label="Bus number"><input value={onlineForm.bus_number} onChange={(event) => setOnlineForm({ ...onlineForm, bus_number: event.target.value })} placeholder="Bus number" required /></Field>
            <Field label="Normal passengers"><input type="number" min="0" step="1" value={onlineForm.normal_passengers} onChange={(event) => setOnlineForm({ ...onlineForm, normal_passengers: event.target.value })} placeholder="0" required /></Field>
            <Field label="Long passengers"><input type="number" min="0" step="1" value={onlineForm.long_passengers} onChange={(event) => setOnlineForm({ ...onlineForm, long_passengers: event.target.value })} placeholder="0" required /></Field>
            <Field label="Sale amount (BDT)" className="wide"><input type="number" min="0" step="0.01" value={onlineForm.amount} onChange={(event) => setOnlineForm({ ...onlineForm, amount: event.target.value })} placeholder="0.00" required /></Field>
            <div className="online-form-actions wide"><button className="primary" type="submit">{editingOnlineId ? "Update online entry" : "Add online entry"}</button>{editingOnlineId && <button type="button" className="settings-edit-button" onClick={() => { setEditingOnlineId(null); setOnlineForm(onlineBlank(selectedDate)); }}>Cancel edit</button>}</div>
          </form>}
          <EntryTable rows={onlineEntries} type="online" onEdit={editEntry} onDelete={deleteEntry} canWrite={canWrite} />
        </section>

        <section className="card online-entry-panel cash-panel">
          <div className="online-panel-title"><div><span className="settings-eyebrow">CASH SALES</span><h3>Manual cash collection</h3><p>Enter the total passenger count exactly as received.</p></div><span className="online-panel-number">02</span></div>
          {canWrite && <form className="online-form-grid" onSubmit={(event) => saveEntry(event, "cash")}>
            <Field label="Entry date" className="wide"><input type="date" value={cashForm.entry_date} onChange={(event) => setCashForm({ ...cashForm, entry_date: event.target.value })} required /></Field>
            <Field label="Coach number"><input value={cashForm.coach_number} onChange={(event) => setCashForm({ ...cashForm, coach_number: event.target.value })} placeholder="Coach number" required /></Field>
            <Field label="Bus number"><input value={cashForm.bus_number} onChange={(event) => setCashForm({ ...cashForm, bus_number: event.target.value })} placeholder="Bus number" required /></Field>
            <Field label="Total passengers"><input type="number" min="0" step="1" value={cashForm.passenger_count} onChange={(event) => setCashForm({ ...cashForm, passenger_count: event.target.value })} placeholder="0" required /></Field>
            <Field label="Cash sale (BDT)"><input type="number" min="0" step="0.01" value={cashForm.amount} onChange={(event) => setCashForm({ ...cashForm, amount: event.target.value })} placeholder="0.00" required /></Field>
            <div className="online-form-actions wide"><button className="primary" type="submit">{editingCashId ? "Update cash entry" : "Add cash entry"}</button>{editingCashId && <button type="button" className="settings-edit-button" onClick={() => { setEditingCashId(null); setCashForm(cashBlank(selectedDate)); }}>Cancel edit</button>}</div>
          </form>}
          <EntryTable rows={cashEntries} type="cash" onEdit={editEntry} onDelete={deleteEntry} canWrite={canWrite} />
        </section>
      </div>

      <section className="card online-expense-panel">
        <div className="online-panel-title"><div><span className="settings-eyebrow">DAILY CASH COSTS</span><h3>Expenses</h3><p>Every entry is grouped by category in the final report.</p></div><span className="online-panel-number">03</span></div>
        {canWrite && <div className="online-expense-layout">
          <form className="online-form-grid online-expense-form" onSubmit={saveExpense}>
            <Field label="Expense category" className="wide"><select value={expenseForm.category_id} onChange={(event) => setExpenseForm({ ...expenseForm, category_id: event.target.value })} required><option value="">Choose category</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}{Number(category.active) ? "" : " (archived)"}</option>)}</select></Field>
            <Field label="Expense date" className="wide"><input type="date" value={expenseForm.expense_date} onChange={(event) => setExpenseForm({ ...expenseForm, expense_date: event.target.value })} required /></Field>
            <Field label="Amount (BDT)"><input type="number" min="0" step="0.01" value={expenseForm.amount} onChange={(event) => setExpenseForm({ ...expenseForm, amount: event.target.value })} placeholder="0.00" required /></Field>
            <Field label="Note"><input value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="Optional details" /></Field>
            <div className="online-form-actions wide"><button className="primary" type="submit">{editingExpenseId ? "Update expense" : "Add expense"}</button>{editingExpenseId && <button type="button" className="settings-edit-button" onClick={() => { setEditingExpenseId(null); setExpenseForm(expenseBlank(selectedDate, activeCategories[0] ? String(activeCategories[0].id) : "")); }}>Cancel edit</button>}</div>
          </form>

          <div className="online-category-manager">
            <h4>Expense categories</h4>
            <form onSubmit={addCategory}><input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="New category name" /><button className="primary" type="submit">Add</button></form>
            <div className="online-category-list">
              {categories.map((category) => <div className={`online-category-item ${Number(category.active) ? "" : "archived"}`} key={category.id}>
                {editingCategory?.id === category.id ? <input value={editingCategory.name} onChange={(event) => setEditingCategory({ ...editingCategory, name: event.target.value })} /> : <div><strong>{category.name}</strong><small>{category.expense_count} entries · {money(category.lifetime_total)}</small></div>}
                <div className="online-row-actions">
                  {editingCategory?.id === category.id ? <><button type="button" className="settings-edit-button" onClick={() => saveCategory(category)}>Save</button><button type="button" className="link-danger" onClick={() => setEditingCategory(null)}>Cancel</button></> : <><button type="button" className="settings-edit-button" onClick={() => setEditingCategory({ id: category.id, name: category.name })}>Edit</button><button type="button" className="link-danger" onClick={() => toggleCategory(category)}>{Number(category.active) ? "Archive" : "Restore"}</button></>}
                </div>
              </div>)}
            </div>
          </div>
        </div>}
        <div className="online-table-scroll">
          <table><thead><tr><th>Category</th><th>Note</th><th>Amount</th>{canWrite && <th>Actions</th>}</tr></thead><tbody>
            {expenses.map((expense) => <tr key={expense.id}><td><strong>{expense.category_name}</strong></td><td>{expense.description || "—"}</td><td><strong>{money(expense.amount)}</strong></td>{canWrite && <td><div className="online-row-actions"><button type="button" className="settings-edit-button" onClick={() => editExpense(expense)}>Edit</button><button type="button" className="link-danger" onClick={() => deleteExpense(expense.id)}>Delete</button></div></td>}</tr>)}
            {expenses.length === 0 && <tr><td colSpan={canWrite ? 4 : 3}>No expenses for this date.</td></tr>}
          </tbody></table>
        </div>
      </section>
      {loading && <p className="online-loading">Loading this day…</p>}
    </>}

    {view === "report" && <>
      <div className="card online-report-toolbar">
        <div><span className="settings-eyebrow">REPORT PERIOD</span><h3>Build the final report</h3><p>Sales, passengers, daily cash, and clustered expenses remain inside Online Accounts.</p></div>
        <div className="online-range-fields"><Field label="From"><input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} /></Field><Field label="To"><input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} /></Field><button type="button" className="primary" onClick={loadReport} disabled={reportLoading}>{reportLoading ? "Generating…" : "Generate report"}</button></div>
      </div>

      {report && <div className="online-final-report">
        <div className="online-report-heading"><div><span className="settings-eyebrow">FINAL REPORT</span><h2>Online Accounts</h2><p>{report.from} to {report.to}</p></div><div className="online-report-actions"><button type="button" className="settings-edit-button" onClick={() => window.print()}>Print</button><button type="button" className="settings-edit-button" onClick={makePdf}>Make PDF</button><button type="button" className="settings-edit-button" onClick={shareReport}>Share</button><button type="button" className="primary" onClick={exportExcel}>Move to Excel</button></div></div>

        <div className="online-report-summary">
          <div><span>Online sale</span><strong>{money(report.totals.online_sale)}</strong><small>Website + Android App + iOS App</small></div>
          <div><span>Cash sale</span><strong>{money(report.totals.cash_sale)}</strong><small>{report.totals.cash_passengers} passengers</small></div>
          <div><span>Total sale</span><strong>{money(report.totals.combined_sale)}</strong><small>All platforms and cash</small></div>
          <div className="expense"><span>Total expense</span><strong>{money(report.totals.total_expense)}</strong><small>Clustered below</small></div>
          <div className={report.totals.final_cash < 0 ? "negative" : "final"}><span>Final cash report</span><strong>{money(report.totals.final_cash)}</strong><small>Cash sale − expenses</small></div>
        </div>

        <div className="online-report-grid">
          <section className="card"><h3>Sales and passenger report</h3><div className="online-table-scroll"><table><thead><tr><th>Platform</th><th>Normal</th><th>Long</th><th>Total passengers</th><th>Total sale</th></tr></thead><tbody>
            {report.platforms.map((platform) => <tr key={platform.channel}><td><span className={`online-channel-badge ${platform.channel}`}>{channelLabels[platform.channel]}</span></td><td>{platform.channel === "cash" ? "—" : platform.normal_passengers}</td><td>{platform.channel === "cash" ? "—" : platform.long_passengers}</td><td><strong>{platform.passenger_count}</strong></td><td><strong>{money(platform.sales)}</strong></td></tr>)}
          </tbody></table></div></section>
          <section className="card"><h3>Clustered expense report</h3><div className="online-table-scroll"><table><thead><tr><th>Category</th><th>Entries</th><th>Days used</th><th>Total</th></tr></thead><tbody>
            {report.expense_categories.map((category) => <tr key={category.category_id}><td><strong>{category.category_name}</strong></td><td>{category.entry_count}</td><td>{category.days_used}</td><td><strong>{money(category.total)}</strong></td></tr>)}
            {report.expense_categories.length === 0 && <tr><td colSpan="4">No expenses in this period.</td></tr>}
          </tbody><tfoot><tr><td colSpan="3"><strong>Total expense</strong></td><td><strong>{money(report.totals.total_expense)}</strong></td></tr></tfoot></table></div></section>
        </div>

        <section className="card online-daily-report"><h3>Day-by-day report</h3><div className="online-table-scroll"><table><thead><tr><th>Date</th><th>Website</th><th>Android App</th><th>iOS App</th>{report.has_legacy_entries && <th>Legacy Website / Android</th>}<th>Cash</th><th>Online passengers</th><th>Cash passengers</th><th>Expenses</th><th>Final cash</th></tr></thead><tbody>
          {report.daily.map((day) => <tr key={day.date}><td><strong>{day.date}</strong></td><td>{money(day.website_sales)}</td><td>{money(day.android_sales)}</td><td>{money(day.ios_sales)}</td>{report.has_legacy_entries && <td>{money(day.website_android_sales)}</td>}<td>{money(day.cash_sales)}</td><td>{day.online_passengers}</td><td>{day.cash_passengers}</td><td>{money(day.expenses)}</td><td className={day.final_cash < 0 ? "online-negative-text" : "online-positive-text"}><strong>{money(day.final_cash)}</strong></td></tr>)}
          {report.daily.length === 0 && <tr><td colSpan={report.has_legacy_entries ? 10 : 9}>No data in this report period.</td></tr>}
        </tbody></table></div></section>
      </div>}
    </>}
  </div>;
}

import { Fragment, useEffect, useMemo, useState } from "react";
import { api, getUser } from "../api.js";
import { ROLES, isFullAccess } from "../roles.js";
import { t } from "../i18n.js";
import { canUseFeature } from "../permissions.js";
import { busLabel } from "../busLabel.js";

const today = () => new Date().toISOString().slice(0, 10);
const readableDate = (value) => value
  ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  : "Choose a date";
const entryEmpty = {
  type: "income", category: "ticket_sales", amount: "",
  passengers_count: "", price_per_seat: "", deduction_type: "", deducted_passengers: "",
  description: "", txn_date: today(), trip_id: "", apply_to_both: false, both_leg_amounts: null, place_name: "", attachment_name: "", attachment_data: "",
};

// Income can only ever be one of these two — everything else is an expense.
const INCOME_CATEGORIES = [
  { value: "ticket_sales", labelKey: "ticket_sales" },
  { value: "additional_sale", labelKey: "additional_sale" },
];
const EXPENSE_CATEGORIES = ["fuel", "salary", "repair", "toll", "counter_rent", "counter_staff_salary", "counter_electricity", "other"];
const BUS_PAGE_SIZE = 10;

// Imported buses keep an internal key such as "FLEETS-001 | 14-6868" so
// duplicate source rows remain independent. People should only ever see the
// actual Bus Number in Accounts, while older/manual buses still need a safe
// fallback when they do not have source_bus_number yet.
function displayBusNumber(bus) {
  return busLabel(bus);
}

function RotationDetails({ rows }) {
  const income = rows.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0);
  const expense = rows.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0);
  return <div style={{ padding: 8 }}><strong>Transaction details</strong><table style={{ marginTop: 6 }}><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Place</th><th>Counter</th><th>Amount</th><th>Description</th></tr></thead><tbody>{rows.map((tx) => <tr key={tx.id}><td>{tx.txn_date}</td><td>{tx.type}</td><td>{tx.category}</td><td>{tx.place_name || "—"}</td><td>{tx.counter_name || "Whole place"}</td><td>৳{tx.amount.toLocaleString()}</td><td>{tx.description || "—"}</td></tr>)}{rows.length === 0 && <tr><td colSpan={7}>No transactions.</td></tr>}</tbody>{rows.length > 0 && <tfoot><tr style={{ fontWeight: 700 }}><td colSpan={5}>Total</td><td colSpan={2}>Income ৳{income.toLocaleString()} · Expense ৳{expense.toLocaleString()} · Net <span style={{ color: income - expense >= 0 ? "var(--green)" : "var(--red)" }}>৳{(income - expense).toLocaleString()}</span></td></tr></tfoot>}</table></div>;
}

export default function Accounts() {
  const me = getUser();
  const isAccountsRole = me?.role === ROLES.ACCOUNTS;
  const canViewBus = canUseFeature(me, "accounts_bus", "read");
  const canViewPlace = canUseFeature(me, "accounts_place", "read");
  const canWriteBus = canUseFeature(me, "accounts_bus", "write");
  const canWritePlace = canUseFeature(me, "accounts_place", "write");
  const canFixPairing = canWriteBus;
  const canRemoveRotations = canWriteBus;

  const [busSummaries, setBusSummaries] = useState([]);
  const [buses, setBuses] = useState([]);
  const [discountTypes, setDiscountTypes] = useState([]);
  const [selectedBus, setSelectedBus] = useState("");
  const [busSearch, setBusSearch] = useState("");
  const [busPage, setBusPage] = useState(1);

  const [busTrips, setBusTrips] = useState([]);
  const [busTransactions, setBusTransactions] = useState([]);
  const [busMaintenance, setBusMaintenance] = useState([]);
  const [busSummary, setBusSummary] = useState({ income: 0, expense: 0, net: 0 });

  const [entryForm, setEntryForm] = useState(entryEmpty);
  const [closingGroupIds, setClosingGroupIds] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [error, setError] = useState("");
  const [openGroupId, setOpenGroupId] = useState(null);
  const [expensePlaces, setExpensePlaces] = useState([]);
  const [placeCounters, setPlaceCounters] = useState([]);
  const [expenseTypes, setExpenseTypes] = useState([]);
  const [placeTransactions, setPlaceTransactions] = useState([]);
  const [placeForm, setPlaceForm] = useState({ type: "expense", place_name: "", counter_id: "", finance_type: "", amount: "", txn_date: today(), note: "" });
  const [newExpenseType, setNewExpenseType] = useState("");
  const [openPlace, setOpenPlace] = useState("");
  const [selectedCounterDetail, setSelectedCounterDetail] = useState("");
  const [placeMessage, setPlaceMessage] = useState("");
  const [postingCounterSalary, setPostingCounterSalary] = useState(false);
  const [placePeriod, setPlacePeriod] = useState({ mode: "day", day: today(), from: today(), to: today() });
  const [placeTransactionsLoading, setPlaceTransactionsLoading] = useState(false);
  const [placePeriodError, setPlacePeriodError] = useState("");

  // Manual re-pairing of two legs into one rotation (Accounts/Admin only)
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");

  function loadOverview() {
    if (canViewBus) {
      api.get("/accounts/by-bus").then(setBusSummaries).catch(() => {});
      api.get("/buses").then(setBuses).catch(() => {});
      api.get("/discount-types").then(setDiscountTypes).catch(() => {});
    }
    if (canViewPlace) {
      loadPlaceExpenseSector();
      loadPlaceTransactions();
    }
  }
  useEffect(loadOverview, []);

  function loadPlaceExpenseSector() {
    api.get("/accounts/expense-places").then(setExpensePlaces).catch(() => {});
    api.get("/counters").then(setPlaceCounters).catch(() => {});
    api.get("/accounts/expense-types").then(setExpenseTypes).catch(() => {});
  }

  function loadPlaceTransactions() {
    const from = placePeriod.mode === "day" ? placePeriod.day : placePeriod.from;
    const to = placePeriod.mode === "day" ? placePeriod.day : placePeriod.to;
    if (!from || !to || from > to) {
      setPlaceTransactions([]);
      setPlacePeriodError("Choose a valid From and To date.");
      return;
    }
    setPlaceTransactionsLoading(true);
    setPlacePeriodError("");
    api.get(`/accounts/place-finance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then(setPlaceTransactions)
      .catch((err) => { setPlaceTransactions([]); setPlacePeriodError(err.message); })
      .finally(() => setPlaceTransactionsLoading(false));
  }

  useEffect(() => { loadPlaceTransactions(); }, [placePeriod.mode, placePeriod.day, placePeriod.from, placePeriod.to]); // eslint-disable-line

  async function addExpenseType(e) {
    e.preventDefault(); if (!newExpenseType.trim()) return;
    try { await api.post("/accounts/expense-types", { name: newExpenseType.trim() }); setNewExpenseType(""); loadPlaceExpenseSector(); } catch (err) { setError(err.message); }
  }
  async function addPlaceExpense(e) {
    e.preventDefault(); setError(""); setPlaceMessage("");
    if (!placeForm.place_name || !placeForm.finance_type || !placeForm.amount) { setPlaceMessage("Choose one place, one type, and an amount"); return; }
    try {
      await api.post("/accounts", { type: placeForm.type, category: placeForm.type === "income" ? "place_income" : "place_expense", amount: Number(placeForm.amount), txn_date: placeForm.txn_date, place_name: placeForm.place_name, counter_id: placeForm.counter_id || null, description: `${placeForm.finance_type}${placeForm.note ? ` — ${placeForm.note}` : ""}` });
      setOpenPlace(placeForm.place_name); setSelectedCounterDetail(placeForm.counter_id || "");
      setPlaceMessage(`Saved in ${placeForm.counter_id ? "the selected counter" : "the whole place"} details.`);
      setPlaceForm({ type: "expense", place_name: "", counter_id: "", finance_type: "", amount: "", txn_date: today(), note: "" }); loadOverview();
    } catch (err) { setPlaceMessage(err.message); }
  }
  async function postCounterSalary() {
    if (!placeForm.counter_id) { setPlaceMessage("Select the counter first"); return; }
    if (!placeForm.txn_date) { setPlaceMessage("Choose the salary posting date first"); return; }
    setPostingCounterSalary(true);
    setPlaceMessage("");
    try {
      const result = await api.post("/salary/post-place-expenses", { counter_id: placeForm.counter_id, month: placeForm.txn_date.slice(0, 7), txn_date: placeForm.txn_date });
      setOpenPlace(placeForm.place_name); setSelectedCounterDetail(placeForm.counter_id);
      setPlaceMessage(result.total ? `Posted staff salary for this counter: ৳${Number(result.total).toLocaleString()}` : "No active salary plan found for this counter.");
      loadOverview();
    } catch (err) { setPlaceMessage(err.message); }
    finally { setPostingCounterSalary(false); }
  }

  function loadBusDetail(busId) {
    if (!busId) return;
    api.get(`/trips/for-accounts?bus_id=${busId}`).then(setBusTrips).catch(() => {});
    api.get(`/accounts?bus_id=${busId}`).then(setBusTransactions).catch(() => {});
    api.get(`/maintenance?bus_id=${busId}`).then(setBusMaintenance).catch(() => {});
    api.get(`/accounts/summary?bus_id=${busId}`).then(setBusSummary).catch(() => {});
  }
  useEffect(() => { loadBusDetail(selectedBus); }, [selectedBus]); // eslint-disable-line

  function selectBus(busId) {
    setSelectedBus(busId);
    setEntryForm(entryEmpty);
    setClosingGroupIds([]);
    setPairA(""); setPairB("");
    setError("");
  }

  const isIncome = entryForm.type === "income";
  const isTicketSales = isIncome && entryForm.category === "ticket_sales";
  const isAdditionalSale = isIncome && entryForm.category === "additional_sale";
  const grossAmount = isTicketSales && entryForm.passengers_count && entryForm.price_per_seat
    ? Number(entryForm.passengers_count) * Number(entryForm.price_per_seat) : 0;
  const deductionAmount = isTicketSales && entryForm.deducted_passengers && entryForm.price_per_seat
    ? Number(entryForm.deducted_passengers) * Number(entryForm.price_per_seat) : 0;
  const netComputed = grossAmount - deductionAmount;

  // Switching income/expense resets the category to a valid one for that side.
  function handleTypeChange(type) {
    setEntryForm((f) => ({
      ...f,
      type,
      category: type === "income" ? "ticket_sales" : "fuel",
    }));
  }

  // A leg's own price_per_seat (if set by Control Counter) prefills the
  // form, and so does its LOGGED passenger count / fuel cost from the
  // Passenger Checker / Pump Manager checkpoint entries — that's the
  // source of truth. Accounts/Admin/Super Admin can still adjust the
  // number before saving; everyone else who reaches this page sees it as
  // given by the checker/pump manager.
  function handleTripPick(tripId) {
    const trip = busTrips.find((tr) => String(tr.id) === String(tripId));
    setEntryForm((f) => ({
      ...f,
      trip_id: tripId, apply_to_both: false,
      price_per_seat: trip?.price_per_seat || f.price_per_seat,
      passengers_count: isTicketSales && trip?.logged_passengers ? String(trip.logged_passengers) : f.passengers_count,
      amount: f.type === "expense" && f.category === "fuel" && trip?.logged_fuel_cost ? String(trip.logged_fuel_cost) : f.amount,
    }));
  }
  function handleBothPick(groupId) {
    const legs = busTrips.filter((trip) => String(trip.group_id) === String(groupId));
    const amounts = Object.fromEntries(legs.map((leg) => [leg.id, Number(leg.logged_fuel_cost || 0)]));
    const total = Object.values(amounts).reduce((sum, value) => sum + value, 0);
    setEntryForm((f) => ({ ...f, trip_id: groupId, apply_to_both: true, both_leg_amounts: f.type === "expense" && f.category === "fuel" && total ? amounts : null, amount: f.type === "expense" && f.category === "fuel" && total ? String(total) : f.amount }));
  }
  async function handleAttachment(file) {
    if (!file) return;
    const data = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(file); });
    setEntryForm((f) => ({ ...f, attachment_name: file.name, attachment_data: data }));
  }

  async function handleAddEntry(e) {
    e.preventDefault();
    setError("");
    if (!entryForm.txn_date) { setError("Date is required"); return; }
    if (isTicketSales) {
      if (!entryForm.passengers_count || !entryForm.price_per_seat) { setError("Passengers and price per seat are required"); return; }
    } else if (isAdditionalSale) {
      if (!entryForm.amount) { setError("Amount is required"); return; }
      if (!entryForm.description.trim()) { setError("Additional sale needs a description"); return; }
    } else if (!entryForm.amount) {
      setError("Amount is required");
      return;
    }
    try {
      await api.post("/accounts", {
        ...entryForm,
        bus_id: selectedBus,
        trip_id: entryForm.trip_id || null,
        amount: entryForm.amount !== "" ? Number(entryForm.amount) : undefined,
        passengers_count: isTicketSales ? Number(entryForm.passengers_count) : null,
        price_per_seat: isTicketSales ? Number(entryForm.price_per_seat) : null,
        deduction_type: entryForm.deduction_type || null,
        deducted_passengers: entryForm.deducted_passengers ? Number(entryForm.deducted_passengers) : null,
      });
      setEntryForm(entryEmpty);
      loadBusDetail(selectedBus);
      loadOverview();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(id) {
    await api.del(`/accounts/${id}`);
    loadBusDetail(selectedBus);
    loadOverview();
  }

  function startEdit(tx) {
    setEditingId(tx.id);
    setEditAmount(tx.amount);
    setEditNote("");
  }

  async function saveEdit(tx) {
    setError("");
    try {
      await api.put(`/accounts/${tx.id}`, { amount: Number(editAmount), edit_note: editNote || undefined });
      setEditingId(null);
      loadBusDetail(selectedBus);
      loadOverview();
    } catch (err) {
      setError(err.message);
    }
  }

  function toggleClosingGroup(groupId) {
    setClosingGroupIds((prev) => prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  }

  async function handleMarkDone() {
    if (closingGroupIds.length === 0) { setError("Select at least one rotation to close"); return; }
    try {
      // Closing any one leg's id closes the whole rotation server-side —
      // send the group's own id (its leg-1 trip id) for each selected group.
      await api.post("/trips/close-accounts", { trip_ids: closingGroupIds });
      setClosingGroupIds([]);
      loadBusDetail(selectedBus);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleReopen(tripId) {
    await api.post(`/trips/${tripId}/reopen-accounts`);
    loadBusDetail(selectedBus);
  }

  async function handleRemoveRotation(group) {
    const rotationId = group.legs.find((leg) => leg.rotation_id)?.rotation_id;
    if (!rotationId) { setError("This rotation cannot be found. Refresh and try again."); return; }
    if (!confirm(`Remove Rotation #${group.rotation_no}? It will be moved to Trash with its account records.`)) return;
    try {
      await api.del(`/rotations/${rotationId}`);
      loadBusDetail(selectedBus); loadOverview();
    } catch (err) { setError(err.message); }
  }

  async function handleFixPairing() {
    setError("");
    if (!pairA || !pairB || pairA === pairB) { setError("Pick two different legs to pair"); return; }
    try {
      await api.put(`/trips/${pairA}/pair`, { paired_trip_id: pairB });
      setPairA(""); setPairB("");
      loadBusDetail(selectedBus);
    } catch (err) {
      setError(err.message);
    }
  }

  async function togglePostExpense(ticket) {
    if (ticket.linked_transaction_id) {
      await api.del(`/maintenance/${ticket.id}/post-expense`);
    } else {
      try {
        await api.post(`/maintenance/${ticket.id}/post-expense`);
      } catch (err) {
        setError(err.message);
      }
    }
    loadBusDetail(selectedBus);
    loadOverview();
  }

  const busName = (id, fallbackBus) => displayBusNumber(
    buses.find((bus) => bus.id === Number(id))
      || busSummaries.find((bus) => Number(bus.bus_id) === Number(id))
      || fallbackBus,
  );
  const searchableBusSummaries = useMemo(() => {
    const busesById = new Map(buses.map((bus) => [Number(bus.id), bus]));
    const needle = busSearch.trim().toLocaleLowerCase();

    return busSummaries
      .map((summary) => {
        const bus = busesById.get(Number(summary.bus_id));
        const number = displayBusNumber(bus || summary);
        return { ...summary, busNumber: number };
      })
      .filter((summary) => !needle || summary.busNumber.toLocaleLowerCase().includes(needle))
      .sort((a, b) => a.busNumber.localeCompare(b.busNumber, undefined, { numeric: true, sensitivity: "base" }));
  }, [buses, busSearch, busSummaries]);
  const busPageCount = Math.max(1, Math.ceil(searchableBusSummaries.length / BUS_PAGE_SIZE));
  const currentBusPage = Math.min(busPage, busPageCount);
  const visibleBusSummaries = searchableBusSummaries.slice(
    (currentBusPage - 1) * BUS_PAGE_SIZE,
    currentBusPage * BUS_PAGE_SIZE,
  );
  const firstVisibleBus = searchableBusSummaries.length ? (currentBusPage - 1) * BUS_PAGE_SIZE + 1 : 0;
  const lastVisibleBus = Math.min(currentBusPage * BUS_PAGE_SIZE, searchableBusSummaries.length);
  const placePeriodLabel = placePeriod.mode === "day"
    ? readableDate(placePeriod.day)
    : placePeriod.from === placePeriod.to
      ? readableDate(placePeriod.from)
      : `${readableDate(placePeriod.from)} – ${readableDate(placePeriod.to)}`;

  // Group this bus's legs into rotations (by group_id) for display, since
  // a rotation = two legs sharing one Done/close state and one expense.
  const rotationGroups = Object.values(
    busTrips.reduce((acc, tr) => {
      acc[tr.group_id] = acc[tr.group_id] || { group_id: tr.group_id, rotation_no: tr.rotation_no, trip_date: tr.trip_date, legs: [] };
      acc[tr.group_id].legs.push(tr);
      return acc;
    }, {})
  ).sort((a, b) => (a.trip_date < b.trip_date ? 1 : a.trip_date > b.trip_date ? -1 : b.rotation_no - a.rotation_no));

  const openGroups = rotationGroups.filter((g) => g.legs.every((l) => l.accounts_status === "open"));
  const doneGroups = rotationGroups.filter((g) => g.legs.some((l) => l.accounts_status === "done"));
  const openLegsForEntry = busTrips.filter((tr) => tr.accounts_status === "open");
  // Legs available to fix-pair: same-day legs on this bus not yet paired with a leg 2.
  const unpairedLegs = busTrips.filter((tr) => tr.leg_no === 1 && !busTrips.some((other) => other.group_id === tr.group_id && other.leg_no === 2));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{t("accounts_title")}</h1>
          <p>{t("accounts_subtitle")}</p>
        </div>
      </div>

      {canViewBus && <div className="card accounts-bus-browser" style={{ marginBottom: 20 }}>
        <div className="accounts-bus-toolbar">
          <div className="accounts-bus-heading">
            <span className="settings-eyebrow">BUS-WISE ACCOUNTS</span>
            <h2 id="accounts-bus-list-heading">Find a bus account</h2>
            <p>Search by Bus Number. Only 10 buses are shown on each page.</p>
          </div>
          <div className="accounts-bus-search">
            <label htmlFor="accounts-bus-number-search">Search bus number</label>
            <div>
              <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>
              <input
                id="accounts-bus-number-search"
                type="search"
                placeholder="Type a bus number"
                value={busSearch}
                onChange={(event) => { setBusSearch(event.target.value); setBusPage(1); }}
              />
              {busSearch && <button type="button" onClick={() => { setBusSearch(""); setBusPage(1); }} aria-label="Clear bus number search">Clear</button>}
            </div>
          </div>
        </div>
        <div className="accounts-bus-list-box" role="region" aria-labelledby="accounts-bus-list-heading">
          <div className="accounts-bus-table-scroll">
            <table className="accounts-bus-table">
              <thead><tr><th>Bus number</th><th>{t("income")}</th><th>{t("expense")}</th><th>{t("net")}</th><th></th></tr></thead>
              <tbody>
                {visibleBusSummaries.map((b) => (
                  <tr key={b.bus_id} className={String(selectedBus) === String(b.bus_id) ? "selected" : ""}>
                    <td><strong>{b.busNumber}</strong></td>
                    <td>৳{b.income.toLocaleString()}</td>
                    <td>৳{b.expense.toLocaleString()}</td>
                    <td style={{ color: b.net >= 0 ? "var(--green)" : "var(--red)" }}>৳{b.net.toLocaleString()}</td>
                    <td><button type="button" className="primary" onClick={() => selectBus(b.bus_id)}>{String(selectedBus) === String(b.bus_id) ? "Opened" : "Open"}</button></td>
                  </tr>
                ))}
                {!visibleBusSummaries.length && <tr><td colSpan={5}>{busSummaries.length ? `No bus number matches “${busSearch.trim()}”.` : t("no_buses_yet")}</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="accounts-bus-pagination">
            <span>Showing {firstVisibleBus}–{lastVisibleBus} of {searchableBusSummaries.length} buses</span>
            <div>
              <button type="button" className="secondary" disabled={currentBusPage === 1} onClick={() => setBusPage((page) => Math.max(1, page - 1))}>Previous</button>
              <strong>Page {currentBusPage} of {busPageCount}</strong>
              <button type="button" className="secondary" disabled={currentBusPage === busPageCount} onClick={() => setBusPage((page) => Math.min(busPageCount, page + 1))}>Next</button>
            </div>
          </div>
        </div>
      </div>}

      {canViewPlace && <div className="card" style={{ marginBottom: 20 }}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <div><h3 style={{ margin: 0 }}>Place-wise Accounts</h3><p style={{ margin: "4px 0 0", color: "var(--muted)", fontSize: "0.85rem" }}>A separate sector for each Place and its optional counters. Every entry is assigned to one Place only; income and expenses are included in the company Report totals.</p></div>
        </div>
        <div className="place-period-toolbar">
          <div className="place-period-intro"><span className="settings-eyebrow">SUMMARY PERIOD</span><strong>Choose which dates appear below</strong><small>The totals and counter details use only this period.</small></div>
          <div className="place-period-controls">
            <div className="place-period-tabs" role="group" aria-label="Place accounts period type">
              <button type="button" className={placePeriod.mode === "day" ? "active" : ""} onClick={() => setPlacePeriod((period) => ({ ...period, mode: "day" }))}>Selected day</button>
              <button type="button" className={placePeriod.mode === "range" ? "active" : ""} onClick={() => setPlacePeriod((period) => ({ ...period, mode: "range" }))}>Date range</button>
            </div>
            {placePeriod.mode === "day" ? <label className="place-period-date"><span>Date</span><input type="date" value={placePeriod.day} onInput={(e) => { const day = e.currentTarget.value; setPlacePeriod((period) => ({ ...period, day })); }} /></label> : <div className="place-period-range">
              <label className="place-period-date"><span>From</span><input type="date" value={placePeriod.from} onInput={(e) => { const from = e.currentTarget.value; setPlacePeriod((period) => ({ ...period, from, to: period.to && period.to >= from ? period.to : from })); }} /></label>
              <label className="place-period-date"><span>To</span><input type="date" min={placePeriod.from} value={placePeriod.to} onInput={(e) => { const to = e.currentTarget.value; setPlacePeriod((period) => ({ ...period, to })); }} /></label>
            </div>}
          </div>
          <div className="place-period-current"><small>Showing totals for</small><strong>{placePeriodLabel}</strong></div>
        </div>
        {!canWritePlace && <p className="permission-readonly-note">View-only access: you can review Place-wise Accounts, but cannot add or change entries.</p>}
        {canWritePlace && <form className="form-row" onSubmit={addPlaceExpense}>
          <select value={placeForm.type} onChange={(e) => setPlaceForm({ ...placeForm, type: e.target.value, finance_type: "" })}><option value="expense">Expense</option><option value="income">Income</option></select>
          <select value={placeForm.place_name} onChange={(e) => setPlaceForm({ ...placeForm, place_name: e.target.value, counter_id: "" })}><option value="">Select one place</option>{expensePlaces.map((place) => <option key={place.id} value={place.name}>{place.name}</option>)}</select>
          <select value={placeForm.counter_id} onChange={(e) => setPlaceForm({ ...placeForm, counter_id: e.target.value })}><option value="">No counter / whole place</option>{placeCounters.filter((counter) => counter.place_name === placeForm.place_name).map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select>
          <select value={placeForm.finance_type} onChange={(e) => setPlaceForm({ ...placeForm, finance_type: e.target.value })}><option value="">Select {placeForm.type} type</option>{placeForm.type === "income" ? <><option value="Commission">Commission</option><option value="Other income">Other income</option></> : expenseTypes.map((type) => <option key={type.id} value={type.name}>{type.name}</option>)}</select>
          <input type="number" placeholder="Amount" value={placeForm.amount} onChange={(e) => setPlaceForm({ ...placeForm, amount: e.target.value })} />
          <input type="date" value={placeForm.txn_date} onInput={(e) => { const txnDate = e.currentTarget.value; setPlaceForm({ ...placeForm, txn_date: txnDate }); if (placePeriod.mode === "day") setPlacePeriod((period) => ({ ...period, day: txnDate })); }} />
          <input placeholder="Note (optional)" value={placeForm.note} onChange={(e) => setPlaceForm({ ...placeForm, note: e.target.value })} />
          {placeForm.type === "expense" && placeForm.finance_type === "Counter Staff Salary" && <button className="primary" type="button" onClick={postCounterSalary} disabled={!placeForm.counter_id || !placeForm.txn_date || postingCounterSalary}>{postingCounterSalary ? "Posting salary…" : "Post staff salary for this counter"}</button>}
          <button className="primary" type="submit">Add place {placeForm.type}</button>
        </form>}
        {placeMessage && <p className={placeMessage.startsWith("Saved") || placeMessage.startsWith("Posted") ? "success-text" : "error-text"}>{placeMessage}</p>}
          <div className="grid grid-2" style={{ marginTop: 14 }}>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "8px 0" }}>Manage parent places and assign counters from <strong>Settings → Place and counter setup</strong>.</p>
            {canWritePlace && <form className="form-row" onSubmit={addExpenseType}><input placeholder="New expense type" value={newExpenseType} onChange={(e) => setNewExpenseType(e.target.value)} /><button className="link-danger" type="submit">Add expense type</button></form>}
          </div>
        <div className="place-results-heading"><div><strong>Place totals</strong><span>{placePeriodLabel}</span></div><small>{placeTransactionsLoading ? "Updating…" : `${placeTransactions.length} transaction${placeTransactions.length === 1 ? "" : "s"}`}</small></div>
        {placePeriodError && <p className="error-text">{placePeriodError}</p>}
        <table><thead><tr><th>Place</th><th>{t("income")}</th><th>{t("expense")}</th><th>{t("net")}</th><th></th></tr></thead><tbody>
          {expensePlaces.map((place) => { const rows = placeTransactions.filter((tx) => tx.place_name === place.name); const income = rows.filter((tx) => tx.type === "income").reduce((sum, tx) => sum + tx.amount, 0); const expense = rows.filter((tx) => tx.type === "expense").reduce((sum, tx) => sum + tx.amount, 0); const counters = placeCounters.filter((counter) => counter.place_name === place.name); const detailRows = selectedCounterDetail ? rows.filter((row) => String(row.counter_id) === String(selectedCounterDetail)) : rows; return <Fragment key={place.id}><tr><td>{place.name}</td><td>৳{income.toLocaleString()}</td><td>৳{expense.toLocaleString()}</td><td style={{ color: income - expense >= 0 ? "var(--green)" : "var(--red)" }}>৳{(income - expense).toLocaleString()}</td><td><button className="link-danger" onClick={() => { setOpenPlace(openPlace === place.name ? "" : place.name); setSelectedCounterDetail(""); }}>Counter-wise details</button></td></tr>{openPlace === place.name && <tr><td colSpan={5}><div style={{ padding: 8 }}><label style={{ fontSize: "0.82rem", fontWeight: 700 }}>Counter details <select value={selectedCounterDetail} onChange={(e) => setSelectedCounterDetail(e.target.value)} style={{ marginLeft: 8 }}><option value="">All counters and whole-place entries</option>{counters.map((counter) => <option key={counter.id} value={counter.id}>{counter.name}</option>)}</select></label><RotationDetails rows={detailRows} /></div></td></tr>}</Fragment>; })}
          {expensePlaces.length === 0 && <tr><td colSpan={5}>Add a place to begin recording separate place-wise expenses.</td></tr>}
        </tbody></table>
      </div>}

      {canViewBus && selectedBus && (
        <>
          <div className="grid grid-3" style={{ marginBottom: 20 }}>
            <div className="card stat-card income"><div className="stat-label">{busName(selectedBus)} — {t("income")}</div><div className="stat-value">৳{busSummary.income.toLocaleString()}</div></div>
            <div className="card stat-card expense"><div className="stat-label">{t("expense")}</div><div className="stat-value">৳{busSummary.expense.toLocaleString()}</div></div>
            <div className="card stat-card"><div className="stat-label">{t("net")}</div><div className="stat-value">৳{busSummary.net.toLocaleString()}</div></div>
          </div>

          {canWriteBus ? <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t("record_entry")}</h3>
            <form className="form-row" onSubmit={handleAddEntry}>
              <select value={entryForm.type} onChange={(e) => handleTypeChange(e.target.value)}>
                <option value="income">{t("income")}</option>
                <option value="expense">{t("expense")}</option>
              </select>

              {isIncome ? (
                // Income is only ever Ticket Sales or Additional Sale.
                <select value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}>
                  {INCOME_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{t(c.labelKey)}</option>)}
                </select>
              ) : (
                // Every non-ticket-sales category is an expense.
                <select value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}>
                  {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              )}

              <select value={entryForm.apply_to_both ? `both:${entryForm.trip_id}` : entryForm.trip_id} onChange={(e) => e.target.value.startsWith("both:") ? handleBothPick(e.target.value.slice(5)) : handleTripPick(e.target.value)}>
                <option value="">{t("no_specific_rotation")}</option>
                {/* Expense entries (like fuel) can apply to a single leg, OR to
                    both legs of a rotation at once — since a rotation's expense
                    is already shared between its legs either way, picking the
                    "both legs" option (the rotation's own group id) makes that
                    explicit rather than picking one leg somewhat arbitrarily. */}
                {!isIncome && rotationGroups.filter((g) => g.legs.length === 2 && g.legs.every((l) => l.accounts_status === "open")).map((g) => (
                  <option key={`both-${g.group_id}`} value={`both:${g.group_id}`}>
                    {busName(g.legs[0].bus_id || selectedBus, g.legs[0])} — Rotation #{g.rotation_no} — Both outbound and return leg
                  </option>
                ))}
                {openLegsForEntry.map((tr) => (
                  <option key={tr.id} value={tr.id}>
                    {busName(tr.bus_id || selectedBus, tr)} — Rotation #{tr.rotation_no} {tr.leg_no === 2 ? `(${t("leg2")})` : `(${t("leg1")})`}
                  </option>
                ))}
              </select>

              {isTicketSales ? (
                <>
                  <input placeholder={t("passengers")} type="number" value={entryForm.passengers_count}
                    onChange={(e) => setEntryForm({ ...entryForm, passengers_count: e.target.value })} />
                  <input placeholder={t("price_per_seat")} type="number" value={entryForm.price_per_seat}
                    onChange={(e) => setEntryForm({ ...entryForm, price_per_seat: e.target.value })} />
                  <select value={entryForm.deduction_type} onChange={(e) => setEntryForm({ ...entryForm, deduction_type: e.target.value })}>
                    <option value="">{t("no_deduction")}</option>
                    {discountTypes.map((d) => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                  {entryForm.deduction_type && (
                    <input placeholder={t("deducted_passengers")} type="number" value={entryForm.deducted_passengers}
                      onChange={(e) => setEntryForm({ ...entryForm, deducted_passengers: e.target.value })} />
                  )}
                  <span style={{ alignSelf: "center", fontSize: "0.85rem", color: "var(--muted)" }}>
                    = ৳{netComputed.toLocaleString()}{deductionAmount ? ` (−৳${deductionAmount.toLocaleString()} for ${entryForm.deducted_passengers} pax)` : ""}
                  </span>
                  <input type="number" placeholder="Editable total amount" value={entryForm.amount} onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
                </>
              ) : (
                <>
                  <input placeholder={t("amount")} type="number" value={entryForm.amount}
                    onChange={(e) => setEntryForm({ ...entryForm, amount: e.target.value })} />
                  {entryForm.category === "fuel" && (
                    <span style={{ alignSelf: "center", fontSize: "0.8rem", color: "var(--muted)" }}>
                      Prefilled from the Pump Manager's fuel log for this leg if available — add another fuel entry below if the bus fueled up more than once this rotation.
                    </span>
                  )}
                </>
              )}

              <input type="date" value={entryForm.txn_date}
                onChange={(e) => setEntryForm({ ...entryForm, txn_date: e.target.value })} />
              <input placeholder={isAdditionalSale ? "Description (required)" : t("description")} value={entryForm.description}
                onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} />
              {entryForm.category.startsWith("counter_") && <input placeholder="Counter/place name" required value={entryForm.place_name} onChange={(e) => setEntryForm({ ...entryForm, place_name: e.target.value })} />}
              <input type="file" accept="image/*,.pdf" onChange={(e) => handleAttachment(e.target.files?.[0])} />
              <button className="primary" type="submit">{t("add_entry")}</button>
            </form>
            {error && <p className="error-text">{error}</p>}
          </div> : <p className="permission-readonly-note">View-only access: you can review this bus account, but cannot add, edit, close, reopen, or remove records.</p>}

          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ marginTop: 0 }}>{t("rotations_heading")}</h3>
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>{t("rotation_select_hint")}</p>
            <table>
              <thead><tr><th></th><th>{t("rotation")}</th><th>{t("date")}</th><th>Legs</th><th>{t("status")}</th><th></th></tr></thead>
              <tbody>
                {openGroups.map((g) => (
                  <>
                  <tr key={g.group_id}>
                    <td>{canWriteBus && <input type="checkbox" checked={closingGroupIds.includes(g.group_id)} onChange={() => toggleClosingGroup(g.group_id)} />}</td>
                    <td>{busName(g.legs[0].bus_id || selectedBus, g.legs[0])} — #{g.rotation_no}</td>
                    <td>{g.trip_date}</td>
                    <td>{g.legs.length === 2 ? `${t("leg1")} + ${t("leg2")}` : t("leg1")}</td>
                    <td><span className="badge active">{t("open")}</span></td>
                    <td><button className="link-danger" onClick={() => setOpenGroupId(openGroupId === g.group_id ? null : g.group_id)}>Details</button>{canRemoveRotations && <> <button className="link-danger" onClick={() => handleRemoveRotation(g)}>Remove rotation</button></>}</td>
                  </tr>
                  {openGroupId === g.group_id && <tr><td colSpan={6}><RotationDetails rows={busTransactions.filter((tx) => g.legs.some((leg) => String(leg.id) === String(tx.trip_id)))} /></td></tr>}
                  </>
                ))}
                {doneGroups.map((g) => (
                  <>
                  <tr key={g.group_id}>
                    <td></td>
                    <td>{busName(g.legs[0].bus_id || selectedBus, g.legs[0])} — #{g.rotation_no}</td>
                    <td>{g.trip_date}</td>
                    <td>{g.legs.length === 2 ? `${t("leg1")} + ${t("leg2")}` : t("leg1")}</td>
                    <td><span className="badge maintenance">{t("done")}</span></td>
                    <td><button className="link-danger" onClick={() => setOpenGroupId(openGroupId === g.group_id ? null : g.group_id)}>Details</button>{canWriteBus && <> <button className="link-danger" onClick={() => handleReopen(g.group_id)}>{t("reopen_admin")}</button></>}{canRemoveRotations && <> <button className="link-danger" onClick={() => handleRemoveRotation(g)}>Remove rotation</button></>}</td>
                  </tr>
                  {openGroupId === g.group_id && <tr><td colSpan={6}><RotationDetails rows={busTransactions.filter((tx) => g.legs.some((leg) => String(leg.id) === String(tx.trip_id)))} /></td></tr>}
                  </>
                ))}
                {rotationGroups.length === 0 && <tr><td colSpan={6}>{t("no_rotations_bus")}</td></tr>}
              </tbody>
            </table>
            {canWriteBus && <button className="primary" style={{ marginTop: 10 }} onClick={handleMarkDone} disabled={closingGroupIds.length === 0}>{t("mark_done")}</button>}

            {canFixPairing && unpairedLegs.length > 1 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <strong style={{ fontSize: "0.9rem" }}>{t("fix_pairing")}</strong>
                <p style={{ color: "var(--muted)", fontSize: "0.8rem", margin: "4px 0 8px" }}>
                  If a bus took an unexpected route back, pick its two legs here to merge them into one rotation.
                </p>
                <div className="form-row">
                  <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
                    <option value="">Leg A</option>
                    {unpairedLegs.map((l) => <option key={l.id} value={l.id}>#{l.rotation_no} — {l.route || "no route"} ({l.trip_date})</option>)}
                  </select>
                  <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
                    <option value="">{t("pair_with")}</option>
                    {unpairedLegs.filter((l) => String(l.id) !== String(pairA)).map((l) => <option key={l.id} value={l.id}>#{l.rotation_no} — {l.route || "no route"} ({l.trip_date})</option>)}
                  </select>
                  <button className="primary" onClick={handleFixPairing}>{t("fix_pairing")}</button>
                </div>
              </div>
            )}
          </div>

          {busMaintenance.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ marginTop: 0 }}>{t("maintenance_for_bus")}</h3>
              <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: 0 }}>{t("choose_expense_hint")}</p>
              <table>
                <thead><tr><th>{t("issue")}</th><th>{t("total_cost_so_far")}</th><th>{t("status")}</th><th></th></tr></thead>
                <tbody>
                  {busMaintenance.map((m) => (
                    <tr key={m.id}>
                      <td>{m.issue}</td>
                      <td>৳{m.total_cost.toLocaleString()}</td>
                      <td><span className={`badge ${m.status}`}>{m.status}</span></td>
                      <td>
                        {canWriteBus &&
                        <button className={m.linked_transaction_id ? "link-danger" : "primary"} onClick={() => togglePostExpense(m)} disabled={m.total_cost <= 0}>
                          {m.linked_transaction_id ? t("remove_from_expenses") : t("post_as_expense")}
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t("transactions")}</h3>
            <table>
              <thead><tr><th>{t("date")}</th><th>Type</th><th>{t("category")}</th><th>{t("amount")}</th><th>{t("description")}</th><th></th></tr></thead>
              <tbody>
                {busTransactions.filter((tx) => !tx.trip_id || busTrips.find((trip) => String(trip.id) === String(tx.trip_id))?.accounts_status === "open").map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.txn_date}</td>
                    <td><span className={`badge ${tx.type === "income" ? "active" : "maintenance"}`}>{tx.type}</span></td>
                    <td>{tx.category}{tx.passengers_count ? ` (${tx.passengers_count} pax × ৳${tx.price_per_seat}${tx.deduction_amount ? ` − ৳${tx.deduction_amount} (${tx.deducted_passengers} pax ${tx.deduction_type || ""})` : ""})` : ""}</td>
                    <td>
                      {canWriteBus && editingId === tx.id ? (
                        <input type="number" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} style={{ width: 90 }} />
                      ) : `৳${tx.amount.toLocaleString()}`}
                    </td>
                    <td>{tx.description}{tx.edit_note ? <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Edit note: {tx.edit_note}</div> : null}</td>
                    <td>
                      {canWriteBus && (editingId === tx.id ? (
                        <>
                          {isAccountsRole && <input placeholder={t("reason_for_change")} value={editNote} onChange={(e) => setEditNote(e.target.value)} style={{ width: 140, marginRight: 6 }} />}
                          <button className="primary" style={{ marginRight: 6 }} onClick={() => saveEdit(tx)}>{t("save")}</button>
                          <button className="link-danger" onClick={() => setEditingId(null)}>{t("cancel")}</button>
                        </>
                      ) : (
                        <>
                          <button className="link-danger" style={{ marginRight: 10 }} onClick={() => startEdit(tx)}>{t("edit")}</button>
                          <button className="link-danger" onClick={() => handleDelete(tx.id)}>{t("remove")}</button>
                        </>
                      ))}
                    </td>
                  </tr>
                ))}
                {busTransactions.length === 0 && <tr><td colSpan={6}>{t("no_transactions_bus")}</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

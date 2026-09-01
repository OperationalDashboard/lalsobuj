import { useEffect, useState } from "react";

// A light native search picker. It works on desktop and mobile without an
// extra dependency, and keeps the saved value separate from its display name.
export default function SearchableSelect({ id, value, onChange, options, placeholder = "Search and select…", disabled = false, required = false, className = "" }) {
  const selected = options.find((option) => String(option.value) === String(value));
  const listId = `${id}-options`;
  const [query, setQuery] = useState(selected?.label || "");

  useEffect(() => { setQuery(selected?.label || ""); }, [selected?.label]);

  function choose(nextLabel, clearIfMissing = false) {
    const needle = String(nextLabel || "").trim().toLowerCase();
    const match = options.find((option) => String(option.label).toLowerCase() === needle || String(option.value).toLowerCase() === needle);
    if (match) onChange(String(match.value));
    else if (clearIfMissing) onChange("");
  }

  return <span className={`searchable-select ${className}`}>
    <input
      id={id}
      type="search"
      list={listId}
      value={query}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoComplete="off"
      onChange={(event) => { setQuery(event.target.value); choose(event.target.value, !event.target.value); }}
      onBlur={(event) => { choose(event.target.value, true); if (!options.some((option) => String(option.label).toLowerCase() === event.target.value.trim().toLowerCase() || String(option.value).toLowerCase() === event.target.value.trim().toLowerCase())) setQuery(selected?.label || ""); }}
    />
    <datalist id={listId}>
      {options.map((option) => <option key={option.value} value={option.label} />)}
    </datalist>
  </span>;
}

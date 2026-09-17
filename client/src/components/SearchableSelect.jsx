import { useEffect, useRef, useState } from "react";

// A light native search picker. It works on desktop and mobile without an
// extra dependency, and keeps the saved value separate from its display name.
export default function SearchableSelect({ id, value, onChange, options, placeholder = "Search and select…", disabled = false, required = false, className = "" }) {
  const selected = options.find((option) => String(option.value) === String(value));
  const listId = `${id}-options`;
  const [query, setQuery] = useState(selected?.label || "");
  const inputRef = useRef(null);

  useEffect(() => { setQuery(selected?.label || ""); inputRef.current?.setCustomValidity(""); }, [value, selected?.label]);

  function choose(nextLabel, clearIfMissing = false) {
    const needle = String(nextLabel || "").trim().toLowerCase();
    const match = options.find((option) => String(option.label).toLowerCase() === needle || String(option.value).toLowerCase() === needle);
    if (match && String(match.value) !== String(value ?? "")) onChange(String(match.value));
    else if (!match && clearIfMissing && value) onChange("");
  }

  return <span className={`searchable-select ${className}`}>
    <input
      ref={inputRef}
      id={id}
      type="search"
      list={listId}
      value={query}
      placeholder={placeholder}
      disabled={disabled}
      required={required}
      autoComplete="off"
      onChange={(event) => {
        const next = event.target.value;
        setQuery(next);
        const matches = options.some((option) => String(option.label).toLowerCase() === next.trim().toLowerCase() || String(option.value).toLowerCase() === next.trim().toLowerCase());
        event.target.setCustomValidity(next && !matches ? "Choose a matching option from the list." : "");
        choose(next, !next);
      }}
      onBlur={(event) => {
        const match = options.find((option) => String(option.label).toLowerCase() === event.target.value.trim().toLowerCase() || String(option.value).toLowerCase() === event.target.value.trim().toLowerCase());
        const nextValue = match ? String(match.value) : "";
        if (nextValue !== String(value ?? "")) onChange(nextValue);
        setQuery(match?.label || "");
        event.target.setCustomValidity("");
      }}
    />
    <datalist id={listId}>
      {options.map((option) => <option key={option.value} value={option.label} />)}
    </datalist>
  </span>;
}

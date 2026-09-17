export default function Pagination({ page, pageCount, onPageChange, label = "records" }) {
  const count = Math.max(1, pageCount);
  const current = Math.max(1, Math.min(page, count));
  const pages = [...new Set([1, current - 1, current, current + 1, count])].filter((p) => p > 0 && p <= count).sort((a, b) => a - b);
  return <nav className="record-pagination" aria-label={`${label} pages`}>
    <button type="button" className="page-direction" disabled={current === 1} onClick={() => onPageChange(current - 1)} aria-label={`Previous page of ${label}`}><span aria-hidden="true">←</span> Previous</button>
    <div className="page-numbers">{pages.map((p, index) => <span key={p}>{index > 0 && p - pages[index - 1] > 1 && <span className="page-gap">…</span>}<button type="button" className={p === current ? "current" : ""} aria-label={`Page ${p}`} aria-current={p === current ? "page" : undefined} onClick={() => onPageChange(p)}>{p}</button></span>)}</div>
    <span className="page-position" aria-live="polite">{current} / {count}</span>
    <button type="button" className="page-direction" disabled={current === count} onClick={() => onPageChange(current + 1)} aria-label={`Next page of ${label}`}>Next <span aria-hidden="true">→</span></button>
  </nav>;
}

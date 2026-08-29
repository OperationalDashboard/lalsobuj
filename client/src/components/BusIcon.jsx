// A small inline bus illustration — used in the sidebar brand, the Buses
// page, and the login screen so the app doesn't feel like a bare list of
// forms. No external image assets needed, so it always renders instantly.
export default function BusIcon({ size = 28, muted = false, style }) {
  const body = muted ? "#9aa5a1" : "#2f6b3f";
  const window = muted ? "#e4e7e6" : "#dff3e6";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <rect x="2" y="6" width="60" height="30" rx="6" fill={body} />
      <rect x="6" y="10" width="14" height="12" rx="2" fill={window} />
      <rect x="24" y="10" width="14" height="12" rx="2" fill={window} />
      <rect x="42" y="10" width="16" height="12" rx="2" fill={window} />
      <rect x="6" y="25" width="52" height="5" rx="1.5" fill={muted ? "#c3c9c6" : "#e6b800"} />
      <circle cx="16" cy="40" r="6" fill="#26302b" />
      <circle cx="16" cy="40" r="2.4" fill="#c7ccca" />
      <circle cx="48" cy="40" r="6" fill="#26302b" />
      <circle cx="48" cy="40" r="2.4" fill="#c7ccca" />
    </svg>
  );
}

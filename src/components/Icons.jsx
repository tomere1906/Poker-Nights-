export function ChipIcon({ className = 'h-6 w-6', color = '#e11d48' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill={color} />
      <circle cx="12" cy="12" r="11" fill="none" stroke="#fff" strokeWidth="2.4" strokeDasharray="3.6 5.04" />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" strokeOpacity=".7" strokeWidth="1" />
    </svg>
  );
}

export function CardsIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="3" y="4" width="11" height="15" rx="2" transform="rotate(-12 8.5 11.5)" fill="#f8fafc" />
      <rect x="9" y="5" width="11" height="15" rx="2" transform="rotate(10 14.5 12.5)" fill="#fff" stroke="#e2e8f0" />
      <path
        d="M14.6 9.4c-.9 1.4-2.8 2.4-2.8 3.9 0 .9.7 1.5 1.5 1.5.5 0 .9-.2 1.1-.5l-.3 1.5h1.6l-.3-1.5c.2.3.6.5 1.1.5.8 0 1.5-.6 1.5-1.5 0-1.5-1.9-2.5-2.8-3.9z"
        fill="#e11d48"
      />
    </svg>
  );
}

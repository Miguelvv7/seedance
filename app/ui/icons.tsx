type P = { className?: string };
const base = { viewBox: "0 0 20 20", "aria-hidden": true as const, fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

export const IconPlus = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M5 5l10 10M15 5L5 15" />
  </svg>
);
export const IconPhoto = (p: P) => (
  <svg {...base} className={p.className}>
    <rect x="2.5" y="3.5" width="15" height="13" rx="2.5" />
    <circle cx="7" cy="8" r="1.5" />
    <path d="M17.5 13l-4-4-8 7.5" />
  </svg>
);
export const IconPerson = (p: P) => (
  <svg {...base} className={p.className}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 17c.9-3.2 3.3-5 6.2-5s5.3 1.8 6.2 5" />
  </svg>
);
export const IconChevron = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M7 4l6 6-6 6" />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M4.5 10.5l3.5 3.5 7.5-8" />
  </svg>
);
export const IconDownload = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" />
  </svg>
);
export const IconSpark = (p: P) => (
  <svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor" className={p.className}>
    <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6L10 2.5Z" />
    <path d="M15.5 13.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" />
  </svg>
);
export const IconFilm = (p: P) => (
  <svg {...base} className={p.className}>
    <rect x="2.5" y="4" width="15" height="12" rx="2.5" />
    <path d="M8.5 7.5v5l4-2.5-4-2.5Z" fill="currentColor" stroke="none" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base} className={p.className}>
    <path d="M4 6h12M8 6V4h4v2M6 6l.8 10h6.4L14 6" />
  </svg>
);

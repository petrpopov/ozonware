// Feather-like icons. Exports individual components + a generic <Icon name="..." />.

const SVG_PROPS = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

const PATHS = {
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </>
  ),
  moon: <path d="M12 3a7 7 0 1 0 9 9 9 9 0 1 1-9-9z" />,
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="m16.5 3.5 4 4L7 21l-4 1 1-4Z" />
    </>
  ),
  trash: (
    <>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  minus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  download: <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />,
  upload: <path d="M12 21V9M7 14l5-5 5 5M4 3h16" />,
  refresh: (
    <>
      <path d="M3 12a9 9 0 0 1 15.6-6.1L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15.6 6.1L3 16" />
      <path d="M3 21v-5h5" />
    </>
  ),
  filter: <path d="M3 5h18M6 12h12M10 19h4" />,
  sort: (
    <>
      <path d="M8 3v18M4 7l4-4 4 4" />
      <path d="M16 21V3M20 17l-4 4-4-4" />
    </>
  ),
  more: (
    <>
      <circle cx="12" cy="5" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="12" cy="19" r="1" />
    </>
  ),
  box: (
    <>
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.4 5.5A2 2 0 0 1 7.3 4h9.4a2 2 0 0 1 1.9 1.5L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </>
  ),
  outbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.4 5.5A2 2 0 0 1 7.3 4h9.4a2 2 0 0 1 1.9 1.5L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
      <path d="M12 4v8m-3-3 3 3 3-3" />
    </>
  ),
  truck: (
    <>
      <path d="M10 17h4V5H2v12h2" />
      <path d="M14 8h4l4 4v5h-2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 15 4-4 3 3 5-6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  columns: (
    <>
      <rect x="3" y="4" width="7" height="16" rx="1" />
      <rect x="14" y="4" width="7" height="16" rx="1" />
    </>
  ),
  save: (
    <>
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
    </>
  ),
  sparkle: <path d="M12 2v6M12 16v6M2 12h6M16 12h6M5 5l4 4M15 15l4 4M5 19l4-4M15 9l4-4" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  bookmark: <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
};

export function Icon({ name, size = 16, className = 'ic' }) {
  const body = PATHS[name];
  if (!body) return null;
  return (
    <svg width={size} height={size} {...SVG_PROPS} className={className}>
      {body}
    </svg>
  );
}

// Named icons (backward compatible).
export function SunIcon({ size = 18 }) { return <Icon name="sun" size={size} />; }
export function MoonIcon({ size = 18 }) { return <Icon name="moon" size={size} />; }
export function EditIcon({ size = 16 }) { return <Icon name="edit" size={size} />; }
export function TrashIcon({ size = 16 }) { return <Icon name="trash" size={size} />; }

// New icons exported for use in Sidebar/Topbar/pages.
export function BoxIcon({ size = 16 }) { return <Icon name="box" size={size} />; }
export function InboxIcon({ size = 16 }) { return <Icon name="inbox" size={size} />; }
export function OutboxIcon({ size = 16 }) { return <Icon name="outbox" size={size} />; }
export function TruckIcon({ size = 16 }) { return <Icon name="truck" size={size} />; }
export function MinusIcon({ size = 16 }) { return <Icon name="minus" size={size} />; }
export function ClipboardIcon({ size = 16 }) { return <Icon name="clipboard" size={size} />; }
export function ChartIcon({ size = 16 }) { return <Icon name="chart" size={size} />; }
export function GearIcon({ size = 16 }) { return <Icon name="gear" size={size} />; }
export function SearchIcon({ size = 16 }) { return <Icon name="search" size={size} />; }
export function PlusIcon({ size = 16 }) { return <Icon name="plus" size={size} />; }
export function DownloadIcon({ size = 16 }) { return <Icon name="download" size={size} />; }
export function UploadIcon({ size = 16 }) { return <Icon name="upload" size={size} />; }
export function RefreshIcon({ size = 16 }) { return <Icon name="refresh" size={size} />; }
export function BellIcon({ size = 16 }) { return <Icon name="bell" size={size} />; }
export function HelpIcon({ size = 16 }) { return <Icon name="help" size={size} />; }
export function XIcon({ size = 16 }) { return <Icon name="x" size={size} />; }
export function CheckIcon({ size = 16 }) { return <Icon name="check" size={size} />; }

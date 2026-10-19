const { useState, useEffect, useRef } = React;

// ----------------------------------------------------------------------------
// CONFIGURATION
// Replace with the deployed profile and ratings service URL:
// ----------------------------------------------------------------------------
const GOOGLE_SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbwM040Z4TfNMRNqOMJUCMVbn92O8_E2LO4HTrUHGGiC-B06kbp-j1ji9B-0jraR5kOo/exec';
const RATINGS_STORAGE_KEY = 'atc_tower_rankings_gsheet';
const PROFILE_RATINGS_STORAGE_KEY = `${RATINGS_STORAGE_KEY}_by_profile_v2`;
const RATINGS_OUTBOX_KEY = 'atc_tower_rankings_outbox';
const RATINGS_DIRTY_KEY = 'atc_tower_rankings_dirty';
const PROFILE_STORAGE_KEY = 'atc_profile_library_v1';
const CLOUD_ACTION_OUTBOX_KEY = 'atc_cloud_action_outbox_v1';
const DEFAULT_DRAFT_SLOTS = [
  'Adelaide',
  'Brisbane',
  'Cairns',
  'Canberra',
  'Gold Coast',
  'Melbourne',
];

function ensureDraftSlotCount(slots, count) {
  const next = Array.isArray(slots) ? [...slots] : [];
  const seen = new Set(next);
  const fillSource = ALL_TOWERS.filter((tower) => !seen.has(tower));

  while (next.length < count) {
    const fallbackTower =
      fillSource.shift() ||
      DEFAULT_DRAFT_SLOTS[next.length % DEFAULT_DRAFT_SLOTS.length] ||
      'Adelaide';
    next.push(fallbackTower);
    seen.add(fallbackTower);
  }

  return next.slice(0, count);
}

function sortControllersWithDraftSlots(controllers, draftSlots) {
  const paired = (controllers || []).map((controller, index) => ({
    controller,
    draftSlot: draftSlots?.[index],
  }));
  paired.sort((a, b) =>
    a.controller.localeCompare(b.controller, undefined, {
      sensitivity: 'base',
    }),
  );
  return {
    controllers: paired.map(({ controller }) => controller),
    draftSlots: paired.map(({ draftSlot }) => draftSlot).filter(Boolean),
  };
}

function createProfileId() {
  const randomId =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((value) => value.toString(16).padStart(2, '0'))
          .join('');
  return `profile-${randomId}`;
}

const DEFAULT_PROFILE_ID = createProfileId();

// Tower metadata with clean Radar, Regional, Metro D taxonomy and Australian State codes
const TOWER_METADATA = {
  // Radar
  Adelaide: { category: 'Radar', state: 'SA' },
  Brisbane: { category: 'Radar', state: 'QLD' },
  Cairns: { category: 'Radar', state: 'QLD' },
  Canberra: { category: 'Radar', state: 'ACT' },
  Essendon: { category: 'Radar', state: 'VIC' },
  'Gold Coast': { category: 'Radar', state: 'QLD' },
  Melbourne: { category: 'Radar', state: 'VIC' },
  Perth: { category: 'Radar', state: 'WA' },
  Sydney: { category: 'Radar', state: 'NSW' },
  'Western Sydney': { category: 'Radar', state: 'NSW' },

  // Regional
  Albury: { category: 'Regional', state: 'NSW' },
  'Alice Springs': { category: 'Regional', state: 'NT' },
  Avalon: { category: 'Regional', state: 'VIC' },
  Ballina: { category: 'Regional', state: 'NSW' },
  Broome: { category: 'Regional', state: 'WA' },
  'Coffs Harbour': { category: 'Regional', state: 'NSW' },
  'Hamilton Island': { category: 'Regional', state: 'QLD' },
  Hobart: { category: 'Regional', state: 'TAS' },
  Karratha: { category: 'Regional', state: 'WA' },
  Launceston: { category: 'Regional', state: 'TAS' },
  Mackay: { category: 'Regional', state: 'QLD' },
  'Port Hedland': { category: 'Regional', state: 'WA' },
  Rockhampton: { category: 'Regional', state: 'QLD' },
  'Sunshine Coast': { category: 'Regional', state: 'QLD' },
  Tamworth: { category: 'Regional', state: 'NSW' },

  // Metro D
  Archerfield: { category: 'Metro D', state: 'QLD' },
  Bankstown: { category: 'Metro D', state: 'NSW' },
  Camden: { category: 'Metro D', state: 'NSW' },
  Jandakot: { category: 'Metro D', state: 'WA' },
  Moorabbin: { category: 'Metro D', state: 'VIC' },
  Parafield: { category: 'Metro D', state: 'SA' },
};

const ALL_TOWERS = Object.keys(TOWER_METADATA).sort();

const CONTROLLERS = [
  'Alex',
  'Ammon',
  'Greer',
  'Helen',
  'Lleyton',
  'Shannon',
].sort();

const DEFAULT_SCORE = 3; // Unrated towers count as 3 in the draft and stats

function ratingColorClass(value) {
  if (value < 1.5) return 'text-rose-400';
  if (value < 2.5) return 'text-orange-400';
  if (value < 3.5) return 'text-amber-300';
  if (value < 4.5) return 'text-sky-300';
  return 'text-emerald-300';
}

// State Badge styling lookup (Optimised contrast for dark mode)
const STATE_BADGE_CLASSES = {
  VIC: 'bg-indigo-950/80 text-indigo-300 border-indigo-700/60',
  NSW: 'bg-sky-950/80 text-sky-300 border-sky-700/60',
  QLD: 'bg-rose-950/80 text-rose-300 border-rose-700/60',
  WA: 'bg-amber-950/80 text-amber-300 border-amber-700/60',
  SA: 'bg-emerald-950/80 text-emerald-300 border-emerald-700/60',
  TAS: 'bg-teal-950/80 text-teal-300 border-teal-700/60',
  NT: 'bg-orange-950/80 text-orange-300 border-orange-700/60',
  ACT: 'bg-purple-950/80 text-purple-300 border-purple-700/60',
};

// Category Badge styling lookup
const CATEGORY_BADGE_CLASSES = {
  Radar: 'bg-cyan-950/80 text-cyan-300 border-cyan-700/60',
  Regional: 'bg-violet-950/80 text-violet-300 border-violet-700/60',
  'Metro D': 'bg-fuchsia-950/80 text-fuchsia-300 border-fuchsia-700/60',
};

function MetadataBadge({ label, colorStyle, weight, children }) {
  return (
    <span
      className={`text-[11px] whitespace-nowrap px-2.5 py-0.5 rounded-md border ${weight} ${colorStyle}`}
    >
      <span className='sr-only'>{label}: </span>
      {children}
    </span>
  );
}

function StateBadge({ state }) {
  return (
    <MetadataBadge
      label='State'
      colorStyle={
        STATE_BADGE_CLASSES[state] ||
        'bg-slate-900 text-slate-300 border-slate-700'
      }
      weight='font-bold'
    >
      {state}
    </MetadataBadge>
  );
}

function CategoryBadge({ category }) {
  return (
    <MetadataBadge
      label='Category'
      colorStyle={
        CATEGORY_BADGE_CLASSES[category] ||
        'bg-slate-900 text-slate-300 border-slate-700'
      }
      weight='font-semibold'
    >
      {category}
    </MetadataBadge>
  );
}

// Colour themes for the Category and State cards
const COLOR_THEMES = {
  slate: {
    border: 'border-slate-500/25',
    banner: 'bg-gradient-to-br from-slate-500/10 to-slate-950/80',
    pill: 'bg-slate-900 text-slate-100 border-slate-400/60',
    rank: 'bg-slate-500/15 border-slate-500/40 text-slate-300',
    avg: 'text-slate-200',
    bar: 'bg-sky-500',
  },
  yellow: {
    border: 'border-yellow-500/25',
    banner: 'bg-gradient-to-br from-yellow-500/10 to-slate-950/80',
    pill: 'bg-yellow-950 text-yellow-200 border-yellow-400/70',
    rank: 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300',
    avg: 'text-yellow-300',
    bar: 'bg-yellow-500',
  },
  red: {
    border: 'border-red-500/25',
    banner: 'bg-gradient-to-br from-red-500/10 to-slate-950/80',
    pill: 'bg-red-950 text-red-200 border-red-400/70',
    rank: 'bg-red-500/15 border-red-500/40 text-red-300',
    avg: 'text-red-300',
    bar: 'bg-red-500',
  },
  pink: {
    border: 'border-pink-500/25',
    banner: 'bg-gradient-to-br from-pink-500/10 to-slate-950/80',
    pill: 'bg-pink-950 text-pink-200 border-pink-400/70',
    rank: 'bg-pink-500/15 border-pink-500/40 text-pink-300',
    avg: 'text-pink-300',
    bar: 'bg-pink-500',
  },
  cyan: {
    border: 'border-cyan-500/25',
    banner: 'bg-gradient-to-br from-cyan-500/10 to-slate-950/80',
    pill: 'bg-cyan-950 text-cyan-200 border-cyan-400/70 shadow-cyan-900/60',
    rank: 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300',
    avg: 'text-cyan-300',
    bar: 'bg-cyan-500',
  },
  violet: {
    border: 'border-violet-500/25',
    banner: 'bg-gradient-to-br from-violet-500/10 to-slate-950/80',
    pill: 'bg-violet-950 text-violet-200 border-violet-400/70 shadow-violet-900/60',
    rank: 'bg-violet-500/15 border-violet-500/40 text-violet-300',
    avg: 'text-violet-300',
    bar: 'bg-violet-500',
  },
  fuchsia: {
    border: 'border-fuchsia-500/25',
    banner: 'bg-gradient-to-br from-fuchsia-500/10 to-slate-950/80',
    pill: 'bg-fuchsia-950 text-fuchsia-200 border-fuchsia-400/70 shadow-fuchsia-900/60',
    rank: 'bg-fuchsia-500/15 border-fuchsia-500/40 text-fuchsia-300',
    avg: 'text-fuchsia-300',
    bar: 'bg-fuchsia-500',
  },
  indigo: {
    border: 'border-indigo-500/25',
    banner: 'bg-gradient-to-br from-indigo-500/10 to-slate-950/80',
    pill: 'bg-indigo-950 text-indigo-200 border-indigo-400/70 shadow-indigo-900/60',
    rank: 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300',
    avg: 'text-indigo-300',
    bar: 'bg-indigo-500',
  },
  sky: {
    border: 'border-sky-500/25',
    banner: 'bg-gradient-to-br from-sky-500/10 to-slate-950/80',
    pill: 'bg-sky-950 text-sky-200 border-sky-400/70 shadow-sky-900/60',
    rank: 'bg-sky-500/15 border-sky-500/40 text-sky-300',
    avg: 'text-sky-300',
    bar: 'bg-sky-500',
  },
  rose: {
    border: 'border-rose-500/25',
    banner: 'bg-gradient-to-br from-rose-500/10 to-slate-950/80',
    pill: 'bg-rose-950 text-rose-200 border-rose-400/70 shadow-rose-900/60',
    rank: 'bg-rose-500/15 border-rose-500/40 text-rose-300',
    avg: 'text-rose-300',
    bar: 'bg-rose-500',
  },
  amber: {
    border: 'border-amber-500/25',
    banner: 'bg-gradient-to-br from-amber-500/10 to-slate-950/80',
    pill: 'bg-amber-950 text-amber-200 border-amber-400/70 shadow-amber-900/60',
    rank: 'bg-amber-500/15 border-amber-500/40 text-amber-300',
    avg: 'text-amber-300',
    bar: 'bg-amber-500',
  },
  emerald: {
    border: 'border-emerald-500/25',
    banner: 'bg-gradient-to-br from-emerald-500/10 to-slate-950/80',
    pill: 'bg-emerald-950 text-emerald-200 border-emerald-400/70 shadow-emerald-900/60',
    rank: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300',
    avg: 'text-emerald-300',
    bar: 'bg-emerald-500',
  },
  teal: {
    border: 'border-teal-500/25',
    banner: 'bg-gradient-to-br from-teal-500/10 to-slate-950/80',
    pill: 'bg-teal-950 text-teal-200 border-teal-400/70 shadow-teal-900/60',
    rank: 'bg-teal-500/15 border-teal-500/40 text-teal-300',
    avg: 'text-teal-300',
    bar: 'bg-teal-500',
  },
  orange: {
    border: 'border-orange-500/25',
    banner: 'bg-gradient-to-br from-orange-500/10 to-slate-950/80',
    pill: 'bg-orange-950 text-orange-200 border-orange-400/70 shadow-orange-900/60',
    rank: 'bg-orange-500/15 border-orange-500/40 text-orange-300',
    avg: 'text-orange-300',
    bar: 'bg-orange-500',
  },
  purple: {
    border: 'border-purple-500/25',
    banner: 'bg-gradient-to-br from-purple-500/10 to-slate-950/80',
    pill: 'bg-purple-950 text-purple-200 border-purple-400/70 shadow-purple-900/60',
    rank: 'bg-purple-500/15 border-purple-500/40 text-purple-300',
    avg: 'text-purple-300',
    bar: 'bg-purple-500',
  },
};

const CATEGORY_THEME = {
  Radar: 'cyan',
  Regional: 'violet',
  'Metro D': 'fuchsia',
};
const STATE_THEME = {
  VIC: 'indigo',
  NSW: 'sky',
  QLD: 'rose',
  WA: 'amber',
  SA: 'emerald',
  TAS: 'teal',
  NT: 'orange',
  ACT: 'purple',
};

// ----------------------------------------------------------------------------
// DESIGN SYSTEM
// PlainCard is the neutral card used everywhere. Only the Category and State
// stat cards use ThemedCard to retain their category colour accents.
// ----------------------------------------------------------------------------
function ThemedCard({
  theme,
  lead,
  pill,
  aside,
  children,
  className = '',
  bodyClassName = 'p-4',
  flashClass = '',
  ...rest
}) {
  const t = COLOR_THEMES[theme] || COLOR_THEMES.sky;
  return (
    <div
      {...rest}
      className={`app-themed-card relative rounded-2xl flex flex-col shadow-xl overflow-hidden border min-w-0 transition-all duration-200 ${t.border} ${flashClass} ${className}`}
    >
      <div className='app-card-header px-4 py-3.5 flex flex-wrap items-center gap-3'>
        {lead}
        <span className='app-card-title font-bold text-slate-100 text-base min-w-0 break-words'>
          {pill}
        </span>
        {aside && (
          <div className='ml-auto flex items-center gap-2 shrink-0'>
            {aside}
          </div>
        )}
      </div>
      <div className={`app-card-body bg-slate-950/80 flex-1 ${bodyClassName}`}>
        {children}
      </div>
      {flashClass && (
        <span
          aria-hidden='true'
          className={`absolute inset-0 pointer-events-none ${flashClass}`}
        ></span>
      )}
    </div>
  );
}

// Coloured square icon / rank box for the stat-card banners
function LeadBox({ theme, children }) {
  const t = COLOR_THEMES[theme] || COLOR_THEMES.sky;
  return (
    <span
      aria-hidden='true'
      className={`w-9 h-9 rounded-xl border text-base font-extrabold flex items-center justify-center shrink-0 ${t.rank}`}
    >
      {children}
    </span>
  );
}

// More saturated but still readable on the dark page.
const TRIVIA_SOFT = {
  amber: {
    card: 'bg-gradient-to-br from-amber-500/12 via-amber-500/8 to-slate-950/85 border-amber-400/50',
    icon: 'bg-amber-500/15 border-amber-400/70 text-amber-300',
    text: 'text-amber-300',
  },
  cyan: {
    card: 'bg-gradient-to-br from-cyan-500/12 via-cyan-500/8 to-slate-950/85 border-cyan-400/50',
    icon: 'bg-cyan-500/15 border-cyan-400/70 text-cyan-300',
    text: 'text-cyan-300',
  },
  yellow: {
    card: 'bg-gradient-to-br from-yellow-500/12 via-yellow-500/8 to-slate-950/85 border-yellow-400/50',
    icon: 'bg-yellow-500/15 border-yellow-400/70 text-yellow-300',
    text: 'text-yellow-300',
  },
  rose: {
    card: 'bg-gradient-to-br from-rose-500/12 via-rose-500/8 to-slate-950/85 border-rose-400/50',
    icon: 'bg-rose-500/15 border-rose-400/70 text-rose-300',
    text: 'text-rose-300',
  },
  sky: {
    card: 'bg-gradient-to-br from-sky-500/12 via-sky-500/8 to-slate-950/85 border-sky-400/50',
    icon: 'bg-sky-500/15 border-sky-400/70 text-sky-300',
    text: 'text-sky-300',
  },
  orange: {
    card: 'bg-gradient-to-br from-orange-500/12 via-orange-500/8 to-slate-950/85 border-orange-400/50',
    icon: 'bg-orange-500/15 border-orange-400/70 text-orange-300',
    text: 'text-orange-300',
  },
  violet: {
    card: 'bg-gradient-to-br from-violet-500/12 via-violet-500/8 to-slate-950/85 border-violet-400/50',
    icon: 'bg-violet-500/15 border-violet-400/70 text-violet-300',
    text: 'text-violet-300',
  },
  red: {
    card: 'bg-gradient-to-br from-red-500/12 via-red-500/8 to-slate-950/85 border-red-400/50',
    icon: 'bg-red-500/15 border-red-400/70 text-red-300',
    text: 'text-red-300',
  },
  teal: {
    card: 'bg-gradient-to-br from-teal-500/12 via-teal-500/8 to-slate-950/85 border-teal-400/50',
    icon: 'bg-teal-500/15 border-teal-400/70 text-teal-300',
    text: 'text-teal-300',
  },
  purple: {
    card: 'bg-gradient-to-br from-purple-500/12 via-purple-500/8 to-slate-950/85 border-purple-400/50',
    icon: 'bg-purple-500/15 border-purple-400/70 text-purple-300',
    text: 'text-purple-300',
  },
  indigo: {
    card: 'bg-gradient-to-br from-indigo-500/12 via-indigo-500/8 to-slate-950/85 border-indigo-400/50',
    icon: 'bg-indigo-500/15 border-indigo-400/70 text-indigo-300',
    text: 'text-indigo-300',
  },
  pink: {
    card: 'bg-gradient-to-br from-pink-500/12 via-pink-500/8 to-slate-950/85 border-pink-400/50',
    icon: 'bg-pink-500/15 border-pink-400/70 text-pink-300',
    text: 'text-pink-300',
  },
  emerald: {
    card: 'bg-gradient-to-br from-emerald-500/12 via-emerald-500/8 to-slate-950/85 border-emerald-400/50',
    icon: 'bg-emerald-500/15 border-emerald-400/70 text-emerald-300',
    text: 'text-emerald-300',
  },
  fuchsia: {
    card: 'bg-gradient-to-br from-fuchsia-500/12 via-fuchsia-500/8 to-slate-950/85 border-fuchsia-400/50',
    icon: 'bg-fuchsia-500/15 border-fuchsia-400/70 text-fuchsia-300',
    text: 'text-fuchsia-300',
  },
};

// Neutral icon box
function IconBox({
  children,
  className = 'bg-slate-800/80 border-slate-700/60 text-slate-200',
}) {
  return (
    <span
      aria-hidden='true'
      className={`w-9 h-9 rounded-xl border text-base font-extrabold flex items-center justify-center shrink-0 ${className}`}
    >
      {children}
    </span>
  );
}

// Neutral card: optional icon + plain title row, then the body.
// tone='success' gives the green "locked" look.
function PlainCard({
  title,
  pill,
  lead,
  aside,
  children,
  tone = 'default',
  toneClass: toneOverride,
  className = '',
  bodyClassName,
  flashClass = '',
  tooltip,
  theme, // ignored: only ThemedCard uses colour themes
  ...rest
}) {
  const heading = title || pill;
  const hasHeader = lead || heading || aside;
  const toneClass =
    toneOverride ||
    (tone === 'success'
      ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40'
      : 'bg-slate-950/80 border-slate-800/80');
  return (
    <div
      {...rest}
      title={tooltip}
      className={`app-card relative rounded-2xl flex flex-col border shadow-inner min-w-0 overflow-hidden transition duration-200 ${toneClass} ${flashClass} ${className}`}
    >
      {hasHeader && (
        <div className='app-card-header px-4 pt-4 flex flex-wrap items-center gap-3'>
          {lead}
          {heading && (
            <span className='app-card-title font-bold text-slate-100 text-base min-w-0 break-words'>
              {heading}
            </span>
          )}
          {aside && (
            <div className='ml-auto flex flex-wrap items-center justify-end gap-2 min-w-0'>
              {aside}
            </div>
          )}
        </div>
      )}
      <div
        className={`app-card-body flex-1 ${bodyClassName || (hasHeader ? 'px-4 pb-4 pt-3' : 'p-4')}`}
      >
        {children}
      </div>
      {flashClass && (
        <span
          aria-hidden='true'
          className={`absolute inset-0 pointer-events-none ${flashClass}`}
        ></span>
      )}
    </div>
  );
}

// Trivia card: icon, funny name, a one-line description, the answer and its number
function TriviaCard({
  icon,
  tint,
  title,
  subtitle,
  name,
  badges,
  detail,
  label,
  value,
}) {
  const s = TRIVIA_SOFT[tint];
  return (
    <PlainCard
      toneClass={s.card}
      lead={<IconBox className={s.icon}>{icon}</IconBox>}
      title={title}
      bodyClassName='mt-3 px-4 pb-4 pt-3 flex flex-col gap-3'
    >
      <p className='text-xs text-slate-400'>{subtitle}</p>
      <div className='bg-slate-900/70 border border-slate-800/80 rounded-xl p-3.5 shadow-inner flex-1'>
        <span className={`font-bold text-lg block break-words ${s.text}`}>
          {name}
        </span>
        {badges && (
          <div className='flex flex-wrap items-center gap-1 mt-1.5'>
            {badges}
          </div>
        )}
        {detail && (
          <span className='text-xs text-slate-400 block mt-1.5'>{detail}</span>
        )}
      </div>
      <div className='flex justify-between items-center gap-4 text-sm px-1'>
        <span className='text-slate-400 font-medium'>{label}</span>
        <span className={`font-mono font-extrabold ${s.text}`}>{value}</span>
      </div>
    </PlainCard>
  );
}

// Card for one Tower Type or one State
function GroupCard({ kind, rank, theme, label, count, avg, avgLabel, rows }) {
  const t = COLOR_THEMES[theme];
  return (
    <ThemedCard
      theme={theme}
      lead={<LeadBox theme={theme}>#{rank}</LeadBox>}
      pill={
        <>
          <span className='sr-only'>{kind}: </span>
          {label}
        </>
      }
      aside={
        <span className='text-xs font-mono text-slate-200 font-semibold'>
          {count} {count === 1 ? 'Tower' : 'Towers'}
        </span>
      }
      bodyClassName='p-5 space-y-3'
      className={t.banner}
    >
      <div className='bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 shadow-inner'>
        <div className='flex items-center justify-between gap-3'>
          <span className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
            {avgLabel}
          </span>
          <div className='flex items-baseline gap-1'>
            <span className={`font-extrabold text-2xl ${t.avg}`}>{avg}</span>
            <span className='text-xs text-slate-500 font-medium'>/ 5</span>
          </div>
        </div>
        <div className='w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden mt-3'>
          <div
            className={`h-full ${t.bar}`}
            style={{ width: `${Math.min(100, (parseFloat(avg) / 5) * 100)}%` }}
          ></div>
        </div>
      </div>

      <div className='space-y-2.5 text-sm'>
        {rows.map((r) => (
          <div
            key={r.label}
            className='flex justify-between items-start gap-4 bg-slate-900/40 hover:bg-slate-900/60 transition px-4 py-3 rounded-2xl border border-slate-800/60'
          >
            <span className='text-slate-300 font-medium shrink-0'>
              {r.label}
            </span>
            <span
              className={`font-bold text-right min-w-0 break-words ${r.tone}`}
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>
    </ThemedCard>
  );
}

// ----------------------------------------------------------------------------
// RANK HELPER
// Asks "which do you prefer?" about two towers at a time and turns the answers
// into 1-5 ratings. Pairs are chosen so every tower is compared a few times,
// against towers that currently look similar to it (Elo-style scoring).
// ----------------------------------------------------------------------------
const RATING_LABELS = {
  5: 'Love it',
  4: 'Like it',
  3: 'Fine',
  2: 'Meh',
  1: 'Avoid',
};

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

function pickPair(pool, st) {
  const minCount = Math.min(...pool.map((t) => st.counts[t]));
  const starters = pool.filter((t) => st.counts[t] === minCount);
  const a = starters[Math.floor(Math.random() * starters.length)];
  const others = pool.filter((t) => t !== a);
  const fresh = others.filter((t) => !st.faced[pairKey(a, t)]);
  const cands = fresh.length > 0 ? fresh : others;
  // Closest current score first; towers with fewer comparisons are favoured
  const cost = (t) =>
    Math.abs(st.elo[t] - st.elo[a]) + 15 * st.counts[t] + Math.random() * 20;
  const b = [...cands].sort((x, y) => cost(x) - cost(y))[0];
  return Math.random() < 0.5 ? [a, b] : [b, a];
}

function ChoiceCard({ tower, hint, onPick }) {
  const meta = TOWER_METADATA[tower];
  return (
    <PlainCard
      role='button'
      tabIndex={0}
      aria-label={`I prefer ${tower}`}
      onClick={onPick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onPick();
        }
      }}
      className='rank-helper-choice cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
      title={tower}
      aside={
        <div className='flex flex-wrap items-center gap-1.5'>
          <CategoryBadge category={meta.category} />
          <StateBadge state={meta.state} />
        </div>
      }
      bodyClassName='px-5 pb-5 pt-3 flex flex-col gap-4'
    >
      <span className='text-sm font-bold text-sky-300'>{hint}</span>
    </PlainCard>
  );
}

function RankHelper({ userRatings, onApply, onClose }) {
  const unrated = ALL_TOWERS.filter((t) => !(userRatings[t] > 0));
  const [phase, setPhase] = useState('setup'); // setup | compare | review
  const [scope, setScope] = useState(unrated.length >= 2 ? 'unrated' : 'all');
  const [pool, setPool] = useState([]);
  const [st, setSt] = useState(null);
  const [pair, setPair] = useState(null);
  const [draft, setDraft] = useState({});

  const target = Math.max(1, Math.min(4, pool.length - 1));

  const start = () => {
    const list = scope === 'unrated' ? unrated : ALL_TOWERS;
    const elo = {};
    const counts = {};
    list.forEach((t) => {
      elo[t] = 1000;
      counts[t] = 0;
    });
    const fresh = { elo, counts, faced: {}, history: [], total: 0 };
    setPool(list);
    setSt(fresh);
    setPair(pickPair(list, fresh));
    setPhase('compare');
  };

  // Turn the scores into ratings: best fifth gets 5, next fifth 4, and so on
  const goReview = (state, list) => {
    const sorted = [...list].sort(
      (a, b) =>
        state.elo[b] - state.elo[a] ||
        state.counts[b] - state.counts[a] ||
        a.localeCompare(b),
    );
    const map = {};
    sorted.forEach((t, i) => {
      map[t] = 5 - Math.floor((i * 5) / sorted.length);
    });
    setDraft(map);
    setPhase('review');
  };

  const choose = (winner) => {
    if (!pair) return;
    const [a, b] = pair;
    const ea = 1 / (1 + Math.pow(10, (st.elo[b] - st.elo[a]) / 400));
    const sa = winner === a ? 1 : winner === b ? 0 : 0.5;
    const K = 40;
    const next = {
      elo: {
        ...st.elo,
        [a]: st.elo[a] + K * (sa - ea),
        [b]: st.elo[b] + K * (1 - sa - (1 - ea)),
      },
      counts: { ...st.counts, [a]: st.counts[a] + 1, [b]: st.counts[b] + 1 },
      faced: { ...st.faced, [pairKey(a, b)]: true },
      history: [
        ...st.history,
        { elo: st.elo, counts: st.counts, faced: st.faced, pair },
      ],
      total: st.total + 1,
    };
    setSt(next);
    if (pool.every((t) => next.counts[t] >= target)) {
      goReview(next, pool);
    } else {
      setPair(pickPair(pool, next));
    }
  };

  const undo = () => {
    if (!st || st.history.length === 0) return;
    const last = st.history[st.history.length - 1];
    setSt({
      elo: last.elo,
      counts: last.counts,
      faced: last.faced,
      history: st.history.slice(0, -1),
      total: st.total - 1,
    });
    setPair(last.pair);
  };

  const nudge = (tower, delta) =>
    setDraft((d) => ({
      ...d,
      [tower]: Math.min(5, Math.max(1, d[tower] + delta)),
    }));

  // Keyboard: left/right to choose, down for "about the same", Esc to close
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (phase !== 'compare' || !pair) return;
      if (e.key === 'ArrowLeft') choose(pair[0]);
      else if (e.key === 'ArrowRight') choose(pair[1]);
      else if (e.key === 'ArrowDown') choose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const progress =
    st && pool.length
      ? Math.round(
          (pool.reduce((s, t) => s + Math.min(st.counts[t], target), 0) /
            (pool.length * target)) *
            100,
        )
      : 0;
  const everyoneSeen = st && pool.every((t) => st.counts[t] >= 1);
  const estimate = (n) => Math.ceil((n * Math.min(4, n - 1)) / 2);
  const listForScope = scope === 'unrated' ? unrated : ALL_TOWERS;

  const buttonBase =
    'px-4 py-2.5 text-xs font-bold rounded-2xl transition duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:opacity-40 disabled:cursor-not-allowed';
  const ghost = `${buttonBase} bg-slate-800 hover:bg-slate-700 text-slate-200`;
  const primary = `${buttonBase} bg-sky-600 hover:bg-sky-500 text-white shadow-lg shadow-sky-950`;

  return (
    <div
      className='fixed inset-0 z-50 overflow-y-auto p-4 bg-slate-950/85 backdrop-blur-md'
      role='dialog'
      aria-modal='true'
      aria-labelledby='helper-title'
    >
      <PlainCard
        className='max-w-3xl w-full mx-auto my-6 shadow-2xl bg-slate-900'
        lead={<IconBox>🧭</IconBox>}
        title={<span id='helper-title'>Help Me Decide</span>}
        aside={
          <button onClick={onClose} className={ghost} aria-label='Close helper'>
            ✕ Close
          </button>
        }
        bodyClassName='px-5 pb-5 md:px-6 md:pb-6 pt-4 space-y-5'
      >
        {phase === 'setup' && (
          <>
            <p className='text-sm text-slate-300 leading-relaxed'>
              I'll show you two towers at a time. Pick the one you prefer and
              I'll turn your answers into 1 to 5 ratings. You can review and
              change them before anything is saved.
            </p>
            <div
              className='grid grid-cols-1 sm:grid-cols-2 gap-3'
              role='group'
              aria-label='Which towers to rank'
            >
              {[
                {
                  id: 'unrated',
                  title: 'Unrated towers only',
                  count: unrated.length,
                },
                { id: 'all', title: 'All towers', count: ALL_TOWERS.length },
              ].map((opt) => {
                const disabled = opt.id === 'unrated' && unrated.length < 2;
                return (
                  <button
                    key={opt.id}
                    disabled={disabled}
                    aria-pressed={scope === opt.id}
                    onClick={() => setScope(opt.id)}
                    className={`text-left p-4 rounded-2xl border-2 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                      scope === opt.id
                        ? 'border-sky-500/70 bg-sky-950/40'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-600'
                    }`}
                  >
                    <span className='font-bold text-slate-100 block'>
                      {opt.title}
                    </span>
                    <span className='text-xs text-slate-400'>
                      {opt.count} {opt.count === 1 ? 'tower' : 'towers'}
                      {opt.id === 'all' &&
                        ' (replaces your existing ratings if you apply)'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className='text-xs text-slate-400'>
              About {estimate(listForScope.length)} questions. You can stop and
              finish early once every tower has been compared once.
            </p>
            <div className='flex justify-end'>
              <button onClick={start} className={primary}>
                Start
              </button>
            </div>
          </>
        )}

        {phase === 'compare' && pair && (
          <>
            <div>
              <div className='flex items-center justify-between text-xs text-slate-400 mb-1.5'>
                <span>Question {st.total + 1}</span>
                <span>{progress}% sorted</span>
              </div>
              <div
                className='w-full bg-slate-800/80 h-2 rounded-full overflow-hidden'
                role='progressbar'
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className='bg-sky-500 h-full transition-all duration-300'
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>

            <h3 className='text-lg font-bold text-slate-100 text-center'>
              Which tower do you prefer?
            </h3>

            <div className='rank-helper-comparison'>
              <ChoiceCard
                key={`l-${pair[0]}`}
                tower={pair[0]}
                hint='← Choose this one'
                onPick={() => choose(pair[0])}
              />
              <span className='rank-helper-vs'>vs</span>
              <ChoiceCard
                key={`r-${pair[1]}`}
                tower={pair[1]}
                hint='Choose this one →'
                onPick={() => choose(pair[1])}
              />
            </div>

            <div className='flex flex-wrap items-center justify-between gap-3'>
              <button onClick={() => choose(null)} className={ghost}>
                About the same
              </button>
              <div className='flex items-center gap-2'>
                <button
                  onClick={undo}
                  disabled={st.history.length === 0}
                  className={ghost}
                >
                  ↶ Undo
                </button>
                <button
                  onClick={() => goReview(st, pool)}
                  disabled={!everyoneSeen}
                  className={primary}
                  title={
                    everyoneSeen
                      ? 'See the ratings so far'
                      : 'Every tower needs at least one comparison first'
                  }
                >
                  Finish now
                </button>
              </div>
            </div>
            <p className='text-[11px] text-slate-500'>
              Tip: use the ← and → keys to choose, ↓ for about the same.
            </p>
          </>
        )}

        {phase === 'review' && (
          <>
            <p className='text-sm text-slate-300'>
              Here's how your answers rank. Use ▲ ▼ to move a tower up or down a
              rating, then apply.
            </p>
            <div className='space-y-4'>
              {[5, 4, 3, 2, 1].map((r) => {
                const towers = Object.keys(draft)
                  .filter((t) => draft[t] === r)
                  .sort((a, b) => st.elo[b] - st.elo[a] || a.localeCompare(b));
                return (
                  <PlainCard
                    key={r}
                    lead={<IconBox>{r}</IconBox>}
                    title={RATING_LABELS[r]}
                    aside={
                      <span className='text-xs font-mono text-slate-200 font-semibold'>
                        {towers.length}{' '}
                        {towers.length === 1 ? 'Tower' : 'Towers'}
                      </span>
                    }
                    bodyClassName='p-3'
                  >
                    {towers.length === 0 ? (
                      <p className='text-xs text-slate-500 px-1 py-1'>
                        No towers at this rating.
                      </p>
                    ) : (
                      <ul className='grid grid-cols-1 sm:grid-cols-2 gap-2'>
                        {towers.map((tower) => (
                          <li
                            key={tower}
                            className='flex items-center justify-between gap-2 bg-slate-900/60 border border-slate-800/60 rounded-xl px-3 py-2'
                          >
                            <span className='text-sm font-semibold text-slate-100 min-w-0 break-words'>
                              {tower}
                            </span>
                            <span className='flex items-center gap-1 shrink-0'>
                              <button
                                onClick={() => nudge(tower, -1)}
                                disabled={r === 1}
                                aria-label={`Lower ${tower} to ${r - 1}`}
                                className='w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
                              >
                                ▼
                              </button>
                              <button
                                onClick={() => nudge(tower, 1)}
                                disabled={r === 5}
                                aria-label={`Raise ${tower} to ${r + 1}`}
                                className='w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
                              >
                                ▲
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </PlainCard>
                );
              })}
            </div>
            <div className='flex flex-wrap justify-between gap-3'>
              <button onClick={() => setPhase('compare')} className={ghost}>
                Keep comparing
              </button>
              <button
                onClick={() => {
                  onApply(draft);
                  onClose();
                }}
                className={primary}
              >
                Apply {Object.keys(draft).length} ratings
              </button>
            </div>
          </>
        )}
      </PlainCard>
    </div>
  );
}

function App() {
  const buildDefaultProfiles = () => {
    const fallback = [
      {
        id: DEFAULT_PROFILE_ID,
        name: 'Primary',
        controllers: [...CONTROLLERS],
        draftSlots: [...DEFAULT_DRAFT_SLOTS],
      },
    ];

    try {
      const saved = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (!saved) return fallback;
      const parsed = JSON.parse(saved);
      if (!Array.isArray(parsed) || parsed.length === 0) return fallback;

      let migratedProfileId = null;
      const normalizedProfiles = parsed.map((profile, index) => {
        const rawControllers = Array.isArray(profile.controllers)
          ? [...new Set(profile.controllers.filter(Boolean))]
          : [...CONTROLLERS];
        const targetCount = rawControllers.length;
        const rawDraftSlots =
          Array.isArray(profile.draftSlots) && profile.draftSlots.length
            ? ensureDraftSlotCount(profile.draftSlots, targetCount)
            : ensureDraftSlotCount([...DEFAULT_DRAFT_SLOTS], targetCount);
        const sorted = sortControllersWithDraftSlots(
          rawControllers,
          rawDraftSlots,
        );
        const profileId =
          profile.id === 'profile-primary'
            ? createProfileId()
            : profile.id || `profile-${index + 1}`;
        if (profile.id === 'profile-primary') migratedProfileId = profileId;
        return {
          id: profileId,
          name: profile.name || `Profile ${index + 1}`,
          controllers: sorted.controllers,
          draftSlots: ensureDraftSlotCount(sorted.draftSlots, targetCount),
        };
      });

      if (migratedProfileId) {
        localStorage.setItem(
          PROFILE_STORAGE_KEY,
          JSON.stringify(normalizedProfiles),
        );
        localStorage.setItem('atc_active_profile_id', migratedProfileId);
        const cachedRatings = localStorage.getItem(PROFILE_RATINGS_STORAGE_KEY);
        if (cachedRatings) {
          const ratingsMap = JSON.parse(cachedRatings);
          if (ratingsMap['profile-primary']) {
            ratingsMap[migratedProfileId] = ratingsMap['profile-primary'];
            delete ratingsMap['profile-primary'];
            localStorage.setItem(
              PROFILE_RATINGS_STORAGE_KEY,
              JSON.stringify(ratingsMap),
            );
          }
        }
      }

      return normalizedProfiles;
    } catch (error) {
      return fallback;
    }
  };

  const [profiles, setProfiles] = useState(buildDefaultProfiles);
  const [activeProfileId, setActiveProfileId] = useState(() => {
    const saved = localStorage.getItem('atc_active_profile_id');
    const fallback = buildDefaultProfiles()[0]?.id || DEFAULT_PROFILE_ID;
    return saved || fallback;
  });
  const profileCloudHydratedRef = useRef(false);
  const [profileCloudReady, setProfileCloudReady] = useState(false);
  const [profileCloudWritable, setProfileCloudWritable] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [users, setUsers] = useState(() => {
    const active =
      buildDefaultProfiles().find(
        (p) => p.id === localStorage.getItem('atc_active_profile_id'),
      ) || buildDefaultProfiles()[0];
    return active?.controllers || [...CONTROLLERS];
  });
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem('atc_current_user') || CONTROLLERS[0],
  );
  const [ratingsByProfile, setRatingsByProfile] = useState(() => {
    try {
      const savedByProfile = localStorage.getItem(PROFILE_RATINGS_STORAGE_KEY);
      if (savedByProfile) {
        const parsed = JSON.parse(savedByProfile);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed;
        }
        throw new Error('Saved profile ratings are not a profile map.');
      }

      const legacyRatings = localStorage.getItem(RATINGS_STORAGE_KEY);
      if (legacyRatings) {
        const parsed = JSON.parse(legacyRatings);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Saved ratings are not a controller map.');
        }
        const profileId =
          localStorage.getItem('atc_active_profile_id') || DEFAULT_PROFILE_ID;
        return { [profileId]: parsed };
      }
    } catch (error) {
      console.error('Unable to restore locally saved ratings:', error);
    }
    return {};
  });
  const ratings = ratingsByProfile[activeProfileId] || {};
  const [profileSyncError, setProfileSyncError] = useState('');
  const [syncStatus, setSyncStatus] = useState('Initialising...');
  const [activeTab, setActiveTab] = useState('rate');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showHelper, setShowHelper] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [pendingDeletion, setPendingDeletion] = useState(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newControllerName, setNewControllerName] = useState('');
  const [profileDraftNames, setProfileDraftNames] = useState({});
  const [controllerDraftNames, setControllerDraftNames] = useState({});

  // Hot to Not Table Search & Filter State
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState('All');

  // Icon-Only Toast Notification State
  const [saveToast, setSaveToast] = useState({
    visible: false,
    user: '',
    status: 'queued',
    message: '',
  });

  const cancelButtonRef = useRef(null);
  // Rating changes apply locally immediately; cloud writes are queued and
  // cloud polls are ignored while a save is pending.
  const ratingsRef = useRef(ratings);
  const ratingsByProfileRef = useRef(ratingsByProfile);
  const activeProfileIdRef = useRef(activeProfileId);
  activeProfileIdRef.current = activeProfileId;
  const pendingSavesRef = useRef(0);
  const pendingRatingSavesRef = useRef([]);
  const activeSaveIdsRef = useRef(new Set());
  const activeSaveKeysRef = useRef(new Set());
  const saveWorkerRef = useRef(null);
  const cloudActionQueueRef = useRef([]);
  const cloudActionWorkerRef = useRef(null);
  const cloudActionQueueReadyRef = useRef(false);
  const queuedProfileSnapshotRef = useRef(null);
  const ratingsInitialisedRef = useRef(false);
  const saveVersionRef = useRef(0);
  const lastSaveEndRef = useRef(0);
  const toastTimerRef = useRef(null);
  const lastDraftKeyRef = useRef(null);

  const activeProfile =
    profiles.find((profile) => profile.id === activeProfileId) || profiles[0];
  const activeProfileControllers = activeProfile?.controllers || [];
  const hasSelectedController =
    Boolean(currentUser) && activeProfileControllers.includes(currentUser);
  const getProfileSnapshot = (profileList) =>
    JSON.stringify(
      profileList.map(({ id, name, controllers, draftSlots }) => ({
        id,
        name,
        controllers,
        draftSlots,
      })),
    );
  const lastPersistedProfileSnapshotRef = useRef(null);
  const profileMutationLockRef = useRef(false);

  const [targetSlots, setTargetSlots] = useState(
    ensureDraftSlotCount(
      activeProfile?.draftSlots || DEFAULT_DRAFT_SLOTS,
      activeProfile?.controllers?.length ?? CONTROLLERS.length,
    ),
  );

  const [draftResult, setDraftResult] = useState(null);
  const [selectedOptionIdx, setSelectedOptionIdx] = useState(0);

  // Briefly highlights what changed when switching between tied options:
  // { id, users: { [controller]: { from, to } } }
  const [tieFlash, setTieFlash] = useState(null);
  const tieFlashTimerRef = useRef(null);
  // The form row the person just clicked to lock/unlock, so it isn't flashed.
  const clickedRowRef = useRef(null);
  // Form rows that changed position: { id, rows: { [controller]: [towers] } }
  const [rowFlash, setRowFlash] = useState(null);
  const rowFlashTimerRef = useRef(null);
  const prevFormOrdersRef = useRef(null);

  // Hot to Not table sorting: key is 'tower', 'avg', or a controller name
  const [matrixSort, setMatrixSort] = useState({ key: 'avg', dir: 'desc' });

  // Manual Locks State: { [user]: towerName }
  const [manualLocks, setManualLocks] = useState({});

  const applyRatings = (next, profileId = activeProfileIdRef.current) => {
    if (profileId === activeProfileIdRef.current) {
      ratingsRef.current = next;
    }
    const nextByProfile = { ...ratingsByProfileRef.current, [profileId]: next };
    ratingsByProfileRef.current = nextByProfile;
    setRatingsByProfile(nextByProfile);
  };

  const persistLocalRatings = (
    next,
    profileId = activeProfileIdRef.current,
  ) => {
    if (cloudEnabled()) localStorage.setItem(RATINGS_DIRTY_KEY, '1');
    const nextByProfile = {
      ...ratingsByProfileRef.current,
      [profileId]: next,
    };
    ratingsByProfileRef.current = nextByProfile;
    setRatingsByProfile(nextByProfile);
    localStorage.setItem(
      PROFILE_RATINGS_STORAGE_KEY,
      JSON.stringify(nextByProfile),
    );
    localStorage.removeItem(RATINGS_STORAGE_KEY);
  };

  const persistPendingRatingSaves = (next) => {
    localStorage.setItem(RATINGS_OUTBOX_KEY, JSON.stringify(next));
    pendingRatingSavesRef.current = next;
  };

  // Restore local ratings and any cloud writes interrupted by a refresh/close.
  useEffect(() => {
    try {
      const savedCloudActions = localStorage.getItem(CLOUD_ACTION_OUTBOX_KEY);
      if (savedCloudActions) {
        const parsedActions = JSON.parse(savedCloudActions);
        if (!Array.isArray(parsedActions)) {
          throw new Error('Saved update queue is not a list.');
        }
        cloudActionQueueRef.current = parsedActions;
      }
    } catch (error) {
      console.error('Unable to restore pending updates:', error);
      setSyncStatus('Local Recovery Error');
    } finally {
      cloudActionQueueReadyRef.current = true;
    }

    try {
      const outbox = localStorage.getItem(RATINGS_OUTBOX_KEY);
      if (outbox) {
        const parsedOutbox = JSON.parse(outbox);
        if (!Array.isArray(parsedOutbox)) {
          throw new Error('Saved rating outbox is not a list');
        }
        const latestByRating = new Map();
        parsedOutbox.forEach((pending) => {
          latestByRating.set(ratingSaveKey(pending), {
            ...pending,
            profileId: pending.profileId || activeProfileIdRef.current,
          });
        });
        persistPendingRatingSaves([...latestByRating.values()]);
      }
    } catch (error) {
      console.error('Unable to restore locally saved ratings:', error);
      setSyncStatus('Local Recovery Error');
    }
    ratingsInitialisedRef.current = true;
  }, []);

  useEffect(() => {
    if (!profileCloudReady || !ratingsInitialisedRef.current) return undefined;

    if (
      cloudEnabled() &&
      localStorage.getItem(RATINGS_DIRTY_KEY) &&
      pendingRatingSavesRef.current.length === 0
    ) {
      const localRatings =
        ratingsByProfileRef.current[activeProfileIdRef.current] || {};
      const recoveredSaves = Object.entries(localRatings).flatMap(
        ([controller, controllerRatings]) =>
          Object.entries(controllerRatings)
            .filter(([, score]) => Number(score) > 0)
            .map(([tower, score]) => ({
              id: `${Date.now()}-${Math.random()}`,
              profileId: activeProfileIdRef.current,
              controller,
              tower,
              score,
            })),
      );
      persistPendingRatingSaves(recoveredSaves);
    }

    if (pendingRatingSavesRef.current.length > 0) {
      setSyncStatus('Saving...');
      flushPendingRatingSaves().catch((error) => {
        console.error('Unable to restore pending rating saves:', error);
        setSyncStatus('Offline');
      });
    }
    if (cloudActionQueueReadyRef.current) {
      flushCloudActionQueue().catch((error) => {
        console.error('Unable to restore pending updates:', error);
      });
    }

    const retryTimer = setInterval(() => {
      if (pendingRatingSavesRef.current.length > 0) {
        flushPendingRatingSaves().catch((error) => {
          console.error('Unable to retry pending rating saves:', error);
        });
      }
      if (cloudActionQueueRef.current.length > 0) {
        flushCloudActionQueue().catch((error) => {
          console.error('Unable to retry pending updates:', error);
        });
      }
    }, 20000);
    return () => clearInterval(retryTimer);
  }, [profileCloudReady]);

  useEffect(() => {
    ratingsByProfileRef.current = ratingsByProfile;
    ratingsRef.current = ratings;
  }, [activeProfileId, ratings, ratingsByProfile]);

  // Accessibility: Focus management for reset modal
  useEffect(() => {
    if (showResetModal && cancelButtonRef.current) {
      cancelButtonRef.current.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && showResetModal) {
        setShowResetModal(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showResetModal]);

  const modalOpen =
    showProfileModal ||
    showHelper ||
    showResetModal ||
    Boolean(pendingDeletion);
  useEffect(() => {
    if (!modalOpen) return undefined;

    const root = document.getElementById('root');
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousOverscroll = document.body.style.overscrollBehavior;
    const previousInert = root?.inert || false;
    const previouslyFocused = document.activeElement;

    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.overscrollBehavior = 'none';
    if (root) root.inert = true;

    const dialogs = document.querySelectorAll(
      '[role="dialog"][aria-modal="true"]',
    );
    const dialog = dialogs[dialogs.length - 1];
    const firstFocusable = dialog?.querySelector(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();

    const trapFocus = (event) => {
      if (event.key === 'Escape') {
        if (pendingDeletion) setPendingDeletion(null);
        else if (showProfileModal) setShowProfileModal(false);
        else if (showResetModal) setShowResetModal(false);
        else if (showHelper) setShowHelper(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', trapFocus);

    return () => {
      window.removeEventListener('keydown', trapFocus);
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.overscrollBehavior = previousOverscroll;
      if (root) root.inert = previousInert;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [
    modalOpen,
    showProfileModal,
    showHelper,
    showResetModal,
    pendingDeletion,
  ]);

  // Fetch live ratings from Cloud API
  const fetchCloudRatings = async (profileId = activeProfileIdRef.current) => {
    if (
      !ratingsInitialisedRef.current ||
      pendingSavesRef.current > 0 ||
      pendingRatingSavesRef.current.length > 0
    ) {
      if (
        ratingsInitialisedRef.current &&
        pendingRatingSavesRef.current.length
      ) {
        flushPendingRatingSaves().catch((error) => {
          console.error('Unable to retry pending rating saves:', error);
          setSyncStatus('Offline');
        });
      }
      return;
    }

    if (
      !GOOGLE_SHEET_API_URL ||
      GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')
    ) {
      setSyncStatus('Local Mode');
      return;
    }
    const versionAtStart = saveVersionRef.current;
    try {
      const res = await fetch(
        `${GOOGLE_SHEET_API_URL}?profileId=${encodeURIComponent(profileId)}`,
      );
      if (res.ok) {
        const payload = await res.json();
        if (
          payload?.profileId !== profileId ||
          !payload.ratings ||
          typeof payload.ratings !== 'object'
        ) {
          throw new Error(
            'The ratings service returned an unexpected response.',
          );
        }
        const cloudData = payload.ratings;
        // Drop this response if a rating was saved while it was in flight
        if (
          pendingSavesRef.current > 0 ||
          versionAtStart !== saveVersionRef.current ||
          Date.now() - lastSaveEndRef.current < 3000
        ) {
          return;
        }
        if (cloudData && typeof cloudData === 'object') {
          const cloudJson = JSON.stringify(cloudData);
          const cached = ratingsByProfileRef.current[profileId] || {};
          if (cloudJson !== JSON.stringify(cached)) {
            applyRatings(cloudData, profileId);
            const nextByProfile = {
              ...ratingsByProfileRef.current,
              [profileId]: cloudData,
            };
            ratingsByProfileRef.current = nextByProfile;
            setRatingsByProfile(nextByProfile);
            localStorage.setItem(
              PROFILE_RATINGS_STORAGE_KEY,
              JSON.stringify(nextByProfile),
            );
          }
          setSyncStatus('Synced');
        }
      } else {
        setSyncStatus('Sync Error');
      }
    } catch (err) {
      console.error('Unable to fetch cloud ratings:', err);
      setSyncStatus('Offline');
    }
  };

  useEffect(() => {
    fetchCloudRatings(activeProfileId);
    const interval = setInterval(
      () => fetchCloudRatings(activeProfileId),
      15000,
    );
    const retryPendingSaves = () => {
      if (pendingRatingSavesRef.current.length > 0) {
        flushPendingRatingSaves().catch((error) => {
          console.error('Unable to retry pending rating saves:', error);
          setSyncStatus('Offline');
        });
      }
      flushCloudActionQueue().catch((error) => {
        console.error('Unable to retry pending updates:', error);
      });
    };
    window.addEventListener('online', retryPendingSaves);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', retryPendingSaves);
    };
  }, [activeProfileId]);

  useEffect(() => {
    localStorage.setItem('atc_current_user', currentUser);
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    let cancelled = false;

    const hydrateProfiles = async () => {
      if (!cloudEnabled()) {
        profileCloudHydratedRef.current = true;
        setProfileCloudReady(true);
        return;
      }

      try {
        const remote = await fetchCloudProfiles();
        if (cancelled) return;
        if (remote) {
          setProfileSyncError('');
        } else {
          setProfileCloudWritable(false);
          setProfileSyncError(
            'Profile sync is unavailable. Check your connection and try again.',
          );
        }
        if (
          remote &&
          Array.isArray(remote.profiles) &&
          remote.profiles.length > 0
        ) {
          const pendingProfileChange = cloudActionQueueRef.current.some(
            (pending) =>
              [
                'saveProfiles',
                'deleteProfile',
                'deleteController',
                'renameController',
              ].includes(pending.expectedAction),
          );
          if (pendingProfileChange) {
            lastPersistedProfileSnapshotRef.current =
              getProfileSnapshot(profiles);
            queuedProfileSnapshotRef.current = getProfileSnapshot(profiles);
            setProfileCloudWritable(true);
            return;
          }
          const profileIdMigrations = remote.profiles
            .filter((profile) => profile.id === 'profile-primary')
            .map((profile) => {
              const cachedProfile = profiles.find(
                (cached) =>
                  cached.name === profile.name &&
                  JSON.stringify(cached.controllers) ===
                    JSON.stringify(profile.controllers),
              );
              return {
                oldId: profile.id,
                newId: cachedProfile?.id || createProfileId(),
              };
            });
          const cloudProfiles = remote.profiles.map((profile) => {
            const migration = profileIdMigrations.find(
              (item) => item.oldId === profile.id,
            );
            const migratedProfile = migration
              ? { ...profile, id: migration.newId }
              : profile;
            const sorted = sortControllersWithDraftSlots(
              migratedProfile.controllers || [],
              ensureDraftSlotCount(
                migratedProfile.draftSlots || DEFAULT_DRAFT_SLOTS,
                migratedProfile.controllers?.length || 0,
              ),
            );
            return {
              ...migratedProfile,
              controllers: sorted.controllers,
              draftSlots: ensureDraftSlotCount(
                sorted.draftSlots,
                sorted.controllers.length,
              ),
            };
          });
          for (const migration of profileIdMigrations) {
            await postCloudAction(
              {
                action: 'migrateProfileId',
                oldId: migration.oldId,
                newId: migration.newId,
              },
              'migrateProfileId',
            );
          }
          if (profileIdMigrations.length > 0) {
            const migratedIds = new Map(
              profileIdMigrations.map(({ oldId, newId }) => [oldId, newId]),
            );
            const migratedSaves = pendingRatingSavesRef.current.map(
              (pending) => ({
                ...pending,
                profileId:
                  migratedIds.get(pending.profileId) || pending.profileId,
              }),
            );
            persistPendingRatingSaves(migratedSaves);
          }
          const cloudActiveProfileId =
            profileIdMigrations.find(
              (item) => item.oldId === remote.activeProfileId,
            )?.newId ||
            remote.activeProfileId ||
            cloudProfiles[0]?.id ||
            activeProfileId;
          lastPersistedProfileSnapshotRef.current =
            getProfileSnapshot(cloudProfiles);
          setProfiles(cloudProfiles);
          setActiveProfileId(cloudActiveProfileId);
        } else if (remote) {
          lastPersistedProfileSnapshotRef.current = getProfileSnapshot([]);
        }
        if (remote) setProfileCloudWritable(true);
      } catch (error) {
        console.error('Unable to hydrate profiles from cloud:', error);
        setProfileCloudWritable(false);
        setProfileSyncError(error.message);
        showToast(
          activeProfile?.name || 'Profile sync',
          'error',
          6000,
          error.message,
        );
      } finally {
        if (!cancelled) {
          profileCloudHydratedRef.current = true;
          setProfileCloudReady(true);
        }
      }
    };

    hydrateProfiles();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!profileCloudHydratedRef.current || !profileCloudReady) return;
    if (!cloudEnabled() || !profileCloudWritable) return;
    if (
      getProfileSnapshot(profiles) === lastPersistedProfileSnapshotRef.current
    ) {
      return;
    }

    persistCloudProfiles(profiles, activeProfileId).catch(() => {});
  }, [profiles, activeProfileId, profileCloudReady, profileCloudWritable]);

  useEffect(() => {
    if (!activeProfile) return;

    const rawControllers = Array.from(new Set(activeProfile.controllers || []));
    const sorted = sortControllersWithDraftSlots(
      rawControllers,
      ensureDraftSlotCount(
        activeProfile.draftSlots || DEFAULT_DRAFT_SLOTS,
        rawControllers.length,
      ),
    );
    const normalisedControllers = sorted.controllers;
    const normalisedDraftSlots = ensureDraftSlotCount(
      sorted.draftSlots,
      normalisedControllers.length,
    );

    setUsers(normalisedControllers);
    setTargetSlots(normalisedDraftSlots);
    setCurrentUser((prev) => {
      if (!normalisedControllers.length) return '';
      return normalisedControllers.includes(prev)
        ? prev
        : normalisedControllers[0];
    });
    setManualLocks((prev) => {
      const next = {};
      Object.entries(prev).forEach(([controller, tower]) => {
        if (normalisedControllers.includes(controller)) {
          next[controller] = tower;
        }
      });
      return next;
    });
    localStorage.setItem('atc_active_profile_id', activeProfile.id);
  }, [activeProfile, activeProfileId]);

  const syncProfileDraftList = (nextSlots) => {
    const safeSlots = ensureDraftSlotCount(
      nextSlots,
      activeProfile?.controllers?.length || 0,
    );
    setTargetSlots(safeSlots);
  };

  const saveTargetSlotsAsDefault = () => {
    if (profileSaving || !activeProfile?.controllers?.length) return;
    const safeSlots = ensureDraftSlotCount(
      targetSlots,
      activeProfile.controllers.length,
    );
    if (
      JSON.stringify(safeSlots) ===
      JSON.stringify(activeProfile.draftSlots || [])
    ) {
      showToast(
        activeProfile.name,
        'saved',
        2500,
        'Already the profile default.',
      );
      return;
    }
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === activeProfileId
          ? { ...profile, draftSlots: safeSlots }
          : profile,
      ),
    );
    showToast(
      activeProfile.name,
      cloudEnabled() ? 'saving' : 'saved',
      cloudEnabled() ? undefined : 3000,
      cloudEnabled()
        ? 'Saving this draft list as the profile default…'
        : 'This draft list is now the profile default.',
    );
  };

  const createProfile = () => {
    if (profileSaving) return;
    const name = newProfileName.trim();
    if (!name) return;

    setProfileSaving(cloudEnabled());
    const nextProfile = {
      id: createProfileId(),
      name,
      controllers: [],
      draftSlots: [],
    };

    setProfiles((prev) => [...prev, nextProfile]);
    setActiveProfileId(nextProfile.id);
    setUsers([]);
    setTargetSlots([]);
    setCurrentUser('');
    setNewProfileName('');
    showToast(
      name,
      cloudEnabled() ? 'saving' : 'saved',
      cloudEnabled() ? undefined : 3500,
      cloudEnabled()
        ? 'Creating profile…'
        : 'Profile created. Add a controller to begin.',
    );
  };

  const renameProfile = (profileId, newName) => {
    if (profileSaving) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    const currentName = profiles.find(
      (profile) => profile.id === profileId,
    )?.name;
    if (trimmed === currentName) return;
    setProfileSaving(cloudEnabled());
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === profileId ? { ...profile, name: trimmed } : profile,
      ),
    );
    showToast(
      trimmed,
      cloudEnabled() ? 'saving' : 'saved',
      cloudEnabled() ? undefined : 3000,
      cloudEnabled() ? 'Renaming profile…' : 'Profile renamed.',
    );
  };

  const removeProfile = async (profileId) => {
    if (profiles.length <= 1 || profileSaving) return;
    setProfileSaving(true);
    setProfileSyncError('');
    const deletedProfileName =
      profiles.find((profile) => profile.id === profileId)?.name || 'Profile';
    showToast(deletedProfileName, 'saving', undefined, 'Deleting profile…');
    try {
      persistPendingRatingSaves(
        pendingRatingSavesRef.current.filter(
          (pending) => pending.profileId !== profileId,
        ),
      );
      const nextRatings = { ...ratingsByProfileRef.current };
      delete nextRatings[profileId];
      ratingsByProfileRef.current = nextRatings;
      setRatingsByProfile(nextRatings);
      localStorage.setItem(
        PROFILE_RATINGS_STORAGE_KEY,
        JSON.stringify(nextRatings),
      );
      const nextProfiles = profiles.filter(
        (profile) => profile.id !== profileId,
      );
      const nextActiveProfileId = nextProfiles[0].id;
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
      localStorage.setItem('atc_active_profile_id', nextActiveProfileId);
      setProfiles(nextProfiles);
      setActiveProfileId(nextActiveProfileId);
      if (cloudEnabled()) {
        const deletePromise = enqueueCloudAction(
          { action: 'deleteProfile', profileId },
          'deleteProfile',
          deletedProfileName,
          'Profile deleted.',
        );
        const snapshot = getProfileSnapshot(nextProfiles);
        lastPersistedProfileSnapshotRef.current = snapshot;
        queuedProfileSnapshotRef.current = snapshot;
        await deletePromise;
      } else {
        showToast(deletedProfileName, 'saved', 2500, 'Profile deleted.');
      }
    } catch (error) {
      console.error('Unable to delete profile:', error);
      setProfileSyncError(error.message);
      showToast(deletedProfileName, 'error', 5000, error.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const addControllerToProfile = () => {
    const value = newControllerName.trim();
    if (!value || profileSaving) return;

    if (
      (activeProfile?.controllers || []).some(
        (name) => name.toLowerCase() === value.toLowerCase(),
      )
    ) {
      showToast(
        value,
        'error',
        4000,
        'That controller already exists in this profile.',
      );
      return;
    }

    const unsortedControllers = [
      ...new Set([...(activeProfile?.controllers || []), value]),
    ];
    const unsortedSlots = ensureDraftSlotCount(
      targetSlots,
      unsortedControllers.length,
    );
    const sorted = sortControllersWithDraftSlots(
      unsortedControllers,
      unsortedSlots,
    );
    const nextControllers = sorted.controllers;
    setProfileSaving(cloudEnabled());
    setProfiles((prev) =>
      prev.map((profile) =>
        profile.id === activeProfileId
          ? {
              ...profile,
              controllers: nextControllers,
              draftSlots: ensureDraftSlotCount(
                sorted.draftSlots,
                nextControllers.length,
              ),
            }
          : profile,
      ),
    );
    setTargetSlots(
      ensureDraftSlotCount(sorted.draftSlots, nextControllers.length),
    );
    setUsers(nextControllers);
    setCurrentUser((prev) =>
      prev && nextControllers.includes(prev) ? prev : nextControllers[0],
    );
    setNewControllerName('');
    showToast(
      value,
      cloudEnabled() ? 'saving' : 'saved',
      cloudEnabled() ? undefined : 3000,
      cloudEnabled() ? 'Adding controller…' : 'Controller added.',
    );
  };

  const renameControllerInProfile = async (oldName, newName) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName || profileSaving) return;
    if (
      (activeProfile?.controllers || []).some(
        (name) => name.toLowerCase() === trimmed.toLowerCase(),
      )
    ) {
      showToast(
        trimmed,
        'error',
        4000,
        'That controller already exists in this profile.',
      );
      return;
    }

    const profileId = activeProfileId;
    const unsortedControllers = (activeProfile?.controllers || []).map(
      (name) => (name === oldName ? trimmed : name),
    );
    const sorted = sortControllersWithDraftSlots(
      unsortedControllers,
      ensureDraftSlotCount(
        activeProfile?.draftSlots || targetSlots,
        unsortedControllers.length,
      ),
    );
    const nextControllers = sorted.controllers;
    const nextProfiles = profiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            controllers: nextControllers,
            draftSlots: ensureDraftSlotCount(
              sorted.draftSlots,
              nextControllers.length,
            ),
          }
        : profile,
    );
    const nextRatingSaves = pendingRatingSavesRef.current.map((pending) =>
      pending.profileId === profileId && pending.controller === oldName
        ? { ...pending, controller: trimmed }
        : pending,
    );
    persistPendingRatingSaves(nextRatingSaves);
    setProfiles(nextProfiles);
    const nextRatings = { ...ratingsRef.current };
    if (Object.prototype.hasOwnProperty.call(nextRatings, oldName)) {
      nextRatings[trimmed] = nextRatings[oldName];
      delete nextRatings[oldName];
      applyRatings(nextRatings, profileId);
      persistLocalRatings(nextRatings, profileId);
    }
    if (currentUser === oldName) setCurrentUser(trimmed);
    setControllerDraftNames((prev) => {
      const next = { ...prev };
      delete next[oldName];
      return next;
    });
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
    if (cloudEnabled()) {
      setProfileSaving(true);
      showToast(trimmed, 'saving', undefined, 'Renaming controller…');
      try {
        const renamePromise = enqueueCloudAction(
          {
            action: 'renameController',
            profileId,
            oldName,
            newName: trimmed,
          },
          'renameController',
          trimmed,
          'Controller renamed.',
        );
        const snapshot = getProfileSnapshot(nextProfiles);
        lastPersistedProfileSnapshotRef.current = snapshot;
        queuedProfileSnapshotRef.current = snapshot;
        await renamePromise;
      } catch (error) {
        console.error('Unable to queue controller rename:', error);
        setProfileSyncError(error.message);
        showToast(
          trimmed,
          'error',
          6000,
          'Could not queue this update locally.',
        );
      } finally {
        setProfileSaving(false);
      }
    } else {
      showToast(trimmed, 'saved', 2500, 'Controller renamed.');
    }
  };

  const removeControllerFromProfile = async (controller) => {
    if (profileSaving || profileMutationLockRef.current) return;
    profileMutationLockRef.current = true;
    const profileId = activeProfileId;
    const controllerIndex = (activeProfile?.controllers || []).indexOf(
      controller,
    );
    setProfileSaving(true);
    setProfileSyncError('');
    showToast(controller, 'saving', undefined, 'Deleting controller…');
    try {
      const nextPendingSaves = pendingRatingSavesRef.current.filter(
        (pending) =>
          pending.profileId !== profileId || pending.controller !== controller,
      );
      persistPendingRatingSaves(nextPendingSaves);

      const remaining = (activeProfile?.controllers || []).filter(
        (name) => name !== controller,
      );
      const remainingSlots = (activeProfile?.draftSlots || []).filter(
        (_, index) => index !== controllerIndex,
      );
      const sorted = sortControllersWithDraftSlots(
        remaining,
        ensureDraftSlotCount(remainingSlots, remaining.length),
      );
      const safeRemaining = sorted.controllers;
      const nextRatings = { ...ratingsRef.current };
      delete nextRatings[controller];
      applyRatings(nextRatings, profileId);
      persistLocalRatings(nextRatings, profileId);

      const nextProfiles = profiles.map((profile) =>
        profile.id === activeProfileId
          ? {
              ...profile,
              controllers: safeRemaining,
              draftSlots: ensureDraftSlotCount(
                sorted.draftSlots,
                safeRemaining.length,
              ),
            }
          : profile,
      );
      setProfiles(nextProfiles);
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
      if (cloudEnabled()) {
        const deletePromise = enqueueCloudAction(
          { action: 'deleteController', profileId, controller },
          'deleteController',
          controller,
          'Controller deleted.',
        );
        const snapshot = getProfileSnapshot(nextProfiles);
        lastPersistedProfileSnapshotRef.current = snapshot;
        queuedProfileSnapshotRef.current = snapshot;
        await deletePromise;
      }

      setUsers(safeRemaining);
      setTargetSlots((prev) =>
        ensureDraftSlotCount(sorted.draftSlots, safeRemaining.length),
      );
      setCurrentUser((prevUser) =>
        prevUser === controller ? safeRemaining[0] || '' : prevUser,
      );
      if (!cloudEnabled()) {
        showToast(controller, 'saved', 2500, 'Controller deleted.');
      }
    } catch (error) {
      console.error('Unable to delete controller and ratings:', error);
      setProfileSyncError(error.message);
      showToast(controller, 'error', 6000, error.message);
    } finally {
      profileMutationLockRef.current = false;
      setProfileSaving(false);
    }
  };

  const confirmPendingDeletion = async () => {
    if (!pendingDeletion || profileSaving) return;
    const deletion = pendingDeletion;
    setPendingDeletion(null);
    if (deletion.type === 'profile') {
      await removeProfile(deletion.profileId);
    } else if (deletion.profileId === activeProfileId) {
      await removeControllerFromProfile(deletion.name);
    }
  };

  const handleRandomiseSlots = () => {
    const controllerCount = activeProfile?.controllers?.length || 0;
    const randomSlots = Array.from(
      { length: controllerCount },
      () => ALL_TOWERS[Math.floor(Math.random() * ALL_TOWERS.length)],
    );
    syncProfileDraftList(randomSlots);
    setManualLocks({});
  };

  // Lock/unlock `tower` as controller `u`'s #1 from the form guide rows.
  const toggleLock = (u, tower) => {
    clickedRowRef.current = {
      user: u,
      tower,
      until: Date.now() + 800,
    };
    setManualLocks((prev) => {
      const next = { ...prev };

      if (next[u] === tower) {
        delete next[u];
      } else {
        const targetSlotsList = targetSlots || [];
        const maxAllowed = targetSlotsList.filter((t) => t === tower).length;

        const otherUsersWithLock = Object.entries(next).filter(
          ([user, lockedTower]) => user !== u && lockedTower === tower,
        );

        if (otherUsersWithLock.length >= maxAllowed && maxAllowed > 0) {
          const [userToUnlock] = otherUsersWithLock[0];
          delete next[userToUnlock];
        }

        next[u] = tower;
      }
      return next;
    });
  };

  const handleSelectTieOption = (idx) => {
    if (!draftResult || idx === selectedOptionIdx) return;
    const prevOption = draftResult.options[selectedOptionIdx] || {};
    const nextOption = draftResult.options[idx] || {};
    const changed = {};
    users.forEach((u) => {
      const from = prevOption[u]?.tower;
      const to = nextOption[u]?.tower;
      if (from && to && from !== to) changed[u] = { from, to };
    });
    setSelectedOptionIdx(idx);
    clearTimeout(tieFlashTimerRef.current);
    setTieFlash({ id: (tieFlash?.id || 0) + 1, users: changed });
    tieFlashTimerRef.current = setTimeout(() => setTieFlash(null), 2200);
  };

  const cloudEnabled = () =>
    GOOGLE_SHEET_API_URL &&
    !GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT');

  const postCloudAction = async (payload, expectedAction) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`${expectedAction} timed out. Please retry.`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
    if (!response.ok) {
      throw new Error(
        `Cloud ${expectedAction} failed with HTTP ${response.status}`,
      );
    }
    const responseText = await response.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      throw new Error(
        `Save service returned an unexpected response for ${expectedAction} (HTTP ${response.status}).`,
      );
    }
    if (result?.status !== 'success' || result?.action !== expectedAction) {
      throw new Error(
        `The save service did not confirm ${expectedAction}. Please retry.`,
      );
    }
    return result;
  };

  const fetchCloudProfiles = async () => {
    if (!cloudEnabled()) return null;

    try {
      const response = await fetch(`${GOOGLE_SHEET_API_URL}?action=profiles`);
      if (!response.ok) {
        throw new Error(`Profile load failed with HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (!payload || !Array.isArray(payload.profiles)) {
        throw new Error('Profile data could not be loaded.');
      }
      const profilesList = payload.profiles;
      const activeId = payload?.activeProfileId || profilesList[0]?.id || null;
      return { profiles: profilesList, activeProfileId: activeId };
    } catch (error) {
      console.error('Unable to load cloud profiles:', error);
      return null;
    }
  };

  const persistCloudProfiles = async (nextProfiles, nextActiveProfileId) => {
    if (!cloudEnabled()) return;

    const snapshot = getProfileSnapshot(nextProfiles);
    if (
      snapshot === lastPersistedProfileSnapshotRef.current ||
      snapshot === queuedProfileSnapshotRef.current
    ) {
      return;
    }
    const profileName =
      nextProfiles.find((profile) => profile.id === nextActiveProfileId)
        ?.name || 'selected profile';
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(nextProfiles));
    localStorage.setItem('atc_active_profile_id', nextActiveProfileId || '');
    setProfileSaving(true);
    try {
      showToast(profileName, 'saving', undefined, 'Saving profile…');
      const savePromise = enqueueCloudAction(
        {
          action: 'saveProfiles',
          profiles: nextProfiles,
          activeProfileId: nextActiveProfileId,
        },
        'saveProfiles',
        profileName,
        `Profile “${profileName}” saved.`,
      );
      queuedProfileSnapshotRef.current = snapshot;
      const saved = await savePromise;
      if (saved) {
        lastPersistedProfileSnapshotRef.current = snapshot;
        setProfileSyncError('');
      }
    } catch (error) {
      console.error('Unable to save cloud profiles:', error);
      setProfileSyncError(error.message);
      showToast(
        profileName,
        'error',
        6000,
        'Could not queue this update locally.',
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const ratingSaveKey = ({ profileId, controller, tower }) =>
    `${profileId}\u0000${controller}\u0000${tower}`;

  // Send one write at a time because the service serializes updates.
  const flushPendingRatingSaves = async () => {
    if (!cloudEnabled()) return;
    if (saveWorkerRef.current) return saveWorkerRef.current;

    const worker = (async () => {
      let lastSavedController = '';
      let savedAny = false;
      while (pendingRatingSavesRef.current.length > 0) {
        if (profileCloudWritable) {
          const controllersByProfile = new Map(
            profiles.map((profile) => [
              String(profile.id),
              new Set(profile.controllers || []),
            ]),
          );
          const pendingBeforeCleanup = pendingRatingSavesRef.current;
          const validPending = pendingBeforeCleanup.filter((pending) =>
            controllersByProfile
              .get(String(pending.profileId))
              ?.has(pending.controller),
          );
          if (validPending.length !== pendingBeforeCleanup.length) {
            const discardedCount =
              pendingBeforeCleanup.length - validPending.length;
            persistPendingRatingSaves(validPending);
            console.warn(
              `Discarded ${discardedCount} queued rating save(s) for removed controllers or profiles.`,
            );
          }
          if (validPending.length === 0) {
            localStorage.removeItem(RATINGS_DIRTY_KEY);
            setSyncStatus('Synced');
            break;
          }
        }

        const batch = [];
        const batchKeys = new Set();
        for (const pending of pendingRatingSavesRef.current) {
          const key = ratingSaveKey(pending);
          if (batchKeys.has(key) || activeSaveKeysRef.current.has(key)) {
            continue;
          }
          batch.push(pending);
          batchKeys.add(key);
        }

        if (batch.length === 0) break;
        batch.forEach((pending) => {
          activeSaveIdsRef.current.add(pending.id);
          activeSaveKeysRef.current.add(ratingSaveKey(pending));
        });
        pendingSavesRef.current += 1;
        try {
          await postCloudAction(
            {
              action: 'saveRatings',
              ratings: batch.map(({ profileId, controller, tower, score }) => ({
                profileId,
                controller,
                tower,
                score,
              })),
            },
            'saveRatings',
          );
          const savedIds = new Set(batch.map((pending) => pending.id));
          persistPendingRatingSaves(
            pendingRatingSavesRef.current.filter(
              (pending) => !savedIds.has(pending.id),
            ),
          );
          lastSavedController = batch[batch.length - 1].controller;
          savedAny = true;
          lastSaveEndRef.current = Date.now();
        } finally {
          batch.forEach((pending) => {
            activeSaveIdsRef.current.delete(pending.id);
            activeSaveKeysRef.current.delete(ratingSaveKey(pending));
          });
          pendingSavesRef.current -= 1;
        }
      }
      if (pendingRatingSavesRef.current.length === 0 && savedAny) {
        localStorage.removeItem(RATINGS_DIRTY_KEY);
        setSyncStatus('Synced');
        clearTimeout(toastTimerRef.current);
        setSaveToast((prev) => ({
          visible: true,
          user: prev.user || lastSavedController,
          status: 'saved',
        }));
        toastTimerRef.current = setTimeout(
          () => setSaveToast((prev) => ({ ...prev, visible: false })),
          2500,
        );
      } else if (pendingRatingSavesRef.current.length > 0) {
        throw new Error('Rating saves are waiting to retry');
      }
    })();

    saveWorkerRef.current = worker;
    try {
      await worker;
    } finally {
      if (saveWorkerRef.current === worker) saveWorkerRef.current = null;
    }
  };

  const queueSave = (payload) => {
    const pending = {
      profileId: activeProfileIdRef.current,
      ...payload,
      id: `${Date.now()}-${Math.random()}`,
    };
    const key = ratingSaveKey(pending);
    const next = [...pendingRatingSavesRef.current];
    let replaceIndex = -1;
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (
        ratingSaveKey(next[index]) === key &&
        !activeSaveIdsRef.current.has(next[index].id)
      ) {
        replaceIndex = index;
        break;
      }
    }
    if (replaceIndex >= 0) {
      next[replaceIndex] = pending;
    } else {
      next.push(pending);
    }
    persistPendingRatingSaves(next);
    saveVersionRef.current += 1;
    return flushPendingRatingSaves();
  };

  const showToast = (user, status, hideAfter, message = '') => {
    clearTimeout(toastTimerRef.current);
    setSaveToast({ visible: true, user, status, message });
    if (hideAfter) {
      toastTimerRef.current = setTimeout(
        () => setSaveToast((prev) => ({ ...prev, visible: false })),
        hideAfter,
      );
    }
  };

  const persistCloudActionQueue = (nextQueue) => {
    localStorage.setItem(CLOUD_ACTION_OUTBOX_KEY, JSON.stringify(nextQueue));
    cloudActionQueueRef.current = nextQueue;
  };

  const flushCloudActionQueue = async () => {
    if (
      !cloudEnabled() ||
      !cloudActionQueueReadyRef.current ||
      !profileCloudReady
    ) {
      return false;
    }
    if (cloudActionWorkerRef.current) return cloudActionWorkerRef.current;

    const worker = (async () => {
      while (cloudActionQueueRef.current.length > 0) {
        const pending = cloudActionQueueRef.current[0];
        try {
          if (
            [
              'deleteController',
              'deleteProfile',
              'renameController',
              'resetRatings',
            ].includes(pending.expectedAction) &&
            saveWorkerRef.current
          ) {
            await saveWorkerRef.current.catch(() => {});
          }
          if (
            [
              'deleteController',
              'deleteProfile',
              'renameController',
              'resetRatings',
            ].includes(pending.expectedAction)
          ) {
            const { profileId, controller, oldName, newName } = pending.payload;
            const nextPendingSaves = pendingRatingSavesRef.current.flatMap(
              (rating) => {
                if (rating.profileId !== profileId) return [rating];
                if (
                  pending.expectedAction === 'deleteProfile' ||
                  ((pending.expectedAction === 'deleteController' ||
                    pending.expectedAction === 'resetRatings') &&
                    rating.controller === controller)
                ) {
                  return [];
                }
                if (
                  pending.expectedAction === 'renameController' &&
                  rating.controller === oldName
                ) {
                  return [{ ...rating, controller: newName }];
                }
                return [rating];
              },
            );
            if (
              nextPendingSaves.length !==
                pendingRatingSavesRef.current.length ||
              nextPendingSaves.some(
                (rating, index) =>
                  rating.controller !==
                  pendingRatingSavesRef.current[index]?.controller,
              )
            ) {
              persistPendingRatingSaves(nextPendingSaves);
            }
          }
          await postCloudAction(pending.payload, pending.expectedAction);
          persistCloudActionQueue(
            cloudActionQueueRef.current.filter(
              (entry) => entry.id !== pending.id,
            ),
          );
          if (pending.expectedAction === 'saveProfiles') {
            lastPersistedProfileSnapshotRef.current = getProfileSnapshot(
              pending.payload.profiles,
            );
          }
          if (
            [
              'deleteController',
              'deleteProfile',
              'renameController',
              'resetRatings',
            ].includes(pending.expectedAction) &&
            pendingRatingSavesRef.current.length === 0
          ) {
            localStorage.removeItem(RATINGS_DIRTY_KEY);
          }
          setSyncStatus('Synced');
          showToast(
            pending.subject || 'Update',
            'saved',
            2500,
            pending.successMessage || 'Changes saved.',
          );
        } catch (error) {
          console.error(
            `Unable to save ${pending.expectedAction}; keeping it queued locally:`,
            error,
          );
          setSyncStatus('Offline');
          showToast(
            pending.subject || 'Update',
            'queued',
            5000,
            'Saved offline.',
          );
          return false;
        }
      }
      return true;
    })();

    cloudActionWorkerRef.current = worker;
    try {
      return await worker;
    } finally {
      if (cloudActionWorkerRef.current === worker) {
        cloudActionWorkerRef.current = null;
      }
    }
  };

  const enqueueCloudAction = (
    payload,
    expectedAction,
    subject = 'Update',
    successMessage = 'Changes saved.',
  ) => {
    if (!cloudEnabled()) return Promise.resolve(false);

    const nextQueue = [
      ...cloudActionQueueRef.current,
      {
        id: `${Date.now()}-${Math.random()}`,
        payload,
        expectedAction,
        subject,
        successMessage,
      },
    ];
    persistCloudActionQueue(nextQueue);
    setSyncStatus('Saving…');
    return flushCloudActionQueue();
  };

  const handleRatingChange = async (tower, score) => {
    const activeUser = currentUser;
    if (!activeUser || !activeProfileControllers.includes(activeUser)) return;
    const prev = ratingsRef.current;
    if (prev[activeUser]?.[tower] === score) return;

    // Always build on the latest ratings so fast clicks never undo each other
    const updated = {
      ...prev,
      [activeUser]: { ...(prev[activeUser] || {}), [tower]: score },
    };
    applyRatings(updated);
    persistLocalRatings(updated);

    if (!cloudEnabled()) {
      showToast(activeUser, 'saved', 2500);
      return;
    }

    showToast(activeUser, 'saving');
    setSyncStatus('Saving...');
    try {
      await queueSave({
        profileId: activeProfileId,
        controller: activeUser,
        tower,
        score,
      });
      if (pendingRatingSavesRef.current.length === 0) {
        setSyncStatus('Synced');
        showToast(activeUser, 'saved', 2500);
      }
    } catch (err) {
      console.error('Rating save remains queued locally:', err);
      setSyncStatus('Offline');
      showToast(activeUser, 'queued', 6000);
    }
  };

  const confirmResetUserRatings = async () => {
    setShowResetModal(false);
    const activeUser = currentUser;
    if (!activeUser || !activeProfileControllers.includes(activeUser)) return;
    showToast(activeUser, 'saving', undefined, 'Deleting ratings…');
    try {
      const nextPendingSaves = pendingRatingSavesRef.current.filter(
        (pending) =>
          pending.profileId !== activeProfileId ||
          pending.controller !== activeUser,
      );
      persistPendingRatingSaves(nextPendingSaves);
      const updated = { ...ratingsRef.current };
      delete updated[activeUser];
      applyRatings(updated);
      persistLocalRatings(updated);
      if (cloudEnabled()) {
        await enqueueCloudAction(
          {
            action: 'resetRatings',
            profileId: activeProfileId,
            controller: activeUser,
          },
          'resetRatings',
          activeUser,
          'Ratings reset.',
        );
      } else {
        setSyncStatus('Local Mode');
        showToast(activeUser, 'saved', 2500, 'Ratings reset.');
      }
    } catch (err) {
      console.error('Unable to reset controller ratings:', err);
      setSyncStatus('Sync Error');
      showToast(activeUser, 'error', 6000, err.message);
    }
  };

  // Save many ratings at once (used by the Help Me Decide helper)
  const handleBulkRatings = async (map) => {
    const activeUser = currentUser;
    if (!activeUser || !activeProfileControllers.includes(activeUser)) return;
    const prev = ratingsRef.current;
    const updated = {
      ...prev,
      [activeUser]: { ...(prev[activeUser] || {}), ...map },
    };
    applyRatings(updated);
    persistLocalRatings(updated);

    if (!cloudEnabled()) {
      showToast(activeUser, 'saved', 2500);
      return;
    }

    showToast(activeUser, 'saving');
    setSyncStatus('Saving...');
    try {
      await Promise.all(
        Object.entries(map).map(([tower, score]) =>
          queueSave({
            profileId: activeProfileId,
            controller: activeUser,
            tower,
            score,
          }),
        ),
      );
      if (pendingRatingSavesRef.current.length === 0) {
        setSyncStatus('Synced');
        showToast(activeUser, 'saved', 2500);
      }
    } catch (err) {
      console.error('Bulk rating save remains queued locally:', err);
      setSyncStatus('Offline');
      showToast(activeUser, 'queued', 6000);
    }
  };

  const getRatedCount = (user) => {
    const userRatings = ratings[user] || {};
    return Object.values(userRatings).filter((score) => score > 0).length;
  };

  // Unrated towers count as DEFAULT_SCORE (3)
  const getScore = (user, tower) => {
    const s = ratings[user]?.[tower];
    return s > 0 ? s : DEFAULT_SCORE;
  };

  // Metrics calculation. Unrated towers count as 3 for everyone.
  const towerMetrics = ALL_TOWERS.map((tower) => {
    let explicitCount = 0;
    const scores = [];
    const highScorers = [];

    users.forEach((u) => {
      const s = ratings[u]?.[tower];
      if (s > 0) {
        explicitCount++;
        if (s >= 4) highScorers.push(u);
      }
      scores.push(s > 0 ? s : DEFAULT_SCORE);
    });
    const avg = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : DEFAULT_SCORE;
    const variance = scores.length
      ? scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
        scores.length
      : 0;

    const meta = TOWER_METADATA[tower];

    return {
      tower,
      category: meta.category,
      state: meta.state,
      avg: avg.toFixed(2),
      rawAvg: avg,
      ratingsCount: explicitCount,
      variance: parseFloat(variance.toFixed(2)),
      highScorers,
      scoresMap: users.reduce(
        (acc, u, idx) => ({ ...acc, [u]: scores[idx] }),
        {},
      ),
    };
  });

  // Hot to Not rows with search & category filtering applied
  const matrixRows = [...towerMetrics]
    .filter((stats) => {
      if (
        matrixCategoryFilter !== 'All' &&
        stats.category !== matrixCategoryFilter
      ) {
        return false;
      }
      if (matrixSearch) {
        const query = matrixSearch.toLowerCase();
        const matchName = stats.tower.toLowerCase().includes(query);
        const matchState = stats.state.toLowerCase().includes(query);
        const matchCat = stats.category.toLowerCase().includes(query);
        if (!matchName && !matchState && !matchCat) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const { key, dir } = matrixSort;
      if (key === 'tower') {
        const c = a.tower.localeCompare(b.tower);
        return dir === 'asc' ? c : -c;
      }
      const valueOf = (m) => {
        if (key === 'avg') return m.ratingsCount > 0 ? m.rawAvg : null;
        return ratings[key]?.[m.tower] > 0 ? ratings[key][m.tower] : null;
      };
      const va = valueOf(a);
      const vb = valueOf(b);
      if (va === null && vb === null) return a.tower.localeCompare(b.tower);
      if (va === null) return 1;
      if (vb === null) return -1;
      if (va !== vb) return dir === 'asc' ? va - vb : vb - va;
      return (
        b.rawAvg - a.rawAvg ||
        b.ratingsCount - a.ratingsCount ||
        a.tower.localeCompare(b.tower)
      );
    });

  const handleMatrixSort = (key) => {
    setMatrixSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'tower' ? 'asc' : 'desc' },
    );
  };

  const matrixAriaSort = (key) =>
    matrixSort.key === key
      ? matrixSort.dir === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';

  const matrixSortIcon = (key) =>
    matrixSort.key === key ? (matrixSort.dir === 'asc' ? '▲' : '▼') : '↕';

  // Summary for a group of towers (a tower type or a state)
  const nearlyEqual = (a, b) => Math.abs(a - b) < 1e-9;
  const joinNames = (names) =>
    names.length === users.length ? 'All tied' : names.join(', ');

  const groupSummary = (items) => {
    const anyRated = items.some((m) => m.ratingsCount > 0);
    const sorted = [...items].sort(
      (a, b) =>
        b.rawAvg - a.rawAvg ||
        b.ratingsCount - a.ratingsCount ||
        a.tower.localeCompare(b.tower),
    );
    const avg = items.length
      ? items.reduce((sum, m) => sum + m.rawAvg, 0) / items.length
      : 0;

    let topController = 'N/A';
    let lowestController = 'N/A';
    if (anyRated && items.length > 0) {
      const perUser = users.map((u) => ({
        user: u,
        avg:
          items.reduce((sum, m) => sum + getScore(u, m.tower), 0) /
          items.length,
      }));
      const hi = Math.max(...perUser.map((p) => p.avg));
      const lo = Math.min(...perUser.map((p) => p.avg));
      topController = joinNames(
        perUser.filter((p) => nearlyEqual(p.avg, hi)).map((p) => p.user),
      );
      lowestController = joinNames(
        perUser.filter((p) => nearlyEqual(p.avg, lo)).map((p) => p.user),
      );
    }

    return {
      avg,
      topTower: anyRated ? sorted[0].tower : 'N/A',
      bottomPick:
        anyRated && items.length > 1 ? sorted[sorted.length - 1].tower : 'N/A',
      topController,
      lowestController,
    };
  };

  const groupRows = (g) => {
    const rows = [
      {
        label: g.count === 1 ? 'Tower' : 'Top Pick',
        value: g.topTower,
        tone: 'text-emerald-400',
      },
    ];
    if (g.count > 1) {
      rows.push({
        label: 'Bottom Pick',
        value: g.bottomPick,
        tone: 'text-rose-400',
      });
    }
    rows.push(
      { label: 'Top Rated', value: g.topController, tone: 'text-sky-300' },
      {
        label: 'Bottom Rated',
        value: g.lowestController,
        tone: 'text-orange-300',
      },
    );
    return rows;
  };

  const categoriesList = ['Radar', 'Regional', 'Metro D'];
  const categoryStats = categoriesList
    .map((cat) => {
      const items = towerMetrics.filter((m) => m.category === cat);
      const g = groupSummary(items);
      return {
        ...g,
        category: cat,
        count: items.length,
        avg: g.avg.toFixed(2),
      };
    })
    .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

  const statesList = ['NSW', 'QLD', 'VIC', 'WA', 'SA', 'TAS', 'NT', 'ACT'];
  const stateStats = statesList
    .map((st) => {
      const items = towerMetrics.filter((m) => m.state === st);
      const g = groupSummary(items);
      return { ...g, state: st, count: items.length, avg: g.avg.toFixed(2) };
    })
    .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

  // ---- Trivia ----
  // Unrated towers count as 3, so every controller can contribute immediately.
  const eligibleUsers = users;
  const noControllerMessage = 'Add a controller to see results.';
  const noTowerRatingsMessage = users.length
    ? 'Rate any tower to see this stat.'
    : noControllerMessage;
  const meanOf = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const spreadOf = (arr) => {
    const m = meanOf(arr);
    return meanOf(arr.map((v) => (v - m) * (v - m)));
  };
  const scoresOf = (u) => ALL_TOWERS.map((t) => getScore(u, t));

  // Best (or worst) controller(s) by a value. Ties are all returned.
  const rankUsers = (valueOf, mode) => {
    if (eligibleUsers.length === 0) return null;
    const vals = eligibleUsers.map((u) => ({ user: u, value: valueOf(u) }));
    const target = Math[mode](...vals.map((v) => v.value));
    const winners = vals.filter((v) => nearlyEqual(v.value, target));
    return { name: winners.map((v) => v.user).join(', '), value: target };
  };

  // Best (or worst) pair of controllers by average gap
  const rankPairs = (mode) => {
    let best = null;
    for (let i = 0; i < eligibleUsers.length; i++) {
      for (let j = i + 1; j < eligibleUsers.length; j++) {
        const a = scoresOf(eligibleUsers[i]);
        const b = scoresOf(eligibleUsers[j]);
        const gap = meanOf(a.map((v, k) => Math.abs(v - b[k])));
        const same = a.filter((v, k) => v === b[k]).length;
        const better =
          !best || (mode === 'min' ? gap < best.gap : gap > best.gap);
        if (better) {
          best = {
            name: `${eligibleUsers[i]} & ${eligibleUsers[j]}`,
            gap,
            same,
          };
        }
      }
    }
    return best;
  };

  const towerBadges = (m) =>
    m
      ? [
          <CategoryBadge key='c' category={m.category} />,
          <StateBadge key='s' state={m.state} />,
        ]
      : null;

  const polarisedPool = towerMetrics.filter((m) => m.ratingsCount > 0);
  const mostDivisive = [...polarisedPool].sort(
    (a, b) => b.variance - a.variance || b.ratingsCount - a.ratingsCount,
  )[0];
  const mostAgreed = [...polarisedPool].sort(
    (a, b) =>
      a.variance - b.variance ||
      b.rawAvg - a.rawAvg ||
      b.ratingsCount - a.ratingsCount,
  )[0];
  const pct = (n) => `${Math.round((n / ALL_TOWERS.length) * 100)}%`;

  const generous = rankUsers((u) => meanOf(scoresOf(u)), 'max');
  const critic = rankUsers((u) => meanOf(scoresOf(u)), 'min');
  const consistent = rankUsers((u) => spreadOf(scoresOf(u)), 'min');
  const extreme = rankUsers((u) => spreadOf(scoresOf(u)), 'max');
  const groupDistance = (u) =>
    meanOf(towerMetrics.map((m) => Math.abs(getScore(u, m.tower) - m.rawAvg)));
  const groupMind = rankUsers(groupDistance, 'min');
  const loneWolf = rankUsers(groupDistance, 'max');
  const twins = rankPairs('min');
  const opposites = rankPairs('max');

  const triviaSections = [
    {
      title: 'Tower Vibes',
      blurb: 'What the network loves and lootes.',
      cards: [
        {
          icon: '👑',
          tint: 'amber',
          title: 'The Golden Child',
          subtitle: 'The tower everyone wants.',
          name: activeProfileControllers.length
            ? [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0]?.tower ||
              'N/A'
            : 'N/A',
          detail: activeProfileControllers.length ? null : noControllerMessage,
          badges: towerBadges(
            activeProfileControllers.length
              ? [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0]
              : null,
          ),
          label: 'Average',
          value: activeProfileControllers.length
            ? [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0]?.avg ||
              '0.00'
            : '—',
        },
        {
          icon: '💀',
          tint: 'red',
          title: 'The Exiled One',
          subtitle: 'Nobody wants to roster here.',
          name: activeProfileControllers.length
            ? [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0]?.tower ||
              'N/A'
            : 'N/A',
          detail: activeProfileControllers.length ? null : noControllerMessage,
          badges: towerBadges(
            activeProfileControllers.length
              ? [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0]
              : null,
          ),
          label: 'Average',
          value: activeProfileControllers.length
            ? [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0]?.avg ||
              '0.00'
            : '—',
        },
        {
          icon: '💥',
          tint: 'orange',
          title: 'The Battlefield',
          subtitle: 'Causing full-scale office wars.',
          name: mostDivisive ? mostDivisive.tower : 'N/A',
          badges: towerBadges(mostDivisive),
          detail: mostDivisive ? null : noTowerRatingsMessage,
          label: 'Spread',
          value: mostDivisive ? mostDivisive.variance.toFixed(2) : '0.00',
        },
        {
          icon: '🦄',
          tint: 'teal',
          title: 'The Unicorn',
          subtitle: 'Miraculously, everyone agrees.',
          name: mostAgreed ? mostAgreed.tower : 'N/A',
          badges: towerBadges(mostAgreed),
          detail: mostAgreed ? null : noTowerRatingsMessage,
          label: 'Spread',
          value: mostAgreed ? mostAgreed.variance.toFixed(2) : '0.00',
        },
      ],
    },
    {
      title: 'Controller Personas',
      blurb: 'How everyone approaches scoring.',
      cards: [
        {
          icon: '🍩',
          tint: 'sky',
          title: 'Sugar Coater',
          subtitle: 'Thinks every tower is amazing.',
          name: generous ? generous.name : 'N/A',
          detail: generous ? null : noControllerMessage,
          label: 'Average',
          value: generous ? generous.value.toFixed(2) : '0.00',
        },
        {
          icon: '🍋',
          tint: 'emerald',
          title: 'Master Grumpy',
          subtitle: 'Hard to please, hates everything.',
          name: critic ? critic.name : 'N/A',
          detail: critic ? null : noControllerMessage,
          label: 'Average',
          value: critic ? critic.value.toFixed(2) : '0.00',
        },
        {
          icon: '😐',
          tint: 'violet',
          title: 'Captain Neutral',
          subtitle: 'Refuses to have strong opinions.',
          name: consistent ? consistent.name : 'N/A',
          detail: consistent ? null : noControllerMessage,
          label: 'Swing',
          value: consistent ? consistent.value.toFixed(2) : '0.00',
        },
        {
          icon: '🎢',
          tint: 'fuchsia',
          title: 'Pure Chaos',
          subtitle: 'Either loves it or despises it.',
          name: extreme ? extreme.name : 'N/A',
          detail: extreme ? null : noControllerMessage,
          label: 'Swing',
          value: extreme ? extreme.value.toFixed(2) : '0.00',
        },
      ],
    },
    {
      title: 'Team Dynamics',
      blurb: 'Who matches and who clashes.',
      cards: [
        {
          icon: '👯',
          tint: 'cyan',
          title: 'Partner in Crime',
          subtitle: 'Sharing the exact same brain.',
          name: twins ? twins.name : 'N/A',
          detail: twins
            ? `${twins.same}/${ALL_TOWERS.length} towers match`
            : users.length < 2
              ? 'Add another controller to compare.'
              : noControllerMessage,
          label: 'Gap',
          value: twins ? twins.gap.toFixed(2) : '0.00',
        },
        {
          icon: '⚡',
          tint: 'purple',
          title: 'Oil & Water',
          subtitle: 'Completely opposite tastes.',
          name: opposites ? opposites.name : 'N/A',
          detail: opposites
            ? `${opposites.same}/${ALL_TOWERS.length} towers match`
            : users.length < 2
              ? 'Add another controller to compare.'
              : noControllerMessage,
          label: 'Gap',
          value: opposites ? opposites.gap.toFixed(2) : '0.00',
        },
        {
          icon: '🐑',
          tint: 'indigo',
          title: 'The Pleaser',
          subtitle: 'Sticks right to the group vibe.',
          name: groupMind ? groupMind.name : 'N/A',
          detail: groupMind ? null : noControllerMessage,
          label: 'Gap',
          value: groupMind ? groupMind.value.toFixed(2) : '0.00',
        },
        {
          icon: '🐱',
          tint: 'rose',
          title: 'Lone Cat',
          subtitle: 'Doing their own totally random thing.',
          name: loneWolf ? loneWolf.name : 'N/A',
          detail: loneWolf ? null : noControllerMessage,
          label: 'Gap',
          value: loneWolf ? loneWolf.value.toFixed(2) : '0.00',
        },
      ],
    },
  ];

  // Optimal Draft Permutation Engine with Frequency-Validated Locks
  const runOptimalDraft = () => {
    const slots = targetSlots || [];
    if (slots.length === 0 || users.length === 0) {
      lastDraftKeyRef.current = null;
      setDraftResult(null);
      setSelectedOptionIdx(0);
      return;
    }

    // Count how many times each tower appears in the target slots
    const slotTowerCounts = {};
    slots.forEach((t) => {
      slotTowerCounts[t] = (slotTowerCounts[t] || 0) + 1;
    });

    // Validate manual locks: ensure no tower is locked more times than it exists in slots
    const validManualLocks = {};
    const lockedTowerCounts = {};
    users.forEach((u) => {
      const locked = manualLocks[u];
      if (locked) {
        lockedTowerCounts[locked] = (lockedTowerCounts[locked] || 0) + 1;
        if (lockedTowerCounts[locked] <= (slotTowerCounts[locked] || 0)) {
          validManualLocks[u] = locked;
        }
      }
    });

    let bestGlobalScore = -Infinity;
    let optimalTopChoiceOptions = [];

    const searchAssignments = (
      userIndex,
      currentAssignments,
      usedSlotIndices,
      currentScore,
    ) => {
      if (userIndex === users.length) {
        if (currentScore > bestGlobalScore) {
          bestGlobalScore = currentScore;
          optimalTopChoiceOptions = [[...currentAssignments]];
        } else if (currentScore === bestGlobalScore) {
          optimalTopChoiceOptions.push([...currentAssignments]);
        }
        return;
      }

      const u = users[userIndex];
      const lockedTower = validManualLocks[u];

      if (lockedTower) {
        let found = false;
        for (let sIdx = 0; sIdx < slots.length; sIdx++) {
          if (!usedSlotIndices.has(sIdx) && slots[sIdx] === lockedTower) {
            found = true;
            usedSlotIndices.add(sIdx);
            const score = getScore(u, lockedTower);
            currentAssignments.push({
              slotIndex: sIdx,
              tower: lockedTower,
              score,
            });

            searchAssignments(
              userIndex + 1,
              currentAssignments,
              usedSlotIndices,
              currentScore + score,
            );

            currentAssignments.pop();
            usedSlotIndices.delete(sIdx);
            break;
          }
        }
        if (!found) return;
        return;
      }

      for (let sIdx = 0; sIdx < slots.length; sIdx++) {
        if (!usedSlotIndices.has(sIdx)) {
          usedSlotIndices.add(sIdx);
          const tower = slots[sIdx];
          const score = getScore(u, tower);

          currentAssignments.push({ slotIndex: sIdx, tower, score });
          searchAssignments(
            userIndex + 1,
            currentAssignments,
            usedSlotIndices,
            currentScore + score,
          );
          currentAssignments.pop();
          usedSlotIndices.delete(sIdx);
        }
      }
    };

    searchAssignments(0, [], new Set(), 0);

    const formattedOptions = optimalTopChoiceOptions.map((assignmentList) => {
      const assignments = {};
      assignmentList.forEach((item, idx) => {
        const u = users[idx];
        assignments[u] = {
          slotIndex: item.slotIndex,
          tower: item.tower,
          score: item.score,
        };
      });
      return assignments;
    });

    // Options that give every controller the same towers look identical, so keep one
    const seenOptions = new Set();
    const uniqueOptions = [];
    formattedOptions.forEach((opt) => {
      const sig = users.map((u) => opt[u]?.tower).join('|');
      if (!seenOptions.has(sig)) {
        seenOptions.add(sig);
        uniqueOptions.push(opt);
      }
    });

    const nextOptions = uniqueOptions.length > 0 ? uniqueOptions : [{}];
    const draftKey = JSON.stringify([bestGlobalScore, nextOptions]);
    if (draftKey === lastDraftKeyRef.current) return;
    lastDraftKeyRef.current = draftKey;

    setDraftResult({
      totalScore: bestGlobalScore,
      averageScore: (bestGlobalScore / users.length).toFixed(2),
      options: nextOptions,
    });
    setSelectedOptionIdx(0);

    // Flash the placement cards whose tower changed (any redraft, not just locks)
    const changed = {};
    if (draftResult) {
      const prevOption = draftResult.options?.[selectedOptionIdx] || {};
      const nextOption = nextOptions[0] || {};
      users.forEach((u) => {
        const from = prevOption[u]?.tower;
        const to = nextOption[u]?.tower;
        if (from && to && from !== to) {
          changed[u] = { from, to };
        }
      });
    }
    clearTimeout(tieFlashTimerRef.current);
    if (Object.keys(changed).length > 0) {
      setTieFlash((prev) => ({ id: (prev?.id || 0) + 1, users: changed }));
      tieFlashTimerRef.current = setTimeout(() => setTieFlash(null), 2200);
    } else {
      setTieFlash(null);
    }
  };

  useEffect(() => {
    runOptimalDraft();
  }, [targetSlots, ratings, manualLocks]);

  // The ordered tower list shown in each controller's form guide
  const buildFormItems = (u) => {
    const uniqueTargetTowers = [...new Set(targetSlots || [])];
    const currentLock = manualLocks[u];
    const assignedTowerName =
      draftResult?.options?.[selectedOptionIdx]?.[u]?.tower;

    // #1 is the calculated placement (or the manual lock if set)
    const topTowerName = currentLock || assignedTowerName;

    const otherTowers = uniqueTargetTowers
      .filter((t) => t !== topTowerName)
      .map((tower) => ({
        tower,
        score: getScore(u, tower),
        meta: TOWER_METADATA[tower] || { state: 'VIC' },
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.tower.localeCompare(b.tower);
      });

    return [
      {
        tower: topTowerName,
        score: getScore(u, topTowerName),
        isAssigned: topTowerName === assignedTowerName,
        meta: TOWER_METADATA[topTowerName] || { state: 'VIC' },
      },
      ...otherTowers.map((item) => ({
        ...item,
        isAssigned: item.tower === assignedTowerName,
      })),
    ];
  };

  // Flash (yellow) any form row that changes position, whatever caused it:
  // locking, clearing locks, tied options, new ratings or a new target list.
  const formOrders = draftResult
    ? users.reduce(
        (acc, u) => ({ ...acc, [u]: buildFormItems(u).map((i) => i.tower) }),
        {},
      )
    : null;
  const formOrdersKey = JSON.stringify(formOrders);

  useEffect(() => {
    if (!formOrders) return;
    const prev = prevFormOrdersRef.current;
    prevFormOrdersRef.current = formOrders;
    if (!prev) return;

    const click = clickedRowRef.current;
    const recentClick = click && Date.now() < click.until;
    const rows = {};
    let any = false;
    users.forEach((u) => {
      const before = prev[u] || [];
      (formOrders[u] || []).forEach((tower, i) => {
        const was = before.indexOf(tower);
        if (was === -1 || was === i) return;
        // The row that was just clicked doesn't flash
        if (recentClick && click.user === u && click.tower === tower) return;
        rows[u] = (rows[u] || []).concat(tower);
        any = true;
      });
    });

    clearTimeout(rowFlashTimerRef.current);
    if (any) {
      setRowFlash((p) => ({ id: (p?.id || 0) + 1, rows }));
      rowFlashTimerRef.current = setTimeout(() => setRowFlash(null), 2200);
    }
  }, [formOrdersKey]);

  const getHeatmapClass = (score) => {
    if (score === 5)
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (score === 4)
      return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
    if (score === 3)
      return 'bg-slate-800/80 text-slate-300 border border-slate-700/60';
    if (score === 2)
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    if (score === 1)
      return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-slate-900/60 text-slate-400 border border-slate-800/80';
  };

  return (
    <div className='max-w-7xl mx-auto p-4 md:p-8 font-sans text-slate-100 antialiased relative min-h-screen bg-slate-950 flex flex-col'>
      {/* Rating save status */}
      <div
        role='status'
        aria-live='polite'
        className={`fixed bottom-5 right-5 z-[80] transition-all duration-300 transform ${
          saveToast.visible
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-3 opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className='max-w-sm bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3'>
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 ${
              saveToast.status === 'saved'
                ? 'bg-emerald-500/15 border-emerald-500/30'
                : saveToast.status === 'error'
                  ? 'bg-rose-500/15 border-rose-500/30'
                  : saveToast.status === 'queued'
                    ? 'bg-amber-500/15 border-amber-500/30'
                    : 'bg-sky-500/15 border-sky-500/30'
            }`}
          >
            {saveToast.status === 'error' ? (
              <span className='text-rose-300 font-black'>!</span>
            ) : saveToast.status === 'queued' ? (
              <span className='text-amber-300 font-black'>!</span>
            ) : saveToast.status === 'saved' ? (
              <svg
                className='w-4 h-4 text-emerald-400'
                fill='none'
                stroke='currentColor'
                viewBox='0 0 24 24'
              >
                <path
                  strokeLinecap='round'
                  strokeLinejoin='round'
                  strokeWidth='2.5'
                  d='M5 13l4 4L19 7'
                ></path>
              </svg>
            ) : (
              <svg
                className={`w-4 h-4 ${
                  saveToast.status === 'saving'
                    ? 'animate-spin text-sky-400'
                    : 'text-amber-300'
                }`}
                fill='none'
                viewBox='0 0 24 24'
              >
                <circle
                  className='opacity-25'
                  cx='12'
                  cy='12'
                  r='10'
                  stroke='currentColor'
                  strokeWidth='4'
                ></circle>
                <path
                  className='opacity-75'
                  fill='currentColor'
                  d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
                ></path>
              </svg>
            )}
          </div>

          <div className='min-w-0 flex-1'>
            <p className='text-sm font-bold text-slate-100'>
              {saveToast.message ||
                (saveToast.status === 'saved'
                  ? 'Rating saved'
                  : saveToast.status === 'queued'
                    ? 'Sync paused'
                    : saveToast.status === 'error'
                      ? 'Update failed'
                      : 'Saving rating')}
            </p>
            <p className='mt-0.5 text-xs text-slate-400'>
              {saveToast.status === 'queued'
                ? 'Will retry automatically.'
                : saveToast.status === 'error'
                  ? 'Check your connection and retry.'
                  : saveToast.status === 'saving'
                    ? 'Syncing…'
                    : cloudEnabled()
                      ? 'Synced'
                      : 'Saved on this device'}
            </p>
          </div>
          <button
            type='button'
            aria-label='Dismiss save status'
            onClick={() => {
              clearTimeout(toastTimerRef.current);
              setSaveToast((prev) => ({ ...prev, visible: false }));
            }}
            className='-mr-1 -mt-1 rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
          >
            <span aria-hidden='true'>×</span>
          </button>
        </div>
      </div>

      {/* Header */}
      <header className='mb-4 flex flex-col gap-5 rounded-3xl border border-slate-800/80 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between md:p-6'>
        <div className='min-w-0'>
          <h1 className='text-2xl md:text-3xl font-black text-sky-400 tracking-tight'>
            ATC Tower Consensus & Draft
          </h1>
          <p className='mt-1 text-sm text-slate-400'>
            Tower ratings and team draft planning
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2.5' aria-live='polite'>
          <button
            type='button'
            onClick={() => setShowProfileModal(true)}
            aria-label='Manage profiles'
            className='inline-flex h-[34px] min-w-0 items-center gap-2 rounded-full border border-slate-800 bg-slate-950 px-3 text-xs font-bold text-slate-300 transition hover:border-sky-700 hover:bg-slate-950'
          >
            <span aria-hidden='true' className='shrink-0 text-sm'>
              👥
            </span>
            <span className='max-w-40 truncate'>
              {activeProfile?.name || 'Profile'}
            </span>
            <span
              aria-hidden='true'
              className='shrink-0 text-[10px] text-slate-500'
            >
              ⌄
            </span>
          </button>
          <span className='flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-bold text-slate-300 shadow-inner'>
            <span
              className={`h-2 w-2 rounded-full ${syncStatus === 'Synced' ? 'bg-emerald-400' : syncStatus === 'Offline' || syncStatus === 'Sync Error' ? 'bg-rose-400' : 'bg-amber-400'}`}
            ></span>
            {syncStatus}
          </span>
        </div>
      </header>

      <section
        aria-labelledby='controllers-heading'
        className='controller-picker mb-6 rounded-3xl border border-slate-800/80 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 p-4 shadow-xl md:p-5'
      >
        <div className='app-section-header controller-picker-heading'>
          <div className='min-w-0'>
            <h2 id='controllers-heading' className='app-section-heading-title'>
              🎛️ Choose a controller
            </h2>
            <p className='app-section-heading-description'>
              Select who you’re rating as.
            </p>
          </div>
          <div className='controller-picker-summary'>
            <span className='controller-picker-count'>
              {activeProfile?.name || 'Profile'} ·{' '}
              {activeProfileControllers.length}{' '}
              {activeProfileControllers.length === 1
                ? 'controller'
                : 'controllers'}
            </span>
            <span
              className={`controller-picker-active ${!hasSelectedController ? 'is-empty' : ''}`}
            >
              {hasSelectedController
                ? `Rating as ${currentUser}`
                : 'No controller selected'}
            </span>
          </div>
        </div>

        {activeProfileControllers.length === 0 ? (
          <div className='mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-4'>
            <p className='text-sm text-slate-400'>
              Add a controller to this profile to start rating towers.
            </p>
            <button
              type='button'
              onClick={() => setShowProfileModal(true)}
              className='rounded-xl border border-sky-700/80 bg-sky-950/70 px-3 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-900'
            >
              Add controller
            </button>
          </div>
        ) : (
          <div className='controller-picker-grid mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6'>
            {activeProfileControllers.map((u) => {
              const ratedCount = getRatedCount(u);
              const pct = Math.round((ratedCount / ALL_TOWERS.length) * 100);
              const isComplete = ratedCount === ALL_TOWERS.length;
              const isActive = currentUser === u;
              return (
                <button
                  key={u}
                  onClick={() => setCurrentUser(u)}
                  aria-pressed={isActive}
                  aria-label={`Select ${u}. Progress: ${ratedCount} of ${ALL_TOWERS.length} towers rated.`}
                  className={`group relative overflow-hidden rounded-2xl border p-3 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
                    isActive
                      ? 'border-sky-500/70 bg-sky-950/50 shadow-lg shadow-sky-950/30'
                      : 'border-slate-800 bg-slate-950/50 hover:border-slate-700 hover:bg-slate-900'
                  }`}
                >
                  <div className='flex min-w-0 items-center gap-2.5'>
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-sm font-black ${isActive ? 'border-sky-700/70 bg-sky-900/80 text-sky-200' : 'border-slate-700 bg-slate-900 text-slate-400'}`}
                    >
                      {u.trim().charAt(0).toUpperCase()}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span
                        className={`block truncate text-sm font-bold ${isActive ? 'text-sky-200' : 'text-slate-200'}`}
                      >
                        {u}
                      </span>
                      <span className='mt-0.5 block text-[10px] font-medium text-slate-500'>
                        {isActive ? 'Currently rating' : 'Select controller'}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-mono font-bold ${isComplete ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}
                    >
                      {ratedCount}/{ALL_TOWERS.length}
                    </span>
                  </div>
                  <div className='mt-3 h-1 w-full overflow-hidden rounded-full bg-slate-800'>
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-emerald-400' : 'bg-sky-500'}`}
                      style={{ width: `${pct}%` }}
                    ></div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {showProfileModal &&
        ReactDOM.createPortal(
          <div className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md'>
            <PlainCard
              role='dialog'
              aria-modal='true'
              aria-labelledby='profile-manager-title'
              aria-busy={profileSaving}
              className='profile-manager-dialog my-auto max-h-[92vh] w-full max-w-5xl overflow-y-auto bg-slate-900 shadow-2xl'
              lead={
                <IconBox className='bg-sky-950/70 border-sky-800/70 text-sky-200'>
                  👥
                </IconBox>
              }
              title={<span id='profile-manager-title'>Profile Manager</span>}
              aside={
                <button
                  type='button'
                  onClick={() => setShowProfileModal(false)}
                  disabled={profileSaving}
                  className='rounded-2xl bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40'
                >
                  ✕ Close
                </button>
              }
              bodyClassName='px-5 pb-5 pt-4 sm:px-7 sm:pb-7'
            >
              <p className='mb-4 text-sm text-slate-400'>
                Switch profiles, update names, and manage controllers.
              </p>
              {profileSyncError && (
                <div
                  role='alert'
                  className='mt-4 rounded-xl border border-rose-700/70 bg-rose-950/50 px-3 py-2 text-xs text-rose-200'
                >
                  {profileSyncError}
                </div>
              )}

              <div className='mt-5 grid items-start gap-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]'>
                <div className='space-y-4'>
                  <div className='overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-950/80'>
                    <div className='flex items-center justify-between border-b border-slate-800 px-4 py-3'>
                      <div>
                        <h4 className='text-sm font-bold text-slate-100'>
                          Your profiles
                        </h4>
                        <p className='mt-0.5 text-[11px] text-slate-500'>
                          Select a profile to manage its controllers.
                        </p>
                      </div>
                      <span className='text-xs font-mono text-slate-400'>
                        {profiles.length}
                      </span>
                    </div>
                    {profiles.map((profile) => {
                      const isActive = profile.id === activeProfileId;
                      return (
                        <button
                          type='button'
                          key={profile.id}
                          onClick={() => setActiveProfileId(profile.id)}
                          disabled={profileSaving}
                          aria-pressed={isActive}
                          className={`flex w-full items-center justify-between gap-3 border-b border-slate-800/80 px-4 py-3 text-left transition-colors last:border-b-0 disabled:cursor-not-allowed disabled:opacity-60 ${
                            isActive ? 'bg-sky-950/50' : 'hover:bg-slate-900/80'
                          }`}
                        >
                          <span className='min-w-0'>
                            <span
                              className={`block truncate text-sm font-bold ${isActive ? 'text-sky-200' : 'text-slate-200'}`}
                            >
                              {profile.name}
                            </span>
                            <span className='mt-1 block text-[11px] text-slate-500'>
                              {profile.controllers.length}{' '}
                              {profile.controllers.length === 1
                                ? 'controller'
                                : 'controllers'}
                            </span>
                          </span>
                          {isActive && (
                            <span aria-hidden='true' className='text-sky-300'>
                              ✓
                            </span>
                          )}
                        </button>
                      );
                    })}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        createProfile();
                      }}
                      className='flex flex-wrap items-center gap-2 border-t border-slate-800 p-3'
                    >
                      <label htmlFor='new-profile-name' className='sr-only'>
                        New profile name
                      </label>
                      <input
                        id='new-profile-name'
                        type='text'
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        placeholder='e.g. ATC145'
                        disabled={profileSaving}
                        className='min-w-[160px] flex-1 rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none'
                      />
                      <button
                        type='submit'
                        disabled={!newProfileName.trim() || profileSaving}
                        className='h-10 rounded-xl border border-sky-700/80 bg-sky-950/70 px-4 text-xs font-bold text-sky-200 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-40'
                      >
                        {profileSaving ? 'Saving…' : '+ Create profile'}
                      </button>
                    </form>
                  </div>
                  <p className='px-1 text-[11px] text-slate-500'>
                    New profiles start empty. Add a controller to enable
                    drafting.
                  </p>
                </div>

                <div className='min-w-0 rounded-2xl border border-slate-700/80 bg-slate-950/40 p-4 sm:p-5'>
                  <div className='flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-4'>
                    <div className='min-w-0 flex-1'>
                      <label
                        htmlFor={`profile-name-${activeProfile.id}`}
                        className='mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-500'
                      >
                        Profile name
                      </label>
                      <input
                        id={`profile-name-${activeProfile.id}`}
                        value={
                          profileDraftNames[activeProfile.id] ??
                          activeProfile.name
                        }
                        disabled={profileSaving}
                        onChange={(event) =>
                          setProfileDraftNames((prev) => ({
                            ...prev,
                            [activeProfile.id]: event.target.value,
                          }))
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            renameProfile(
                              activeProfile.id,
                              profileDraftNames[activeProfile.id] ??
                                activeProfile.name,
                            );
                          }
                        }}
                        className='w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-bold text-slate-100 focus:outline-none focus:border-sky-500'
                      />
                    </div>
                    <div className='flex gap-2 pt-5'>
                      <button
                        type='button'
                        onClick={() =>
                          renameProfile(
                            activeProfile.id,
                            profileDraftNames[activeProfile.id] ??
                              activeProfile.name,
                          )
                        }
                        disabled={
                          profileSaving ||
                          !(
                            profileDraftNames[activeProfile.id] ??
                            activeProfile.name
                          ).trim() ||
                          (
                            profileDraftNames[activeProfile.id] ??
                            activeProfile.name
                          ).trim() === activeProfile.name
                        }
                        className='h-10 rounded-xl border border-sky-700/80 bg-sky-950/60 px-3 text-xs font-bold text-sky-200 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-40'
                      >
                        Rename
                      </button>
                      {profiles.length > 1 && (
                        <button
                          type='button'
                          onClick={() =>
                            setPendingDeletion({
                              type: 'profile',
                              profileId: activeProfile.id,
                              name: activeProfile.name,
                            })
                          }
                          disabled={profileSaving}
                          className='h-10 rounded-xl border border-rose-800/80 bg-rose-950/50 px-3 text-xs font-bold text-rose-200 transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40'
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>

                  <section className='pt-4'>
                    <div className='mb-3 flex items-center justify-between gap-3'>
                      <div>
                        <h4 className='text-sm font-bold text-slate-100'>
                          Controllers
                        </h4>
                        <p className='mt-1 text-xs text-slate-500'>
                          Manage the people in this profile.
                        </p>
                      </div>
                      <span className='text-xs font-mono text-slate-400'>
                        {activeProfile.controllers.length}
                      </span>
                    </div>

                    <div className='space-y-2'>
                      {activeProfile.controllers.length === 0 ? (
                        <p className='rounded-xl bg-slate-900 px-3 py-3 text-sm text-slate-400'>
                          No controllers yet. Add the first one below to enable
                          drafting.
                        </p>
                      ) : (
                        activeProfile.controllers.map((controller) => (
                          <div
                            key={controller}
                            className='flex flex-wrap items-center gap-2 border-b border-slate-800/80 py-2 last:border-b-0'
                          >
                            <input
                              type='text'
                              aria-label={`Controller name for ${controller}`}
                              value={
                                controllerDraftNames[controller] ?? controller
                              }
                              disabled={profileSaving}
                              onChange={(event) =>
                                setControllerDraftNames((prev) => ({
                                  ...prev,
                                  [controller]: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  renameControllerInProfile(
                                    controller,
                                    controllerDraftNames[controller] ??
                                      controller,
                                  );
                                }
                              }}
                              className='min-w-[120px] flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 focus:outline-none focus:border-emerald-500'
                            />
                            <button
                              type='button'
                              aria-label={`Rename ${controller}`}
                              disabled={
                                profileSaving ||
                                !(
                                  controllerDraftNames[controller] ?? controller
                                ).trim() ||
                                (
                                  controllerDraftNames[controller] ?? controller
                                ).trim() === controller
                              }
                              onClick={() =>
                                renameControllerInProfile(
                                  controller,
                                  controllerDraftNames[controller] ??
                                    controller,
                                )
                              }
                              className='h-9 min-w-[76px] rounded-lg border border-sky-800/80 bg-sky-950/60 px-3 text-xs font-bold text-sky-200 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-40'
                            >
                              Rename
                            </button>
                            <button
                              type='button'
                              aria-label={`Delete ${controller} and ratings`}
                              disabled={profileSaving}
                              onClick={() =>
                                setPendingDeletion({
                                  type: 'controller',
                                  profileId: activeProfile.id,
                                  profileName: activeProfile.name,
                                  name: controller,
                                })
                              }
                              className='h-9 min-w-[76px] rounded-lg border border-rose-800/80 bg-rose-950/50 px-3 text-xs font-bold text-rose-200 transition hover:bg-rose-900 disabled:cursor-not-allowed disabled:opacity-40'
                            >
                              Delete
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <form
                      className='mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-4'
                      onSubmit={(event) => {
                        event.preventDefault();
                        addControllerToProfile();
                      }}
                    >
                      <input
                        type='text'
                        value={newControllerName}
                        onChange={(e) => setNewControllerName(e.target.value)}
                        placeholder='e.g. John'
                        disabled={profileSaving}
                        className='min-w-[160px] flex-1 bg-slate-950/80 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500'
                      />
                      <button
                        type='submit'
                        disabled={
                          !newControllerName.trim() ||
                          profileSaving ||
                          activeProfile.controllers.some(
                            (name) =>
                              name.toLowerCase() ===
                              newControllerName.trim().toLowerCase(),
                          )
                        }
                        className='h-10 rounded-xl border border-sky-700/80 bg-sky-950/70 px-4 text-xs font-bold text-sky-200 transition hover:bg-sky-900 disabled:cursor-not-allowed disabled:opacity-40'
                      >
                        {profileSaving ? 'Saving…' : 'Add controller'}
                      </button>
                    </form>
                  </section>
                </div>
              </div>
            </PlainCard>
          </div>,
          document.body,
        )}

      {pendingDeletion &&
        ReactDOM.createPortal(
          <div
            className='fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-4 backdrop-blur-md'
            role='dialog'
            aria-modal='true'
            aria-labelledby='delete-confirmation-title'
          >
            <PlainCard
              className='w-full max-w-md bg-slate-900 shadow-2xl'
              lead={
                <IconBox className='bg-rose-950/70 border-rose-800/70 text-rose-200'>
                  !
                </IconBox>
              }
              title={
                <span id='delete-confirmation-title'>
                  Delete{' '}
                  {pendingDeletion.type === 'profile'
                    ? 'profile'
                    : 'controller'}
                  ?
                </span>
              }
              bodyClassName='space-y-4 px-6 pb-6 pt-4'
            >
              <p className='text-sm leading-relaxed text-slate-300'>
                {pendingDeletion.type === 'profile' ? (
                  <>
                    Delete{' '}
                    <strong className='text-slate-100'>
                      {pendingDeletion.name}
                    </strong>{' '}
                    and all of its controllers and ratings? This cannot be
                    undone.
                  </>
                ) : (
                  <>
                    Delete{' '}
                    <strong className='text-slate-100'>
                      {pendingDeletion.name}
                    </strong>{' '}
                    from profile{' '}
                    <strong className='text-slate-100'>
                      {pendingDeletion.profileName}
                    </strong>{' '}
                    and remove their ratings? This cannot be undone.
                  </>
                )}
              </p>
              <div className='flex justify-end gap-3 pt-1'>
                <button
                  type='button'
                  onClick={() => setPendingDeletion(null)}
                  className='rounded-xl bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700'
                >
                  Cancel
                </button>
                <button
                  type='button'
                  onClick={confirmPendingDeletion}
                  disabled={profileSaving}
                  className='rounded-xl border border-rose-700/80 bg-rose-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-50'
                >
                  Delete{' '}
                  {pendingDeletion.type === 'profile'
                    ? 'profile'
                    : 'controller'}
                </button>
              </div>
            </PlainCard>
          </div>,
          document.body,
        )}

      {/* STICKY NAV BAR */}
      <nav
        aria-label='Main Navigation'
        className={`mb-6 transition-all duration-200 ${
          activeTab === 'trivia' ||
          activeTab === 'breakdown' ||
          activeTab === 'hot-to-not'
            ? 'sticky top-0 z-40 bg-slate-950/95 backdrop-blur-xl'
            : ''
        }`}
      >
        <div
          role='tablist'
          aria-label='App Navigation'
          className='bg-slate-900/90 backdrop-blur-xl p-2 rounded-3xl border border-slate-800/80 flex flex-wrap sm:flex-nowrap gap-2 shadow-2xl'
        >
          <button
            role='tab'
            id='tab-rate'
            aria-selected={activeTab === 'rate'}
            aria-controls='panel-rate'
            onClick={() => setActiveTab('rate')}
            className={`flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer box-border ${
              activeTab === 'rate'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            <span>🎯 Rate Tower</span>
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded-md ${activeTab === 'rate' ? 'bg-sky-700 text-sky-100' : 'bg-slate-800 text-slate-400'}`}
            >
              {getRatedCount(currentUser)}/31
            </span>
          </button>
          <button
            role='tab'
            id='tab-draft'
            aria-selected={activeTab === 'draft'}
            aria-controls='panel-draft'
            onClick={() => setActiveTab('draft')}
            className={`flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer box-border ${
              activeTab === 'draft'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            ⚡ Draft Pick
          </button>
          <button
            role='tab'
            id='tab-hot-to-not'
            aria-selected={activeTab === 'hot-to-not'}
            aria-controls='panel-hot-to-not'
            onClick={() => setActiveTab('hot-to-not')}
            className={`flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer box-border ${
              activeTab === 'hot-to-not'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            🔥 Hot to Not
          </button>
          <button
            role='tab'
            id='tab-trivia'
            aria-selected={activeTab === 'trivia'}
            aria-controls='panel-trivia'
            onClick={() => setActiveTab('trivia')}
            className={`flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer box-border ${
              activeTab === 'trivia'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            💡 Team Trivia
          </button>
          <button
            role='tab'
            id='tab-breakdown'
            aria-selected={activeTab === 'breakdown'}
            aria-controls='panel-breakdown'
            onClick={() => setActiveTab('breakdown')}
            className={`flex-1 min-w-[120px] px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer box-border ${
              activeTab === 'breakdown'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            📊 Category Stats
          </button>
        </div>
      </nav>

      {/* TAB 1: RATE ALL TOWERS */}
      {activeTab === 'rate' && (
        <main
          id='panel-rate'
          role='tabpanel'
          aria-labelledby='tab-rate'
          className='space-y-6 flex-1'
        >
          {/* Sticky Filter & Search Bar */}
          <div className='sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl p-4 md:p-5 rounded-3xl border border-slate-800 shadow-2xl flex flex-col sm:flex-row justify-between items-center gap-4'>
            <div
              className='flex flex-wrap gap-2'
              role='group'
              aria-label='Category Filters'
            >
              {['All', 'Radar', 'Regional', 'Metro D'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  aria-pressed={categoryFilter === cat}
                  className={`px-4 py-2 rounded-xl text-xs font-bold cursor-pointer transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    categoryFilter === cat
                      ? 'bg-sky-600 text-white shadow-md shadow-sky-950'
                      : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <label className='w-full sm:w-auto flex items-center'>
              <span className='sr-only'>Search towers</span>
              <input
                type='text'
                placeholder='Search tower, state, type...'
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className='bg-slate-950 border border-slate-800 px-4 py-2.5 rounded-2xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 w-full sm:w-72 shadow-inner'
              />
            </label>
          </div>

          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl'>
            <div className='app-section-header mb-6'>
              <div className='app-section-heading-copy'>
                <h2 className='app-section-heading-title'>
                  {hasSelectedController ? (
                    <>
                      Rating All Towers as{' '}
                      <span className='text-sky-400'>{currentUser}</span>
                    </>
                  ) : (
                    'Add a controller to start rating'
                  )}
                </h2>
                <p className='app-section-heading-description'>
                  {hasSelectedController
                    ? 'Score every tower from 1 (Lowest) to 5 (Highest).'
                    : 'Create a controller in this profile, then come back to rate towers.'}
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2 self-start sm:self-auto'>
                <button
                  onClick={() => setShowHelper(true)}
                  disabled={!hasSelectedController}
                  className='px-4 py-2.5 bg-sky-950/70 hover:bg-sky-900 border border-sky-700/80 text-sky-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shadow-md disabled:cursor-not-allowed disabled:opacity-40'
                >
                  🧭 Help Me Decide
                </button>
                <button
                  onClick={() => setShowResetModal(true)}
                  disabled={!hasSelectedController}
                  className='px-4 py-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 shadow-md disabled:cursor-not-allowed disabled:opacity-40'
                >
                  {hasSelectedController
                    ? `↺ Reset ${currentUser}'s Ratings`
                    : '↺ Reset Ratings'}
                </button>
              </div>
            </div>

            {/* TOWER RATING CARDS GRID */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {(() => {
                if (
                  !activeProfileControllers.length ||
                  !hasSelectedController
                ) {
                  return (
                    <div className='col-span-full rounded-2xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-12 text-center'>
                      <span className='mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900 text-xl'>
                        👥
                      </span>
                      <h3 className='text-base font-bold text-slate-100'>
                        No controllers in this profile yet
                      </h3>
                      <p className='mx-auto mt-2 max-w-md text-sm text-slate-400'>
                        Add a controller before rating. Your ratings will be
                        saved to that controller.
                      </p>
                      <button
                        type='button'
                        onClick={() => setShowProfileModal(true)}
                        className='mt-5 rounded-xl border border-sky-700/80 bg-sky-950/70 px-4 py-2.5 text-xs font-bold text-sky-200 transition hover:bg-sky-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
                      >
                        Add a controller
                      </button>
                    </div>
                  );
                }
                const filteredTowers = ALL_TOWERS.filter((tower) => {
                  const meta = TOWER_METADATA[tower];
                  if (searchTerm) {
                    const query = searchTerm.toLowerCase();
                    const matchName = tower.toLowerCase().includes(query);
                    const matchState = meta.state.toLowerCase().includes(query);
                    const matchCat = meta.category
                      .toLowerCase()
                      .includes(query);
                    if (!matchName && !matchState && !matchCat) return false;
                  }
                  if (
                    categoryFilter !== 'All' &&
                    meta.category !== categoryFilter
                  )
                    return false;
                  return true;
                });

                if (filteredTowers.length === 0) {
                  return (
                    <div className='col-span-full bg-slate-950/80 border border-slate-800 rounded-2xl p-12 text-center flex flex-col items-center justify-center space-y-3'>
                      <div className='w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-400 flex items-center justify-center text-xl font-bold'>
                        🔍
                      </div>
                      <h3 className='font-bold text-slate-200 text-base'>
                        No towers match your current search or filter
                      </h3>
                      <p className='text-xs text-slate-400 max-w-sm'>
                        Try adjusting your category, state, or search keywords
                        to view and rate available towers.
                      </p>
                    </div>
                  );
                }

                return filteredTowers.map((tower) => {
                  const meta = TOWER_METADATA[tower];
                  const score = ratings[currentUser]?.[tower];
                  return (
                    <PlainCard
                      key={tower}
                      title={tower}
                      aside={
                        <div className='flex flex-wrap items-center gap-2'>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
                        </div>
                      }
                      bodyClassName='px-4 pb-4 pt-3 space-y-4'
                    >
                      <div
                        className='flex items-center justify-between gap-1.5'
                        role='group'
                        aria-label={`Rate ${tower}`}
                      >
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleRatingChange(tower, num)}
                            disabled={!hasSelectedController}
                            aria-label={`Rate ${tower} ${num} out of 5`}
                            aria-pressed={score === num}
                            className={`w-10 h-10 rounded-xl font-extrabold transition duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                              score === num
                                ? 'bg-sky-500 text-white scale-105 shadow-md shadow-sky-950'
                                : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                            }`}
                          >
                            {num}
                          </button>
                        ))}
                      </div>
                    </PlainCard>
                  );
                });
              })()}
            </div>
          </section>
        </main>
      )}

      {/* TAB 2: TARGET DRAFT & MATCH */}
      {activeTab === 'draft' && (
        <main
          id='panel-draft'
          role='tabpanel'
          aria-labelledby='tab-draft'
          className='space-y-6 flex-1'
        >
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl'>
            <div className='app-section-header mb-6'>
              <div className='app-section-heading-copy'>
                <h2 className='app-section-heading-title'>
                  Select Final Target List ({targetSlots.length}{' '}
                  {targetSlots.length === 1 ? 'slot' : 'slots'})
                </h2>
                <p className='app-section-heading-description'>
                  Choose destination towers for the {users.length}-controller
                  draft. Duplicates allowed.
                </p>
              </div>
              <div className='app-section-header-aside flex items-center gap-2'>
                {Object.keys(manualLocks).length > 0 && (
                  <button
                    onClick={() => setManualLocks({})}
                    className='px-3 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-xl transition duration-200 cursor-pointer shadow-md'
                  >
                    Clear Locks ({Object.keys(manualLocks).length})
                  </button>
                )}
                <button
                  type='button'
                  onClick={saveTargetSlotsAsDefault}
                  disabled={profileSaving || users.length === 0}
                  className='inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-xl border border-emerald-700/80 bg-emerald-950/80 px-3.5 text-xs font-bold text-emerald-200 transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-40'
                >
                  {profileSaving ? 'Saving…' : '💾 Save as profile default'}
                </button>
              </div>
            </div>

            {targetSlots.length === 0 ? (
              <div className='rounded-2xl border border-slate-700/80 bg-slate-950/60 px-5 py-8 text-center'>
                <p className='text-sm font-semibold text-slate-200'>
                  Add a controller to this profile to create its draft list.
                </p>
                <button
                  type='button'
                  onClick={() => setShowProfileModal(true)}
                  className='mt-4 rounded-xl border border-sky-700/80 bg-sky-950/70 px-4 py-2 text-xs font-bold text-sky-200 transition hover:bg-sky-900'
                >
                  Manage controllers
                </button>
              </div>
            ) : (
              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'>
                {targetSlots.map((slotVal, sIdx) => {
                  const meta = TOWER_METADATA[slotVal];
                  return (
                    <PlainCard
                      key={sIdx}
                      title={
                        <label htmlFor={`slot-${sIdx}`}>
                          Target Slot #{sIdx + 1}
                        </label>
                      }
                      aside={
                        <>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
                        </>
                      }
                    >
                      <select
                        id={`slot-${sIdx}`}
                        value={slotVal}
                        onChange={(e) => {
                          const newTower = e.target.value;
                          const newSlots = [...targetSlots];
                          newSlots[sIdx] = newTower;
                          syncProfileDraftList(newSlots);

                          // Clean up manual locks that exceed the new frequency count of that tower
                          setManualLocks((prev) => {
                            const next = { ...prev };
                            const counts = {};
                            newSlots.forEach((t) => {
                              counts[t] = (counts[t] || 0) + 1;
                            });

                            // For each locked tower, check if total locks exceed its new count in slots
                            const activeTowerLocks = {};
                            Object.entries(next).forEach(([user, tower]) => {
                              activeTowerLocks[tower] =
                                (activeTowerLocks[tower] || 0) + 1;
                              if (
                                activeTowerLocks[tower] > (counts[tower] || 0)
                              ) {
                                delete next[user]; // Release excess lock
                              }
                            });
                            return next;
                          });
                        }}
                        className='w-full bg-slate-900 text-sky-300 font-bold px-3 py-2 rounded-xl border border-slate-700/80 focus:outline-none focus:border-sky-500 cursor-pointer text-sm shadow-inner'
                      >
                        {ALL_TOWERS.map((t) => (
                          <option key={t} value={t}>
                            {t} ({TOWER_METADATA[t].category} -{' '}
                            {TOWER_METADATA[t].state})
                          </option>
                        ))}
                      </select>
                    </PlainCard>
                  );
                })}
              </div>
            )}
          </section>

          {draftResult && (
            <section
              className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative'
              aria-live='polite'
            >
              {/* Pinned Tied Option & Clear Locks Bar */}
              <div className='sticky top-0 z-30 bg-slate-900/95 backdrop-blur-xl p-4 rounded-2xl border border-slate-800 flex flex-wrap items-center justify-between gap-3 shadow-2xl mb-4 box-border'>
                {/* Tied Options Area with horizontal scroll */}
                <div
                  className={`flex items-center gap-2 overflow-x-auto min-h-[36px] py-0.5 min-w-0 ${draftResult.options.length > 1 ? 'flex-1' : ''}`}
                >
                  {draftResult.options.length > 1 ? (
                    <>
                      <span className='text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap shrink-0'>
                        View Tied Option:
                      </span>
                      {draftResult.options.map((_, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSelectTieOption(idx)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition duration-150 whitespace-nowrap shrink-0 ${
                            selectedOptionIdx === idx
                              ? 'bg-sky-600 text-white shadow-md'
                              : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                          }`}
                        >
                          Option #{idx + 1}
                        </button>
                      ))}
                    </>
                  ) : (
                    <span className='text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap'>
                      No tied options
                    </span>
                  )}
                </div>

                {/* Clear Locks + Randomise (pinned for easy access) */}
                <div className='flex items-center gap-2 min-h-[36px] shrink-0 w-full sm:w-auto justify-end'>
                  {Object.keys(manualLocks).length > 0 && (
                    <button
                      onClick={() => setManualLocks({})}
                      className='px-3.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-xl transition duration-200 cursor-pointer shadow-md whitespace-nowrap'
                    >
                      Clear Locks ({Object.keys(manualLocks).length})
                    </button>
                  )}
                  <button
                    onClick={handleRandomiseSlots}
                    className='inline-flex h-9 w-32 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-indigo-700/80 bg-indigo-950/80 px-3.5 py-1.5 text-xs font-bold text-indigo-200 shadow-md transition duration-200 hover:bg-indigo-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400'
                  >
                    🎲 Randomise
                  </button>
                </div>
              </div>

              <div className='flex flex-col sm:flex-row justify-between sm:items-baseline gap-1 border-b border-slate-800/80 pb-4'>
                <div>
                  <h3 className='text-xl font-bold text-slate-100'>
                    Optimal Placement Results
                  </h3>
                  {draftResult.options.length > 1 && (
                    <p className='text-xs text-amber-300 font-semibold mt-1'>
                      ⚡ Tie Detected: {draftResult.options.length} different
                      combinations yield the exact same highest team score!
                    </p>
                  )}
                </div>
                <div className='inline-flex items-baseline gap-1 text-right'>
                  <span
                    className={`text-2xl font-extrabold leading-none ${ratingColorClass(draftResult.averageScore)}`}
                  >
                    {draftResult.averageScore}
                  </span>
                  <span className='text-xs leading-none text-slate-400 font-normal'>
                    avg rating
                  </span>
                </div>
              </div>

              {/* Active Selected Assignment Grid */}
              <div>
                <h4 className='text-xs font-bold text-slate-400 uppercase tracking-wider mb-3'>
                  Assigned Placements
                </h4>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {users.map((u) => {
                    const currentOptionAssignments =
                      draftResult.options[selectedOptionIdx] || {};
                    const assignment = currentOptionAssignments[u] || {
                      tower: '',
                      score: 0,
                    };
                    const meta = TOWER_METADATA[assignment.tower] || {
                      category: 'Radar',
                      state: 'VIC',
                    };
                    const isLocked = manualLocks[u] === assignment.tower;
                    const flashInfo = tieFlash?.users?.[u];
                    return (
                      <PlainCard
                        key={u}
                        tone={isLocked ? 'success' : 'default'}
                        flashClass={
                          flashInfo ? `tie-flash-${tieFlash.id % 2}` : ''
                        }
                        className={`assigned-placement-card ${isLocked ? 'is-locked' : ''}`}
                        role='button'
                        tabIndex={0}
                        aria-pressed={isLocked}
                        tooltip={`${isLocked ? 'Unlock' : 'Lock'} ${assignment.tower} as #1 for ${u}`}
                        onClick={() =>
                          assignment.tower && toggleLock(u, assignment.tower)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (assignment.tower)
                              toggleLock(u, assignment.tower);
                          }
                        }}
                        bodyClassName='placement-card-body'
                      >
                        <div className='placement-controller'>
                          <span className='placement-side-label'>
                            Controller
                          </span>
                          <span className='placement-controller-name'>{u}</span>
                          {flashInfo && (
                            <span className='placement-change'>
                              was {flashInfo.from}
                            </span>
                          )}
                        </div>
                        <div className='placement-card-details'>
                          <div className='placement-destination'>
                            <span className='placement-side-label'>
                              Assigned tower
                            </span>
                            <span
                              className={`placement-tower-name ${isLocked ? 'text-emerald-300' : 'text-sky-300'}`}
                            >
                              {assignment.tower}
                            </span>
                            <div className='placement-card-tags'>
                              <CategoryBadge category={meta.category} />
                              <StateBadge state={meta.state} />
                            </div>
                          </div>
                        </div>
                        <div
                          className='placement-score'
                          data-score={assignment.score}
                          aria-label={`Rating ${assignment.score} out of 5`}
                        >
                          <span className='placement-side-label'>Rating</span>
                          <span className='placement-rating'>
                            <span>{assignment.score}</span>
                            <span> / 5</span>
                          </span>
                          <span
                            className='placement-score-meter'
                            aria-hidden='true'
                          >
                            {[1, 2, 3, 4, 5].map((point) => (
                              <span
                                key={point}
                                className={
                                  assignment.score >= point ? 'is-filled' : ''
                                }
                              />
                            ))}
                          </span>
                        </div>
                      </PlainCard>
                    );
                  })}
                </div>
              </div>

              {/* Individual Form Submission Guides */}
              <div className='pt-4 border-t border-slate-800/80'>
                <h4 className='text-sm font-bold text-slate-100 mb-1 flex items-center gap-2'>
                  <span>📝 Form Submission Guides for Each ATC</span>
                </h4>
                <p className='text-xs text-slate-400 mb-4'>
                  Click any tower row below to instantly lock it as that
                  controller's #1 top choice:
                </p>

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {users.map((u) => {
                    const currentLock = manualLocks[u];
                    const items = buildFormItems(u);

                    return (
                      <PlainCard
                        key={u}
                        title={u}
                        aside={
                          currentLock ? (
                            <span
                              className='form-guide-lock-indicator'
                              title={`Locked to ${currentLock}`}
                            >
                              <span aria-hidden='true'>🔒</span>
                              <span>{currentLock}</span>
                            </span>
                          ) : null
                        }
                        className='form-guide-card'
                        bodyClassName='form-guide-body'
                      >
                        <ol className='form-guide-list'>
                          {items.map((item, rIdx) => {
                            const isThisLocked = currentLock === item.tower;
                            const isFlashRow = !!rowFlash?.rows?.[u]?.includes(
                              item.tower,
                            );
                            return (
                              <li
                                key={item.tower}
                                onClick={() => toggleLock(u, item.tower)}
                                title={`Click to lock ${item.tower} as #1 for ${u}`}
                                role='button'
                                tabIndex={0}
                                aria-pressed={isThisLocked}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    toggleLock(u, item.tower);
                                  }
                                }}
                                className={`form-guide-row ${isThisLocked ? 'is-locked' : ''} ${rIdx === 0 ? 'is-top-choice' : ''} ${item.isAssigned ? 'is-assigned' : ''} ${isFlashRow ? `tie-flash-${rowFlash.id % 2}` : ''}`}
                              >
                                <div className='form-guide-rank'>
                                  <span
                                    className={`form-guide-rank-number ${isThisLocked ? 'is-locked' : rIdx === 0 ? 'is-top-choice' : ''}`}
                                  >
                                    #{rIdx + 1}
                                  </span>
                                  <span className='form-guide-tower-name'>
                                    {item.tower}
                                  </span>
                                </div>
                                <div className='form-guide-row-details'>
                                  {item.meta?.category && (
                                    <CategoryBadge
                                      category={item.meta.category}
                                    />
                                  )}
                                  <StateBadge state={item.meta?.state} />
                                  <span className='form-guide-score'>
                                    {item.score}/5
                                  </span>
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </PlainCard>
                    );
                  })}
                </div>
              </div>
            </section>
          )}
        </main>
      )}

      {/* TAB 3: HOT TO NOT (MATRIX) */}
      {activeTab === 'hot-to-not' && (
        <main
          id='panel-hot-to-not'
          role='tabpanel'
          aria-labelledby='tab-hot-to-not'
          className='space-y-6 flex-1 flex flex-col'
        >
          <div className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl flex-1 flex flex-col'>
            <div className='app-section-header mb-6'>
              <div className='app-section-heading-copy'>
                <h2 className='app-section-heading-title'>
                  🔥 Hot to Not Score Matrix
                </h2>
                <p className='app-section-heading-description'>
                  Colour-coded controller preference matrix. Click any column
                  header to sort.
                </p>
              </div>
            </div>

            {/* Search & Category Filter Toolbar */}
            <div className='bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-inner'>
              <div
                className='flex flex-wrap gap-2 w-full sm:w-auto'
                role='group'
                aria-label='Matrix Category Filters'
              >
                {['All', 'Radar', 'Regional', 'Metro D'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setMatrixCategoryFilter(cat)}
                    aria-pressed={matrixCategoryFilter === cat}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition duration-200 ${
                      matrixCategoryFilter === cat
                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950'
                        : 'bg-slate-900 text-slate-300 border border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <label className='w-full sm:w-auto flex items-center'>
                <span className='sr-only'>Search matrix towers</span>
                <input
                  type='text'
                  placeholder='Search tower, state, type...'
                  value={matrixSearch}
                  onChange={(e) => setMatrixSearch(e.target.value)}
                  className='bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 w-full sm:w-64 shadow-inner'
                />
              </label>
            </div>

            <div className='relative overflow-x-auto overflow-y-auto max-h-[550px] rounded-2xl border border-slate-800/80 shadow-inner'>
              <table className='w-full text-left border-collapse min-w-[650px]'>
                <thead>
                  <tr className='sticky top-0 z-30 bg-slate-900 text-slate-300 text-sm shadow-md'>
                    <th
                      scope='col'
                      aria-sort={matrixAriaSort('tower')}
                      className='py-3.5 px-4 font-bold bg-slate-900 border-b border-slate-800'
                    >
                      <button
                        onClick={() => handleMatrixSort('tower')}
                        className='inline-flex items-center gap-1.5 cursor-pointer hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md px-1 -mx-1'
                      >
                        Tower
                        <span
                          aria-hidden='true'
                          className={`text-[10px] ${matrixSort.key === 'tower' ? 'text-sky-400' : 'text-slate-500'}`}
                        >
                          {matrixSortIcon('tower')}
                        </span>
                      </button>
                    </th>
                    {users.map((u) => (
                      <th
                        key={u}
                        scope='col'
                        aria-sort={matrixAriaSort(u)}
                        className='py-3.5 px-4 text-center font-bold bg-slate-900 border-b border-slate-800'
                      >
                        <button
                          onClick={() => handleMatrixSort(u)}
                          className='inline-flex items-center gap-1.5 cursor-pointer hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md px-1 -mx-1'
                        >
                          {u}
                          <span
                            aria-hidden='true'
                            className={`text-[10px] ${matrixSort.key === u ? 'text-sky-400' : 'text-slate-500'}`}
                          >
                            {matrixSortIcon(u)}
                          </span>
                        </button>
                      </th>
                    ))}
                    <th
                      scope='col'
                      aria-sort={matrixAriaSort('avg')}
                      className='py-3.5 px-4 text-center font-bold text-sky-400 bg-slate-900 border-b border-slate-800'
                    >
                      <button
                        onClick={() => handleMatrixSort('avg')}
                        className='inline-flex items-center gap-1.5 cursor-pointer hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 rounded-md px-1 -mx-1'
                      >
                        Average
                        <span
                          aria-hidden='true'
                          className={`text-[10px] ${matrixSort.key === 'avg' ? 'text-sky-400' : 'text-slate-500'}`}
                        >
                          {matrixSortIcon('avg')}
                        </span>
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className='divide-y divide-slate-800/60'>
                  {matrixRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={users.length + 2}
                        className='py-8 text-center text-slate-500 text-sm'
                      >
                        No towers found matching your search or filter.
                      </td>
                    </tr>
                  ) : (
                    matrixRows.map((stats) => (
                      <tr
                        key={stats.tower}
                        className='hover:bg-slate-950/50 transition'
                      >
                        <th scope='row' className='py-3.5 px-4 font-normal'>
                          <div className='flex items-center gap-2.5'>
                            <span className='font-bold text-slate-100'>
                              {stats.tower}
                            </span>
                            <CategoryBadge category={stats.category} />
                            <StateBadge state={stats.state} />
                          </div>
                        </th>
                        {users.map((u) => {
                          const score =
                            ratings[u]?.[stats.tower] !== undefined
                              ? ratings[u][stats.tower]
                              : DEFAULT_SCORE;
                          const isExplicit =
                            ratings[u]?.[stats.tower] !== undefined &&
                            ratings[u][stats.tower] > 0;
                          return (
                            <td key={u} className='py-3.5 px-4 text-center'>
                              <span
                                className={`inline-block w-9 h-9 leading-9 rounded-xl font-bold text-sm ${getHeatmapClass(score)}`}
                              >
                                {isExplicit ? score : '—'}
                              </span>
                            </td>
                          );
                        })}
                        <td
                          className={`py-3.5 px-4 text-center font-extrabold text-base ${
                            stats.ratingsCount > 0
                              ? ratingColorClass(Number(stats.avg))
                              : 'text-slate-500'
                          }`}
                        >
                          {stats.ratingsCount > 0 ? stats.avg : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* TAB 4: TEAM TRIVIA & SUPERLATIVES */}
      {activeTab === 'trivia' && (
        <main
          id='panel-trivia'
          role='tabpanel'
          aria-labelledby='tab-trivia'
          className='space-y-8 flex-1'
        >
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-8'>
            <div className='app-section-header'>
              <div className='app-section-heading-copy'>
                <h2 className='app-section-heading-title'>💡 Team Trivia</h2>
                <p className='app-section-heading-description'>
                  Quick facts from everyone's ratings.
                </p>
              </div>
            </div>

            {triviaSections.map((section) => (
              <div key={section.title} className='space-y-4'>
                <div className='flex items-center gap-2 border-b border-slate-800/80 pb-2'>
                  <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                    {section.title}
                  </span>
                </div>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                  {section.cards.map((card) => (
                    <TriviaCard key={card.title} {...card} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        </main>
      )}

      {/* TAB 5: BEST TO REST BREAKDOWN */}
      {activeTab === 'breakdown' && (
        <main
          id='panel-breakdown'
          role='tabpanel'
          aria-labelledby='tab-breakdown'
          className='space-y-6 flex-1'
        >
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-12'>
            {/* Tower Type Breakdown */}
            <div className='space-y-6'>
              <div className='app-section-header border-b border-slate-800/80 pb-4'>
                <div className='app-section-heading-copy'>
                  <h2 className='app-section-heading-title'>
                    📊 Group Preference by Tower Type
                  </h2>
                  <p className='app-section-heading-description'>
                    Aggregated preference metrics across Radar, Regional, and
                    Metro D classifications.
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 md:grid-cols-3 gap-6 items-start'>
                {categoryStats.map((cat, idx) => (
                  <GroupCard
                    key={cat.category}
                    kind='Category'
                    rank={idx + 1}
                    theme={CATEGORY_THEME[cat.category]}
                    label={cat.category}
                    count={cat.count}
                    avg={cat.avg}
                    avgLabel='Group Average'
                    rows={groupRows(cat)}
                    large
                  />
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className='border-t border-slate-800/80 pt-8 space-y-6'>
              <div className='app-section-header border-b border-slate-800/80 pb-4'>
                <div className='app-section-heading-copy'>
                  <h2 className='app-section-heading-title'>
                    🗺️ Group Preference by Australian State
                  </h2>
                  <p className='app-section-heading-description'>
                    Aggregated preference metrics across Australian states and
                    territories.
                  </p>
                </div>
              </div>

              <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-start'>
                {stateStats.map((st, idx) => (
                  <GroupCard
                    key={st.state}
                    kind='State'
                    rank={idx + 1}
                    theme={STATE_THEME[st.state]}
                    label={st.state}
                    count={st.count}
                    avg={st.avg}
                    avgLabel='State Average'
                    rows={groupRows(st)}
                  />
                ))}
              </div>
            </div>
          </section>
        </main>
      )}

      {showHelper &&
        ReactDOM.createPortal(
          <RankHelper
            userRatings={ratings[currentUser] || {}}
            onApply={handleBulkRatings}
            onClose={() => setShowHelper(false)}
          />,
          document.body,
        )}

      {/* Reset Confirmation Modal */}
      {showResetModal &&
        ReactDOM.createPortal(
          <div
            className='fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-slate-950/85 backdrop-blur-md'
            role='dialog'
            aria-modal='true'
            aria-labelledby='modal-title'
          >
            <PlainCard
              className='max-w-md w-full shadow-2xl bg-slate-900'
              lead={<IconBox>⚠️</IconBox>}
              title={<span id='modal-title'>Reset Controller Ratings?</span>}
              bodyClassName='px-6 pb-6 pt-4 space-y-4'
            >
              <p className='text-sm text-slate-300 leading-relaxed'>
                Are you sure you want to reset all tower ratings for{' '}
                <strong className='text-sky-300'>{currentUser}</strong>? All{' '}
                {ALL_TOWERS.length} towers will revert to unrated. This cannot
                be undone.
              </p>

              <div className='flex justify-end gap-3 pt-2'>
                <button
                  ref={cancelButtonRef}
                  onClick={() => setShowResetModal(false)}
                  className='px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-2xl transition duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
                >
                  Cancel
                </button>
                <button
                  onClick={confirmResetUserRatings}
                  className='px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-2xl transition duration-200 shadow-lg shadow-rose-950 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
                >
                  Confirm Reset
                </button>
              </div>
            </PlainCard>
          </div>,
          document.body,
        )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

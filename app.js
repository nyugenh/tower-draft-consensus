const { useState, useEffect, useRef } = React;

// ----------------------------------------------------------------------------
// CONFIGURATION
// Replace with your deployed Google Apps Script Web App URL:
// ----------------------------------------------------------------------------
const GOOGLE_SHEET_API_URL =
  'https://script.google.com/macros/s/AKfycbyaqvJXQEsiohIaS-hqEv8pB7ly9sw2XBPOuslNttmIxd64L7ronT2hg1N62yEQtMoJ/exec';

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
const UNRATED_SCORE = 0; // Stored value meaning "not rated"

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

function StateBadge({ state }) {
  const colorStyle =
    STATE_BADGE_CLASSES[state] ||
    'bg-slate-900 text-slate-300 border-slate-700';
  return (
    <span
      className={`text-[11px] px-2.5 py-0.5 rounded-md border font-bold ${colorStyle}`}
    >
      <span className='sr-only'>State: </span>
      {state}
    </span>
  );
}

function CategoryBadge({ category }) {
  const colorStyle =
    CATEGORY_BADGE_CLASSES[category] ||
    'bg-slate-900 text-slate-300 border-slate-700';
  return (
    <span
      className={`text-[11px] px-2.5 py-0.5 rounded-md border font-semibold ${colorStyle}`}
    >
      <span className='sr-only'>Category: </span>
      {category}
    </span>
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
const STATE_NAMES = {
  VIC: 'Victoria',
  NSW: 'New South Wales',
  QLD: 'Queensland',
  WA: 'Western Australia',
  SA: 'South Australia',
  TAS: 'Tasmania',
  NT: 'Northern Territory',
  ACT: 'Australian Capital Territory',
};

// Colour tints for the trivia cards
const TRIVIA_TINTS = {
  amber: {
    icon: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    main: 'text-amber-300',
    value: 'text-amber-400',
  },
  cyan: {
    icon: 'bg-cyan-500/20 border-cyan-500/30 text-cyan-400',
    main: 'text-cyan-300',
    value: 'text-cyan-400',
  },
  yellow: {
    icon: 'bg-yellow-500/20 border-yellow-500/30 text-yellow-400',
    main: 'text-yellow-300',
    value: 'text-yellow-400',
  },
  rose: {
    icon: 'bg-rose-500/20 border-rose-500/30 text-rose-400',
    main: 'text-rose-300',
    value: 'text-rose-400',
  },
  sky: {
    icon: 'bg-sky-500/20 border-sky-500/30 text-sky-400',
    main: 'text-sky-300',
    value: 'text-sky-400',
  },
  orange: {
    icon: 'bg-orange-500/20 border-orange-500/30 text-orange-400',
    main: 'text-orange-300',
    value: 'text-orange-400',
  },
  violet: {
    icon: 'bg-violet-500/20 border-violet-500/30 text-violet-400',
    main: 'text-violet-300',
    value: 'text-violet-400',
  },
  red: {
    icon: 'bg-red-500/20 border-red-500/30 text-red-400',
    main: 'text-red-300',
    value: 'text-red-400',
  },
  teal: {
    icon: 'bg-teal-500/20 border-teal-500/30 text-teal-400',
    main: 'text-teal-300',
    value: 'text-teal-400',
  },
  purple: {
    icon: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    main: 'text-purple-300',
    value: 'text-purple-400',
  },
  indigo: {
    icon: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400',
    main: 'text-indigo-300',
    value: 'text-indigo-400',
  },
  pink: {
    icon: 'bg-pink-500/20 border-pink-500/30 text-pink-400',
    main: 'text-pink-300',
    value: 'text-pink-400',
  },
};

// ----------------------------------------------------------------------------
// DESIGN SYSTEM
// PlainCard is the neutral card used everywhere. Only the Category and State
// stat cards use ThemedCard (coloured gradient banner + name pill).
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
      className={`relative rounded-3xl flex flex-col shadow-xl overflow-hidden border-2 min-w-0 transition-all duration-300 ${t.border} ${flashClass} ${className}`}
    >
      <div
        className={`px-4 py-3.5 flex flex-wrap items-center gap-3 ${t.banner}`}
      >
        {lead}
        <span
          className={`inline-block rounded-xl border font-bold tracking-wide text-sm px-3.5 py-1 min-w-0 break-words ${t.pill}`}
        >
          {pill}
        </span>
        {aside && (
          <div className='ml-auto flex items-center gap-2 shrink-0'>
            {aside}
          </div>
        )}
      </div>
      <div className={`bg-slate-950/80 flex-1 ${bodyClassName}`}>
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

// Subtle per-card colour for the trivia cards
const TRIVIA_SOFT = {
  amber: {
    card: 'bg-gradient-to-br from-amber-500/10 to-slate-950/80 border-amber-500/25',
    icon: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
    text: 'text-amber-300',
  },
  cyan: {
    card: 'bg-gradient-to-br from-cyan-500/10 to-slate-950/80 border-cyan-500/25',
    icon: 'bg-cyan-500/10 border-cyan-500/25 text-cyan-300',
    text: 'text-cyan-300',
  },
  yellow: {
    card: 'bg-gradient-to-br from-yellow-500/10 to-slate-950/80 border-yellow-500/25',
    icon: 'bg-yellow-500/10 border-yellow-500/25 text-yellow-300',
    text: 'text-yellow-300',
  },
  rose: {
    card: 'bg-gradient-to-br from-rose-500/10 to-slate-950/80 border-rose-500/25',
    icon: 'bg-rose-500/10 border-rose-500/25 text-rose-300',
    text: 'text-rose-300',
  },
  sky: {
    card: 'bg-gradient-to-br from-sky-500/10 to-slate-950/80 border-sky-500/25',
    icon: 'bg-sky-500/10 border-sky-500/25 text-sky-300',
    text: 'text-sky-300',
  },
  orange: {
    card: 'bg-gradient-to-br from-orange-500/10 to-slate-950/80 border-orange-500/25',
    icon: 'bg-orange-500/10 border-orange-500/25 text-orange-300',
    text: 'text-orange-300',
  },
  violet: {
    card: 'bg-gradient-to-br from-violet-500/10 to-slate-950/80 border-violet-500/25',
    icon: 'bg-violet-500/10 border-violet-500/25 text-violet-300',
    text: 'text-violet-300',
  },
  red: {
    card: 'bg-gradient-to-br from-red-500/10 to-slate-950/80 border-red-500/25',
    icon: 'bg-red-500/10 border-red-500/25 text-red-300',
    text: 'text-red-300',
  },
  teal: {
    card: 'bg-gradient-to-br from-teal-500/10 to-slate-950/80 border-teal-500/25',
    icon: 'bg-teal-500/10 border-teal-500/25 text-teal-300',
    text: 'text-teal-300',
  },
  purple: {
    card: 'bg-gradient-to-br from-purple-500/10 to-slate-950/80 border-purple-500/25',
    icon: 'bg-purple-500/10 border-purple-500/25 text-purple-300',
    text: 'text-purple-300',
  },
  indigo: {
    card: 'bg-gradient-to-br from-indigo-500/10 to-slate-950/80 border-indigo-500/25',
    icon: 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300',
    text: 'text-indigo-300',
  },
  pink: {
    card: 'bg-gradient-to-br from-pink-500/10 to-slate-950/80 border-pink-500/25',
    icon: 'bg-pink-500/10 border-pink-500/25 text-pink-300',
    text: 'text-pink-300',
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
      className={`relative rounded-2xl flex flex-col border shadow-inner min-w-0 overflow-hidden transition duration-200 ${toneClass} ${flashClass} ${className}`}
    >
      {hasHeader && (
        <div className='px-4 pt-4 flex flex-wrap items-center gap-3'>
          {lead}
          {heading && (
            <span className='font-bold text-slate-100 text-base min-w-0 break-words'>
              {heading}
            </span>
          )}
          {aside && (
            <div className='ml-auto flex items-center gap-2 shrink-0'>
              {aside}
            </div>
          )}
        </div>
      )}
      <div
        className={`flex-1 ${bodyClassName || (hasHeader ? 'px-4 pb-4 pt-3' : 'p-4')}`}
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
      className='cursor-pointer hover:border-sky-500/70 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
      title={tower}
      bodyClassName='px-5 pb-5 pt-3 flex flex-col gap-4'
    >
      <div className='flex flex-wrap items-center gap-1.5'>
        <CategoryBadge category={meta.category} />
        <StateBadge state={meta.state} />
      </div>
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

            <div className='grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-stretch gap-3'>
              <ChoiceCard
                key={`l-${pair[0]}`}
                tower={pair[0]}
                hint='← Choose this one'
                onPick={() => choose(pair[0])}
              />
              <span className='self-center text-center text-xs font-bold text-slate-500 uppercase'>
                vs
              </span>
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
  const [users] = useState(CONTROLLERS);
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem('atc_current_user') || CONTROLLERS[0],
  );
  const [ratings, setRatings] = useState({});
  const [syncStatus, setSyncStatus] = useState('Initialising...');
  const [activeTab, setActiveTab] = useState('rate');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showResetModal, setShowResetModal] = useState(false);
  const [showHelper, setShowHelper] = useState(false);

  // Hot to Not Table Search & Filter State
  const [matrixSearch, setMatrixSearch] = useState('');
  const [matrixCategoryFilter, setMatrixCategoryFilter] = useState('All');

  // Icon-Only Toast Notification State
  const [saveToast, setSaveToast] = useState({
    visible: false,
    user: '',
    isSuccess: false,
  });

  const cancelButtonRef = useRef(null);
  // Rating saves: every click is applied to the latest ratings immediately,
  // saves are sent one at a time in click order, and cloud polls are ignored
  // while a save is pending so they can't overwrite a newer rating.
  const ratingsRef = useRef({});
  const pendingSavesRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());
  const saveVersionRef = useRef(0);
  const lastSaveEndRef = useRef(0);
  const toastTimerRef = useRef(null);
  const lastDraftKeyRef = useRef(null);

  // Default Target List Slots (6 slots, allowing duplicates)
  const [targetSlots, setTargetSlots] = useState([
    'Adelaide',
    'Brisbane',
    'Cairns',
    'Canberra',
    'Gold Coast',
    'Melbourne',
  ]);

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

  const applyRatings = (next) => {
    ratingsRef.current = next;
    setRatings(next);
  };

  // Initial load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('atc_tower_rankings_gsheet');
    if (saved) {
      try {
        applyRatings(JSON.parse(saved));
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

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

  // Fetch live ratings from Cloud API
  const fetchCloudRatings = async () => {
    if (pendingSavesRef.current > 0) return;

    if (
      !GOOGLE_SHEET_API_URL ||
      GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')
    ) {
      setSyncStatus('Local Mode');
      return;
    }
    const versionAtStart = saveVersionRef.current;
    try {
      const res = await fetch(GOOGLE_SHEET_API_URL);
      if (res.ok) {
        const cloudData = await res.json();
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
          if (cloudJson !== localStorage.getItem('atc_tower_rankings_gsheet')) {
            applyRatings(cloudData);
            localStorage.setItem('atc_tower_rankings_gsheet', cloudJson);
          }
          setSyncStatus('Synced');
        }
      } else {
        setSyncStatus('Sync Error');
      }
    } catch (err) {
      setSyncStatus('Offline');
    }
  };

  useEffect(() => {
    fetchCloudRatings();
    const interval = setInterval(fetchCloudRatings, 15000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem('atc_current_user', currentUser);
  }, [currentUser]);

  const handleRandomiseSlots = () => {
    const shuffled = [...ALL_TOWERS].sort(() => 0.5 - Math.random());
    setTargetSlots(shuffled.slice(0, 6));
    setManualLocks({});
  };

  // Lock/unlock `tower` as controller `u`'s #1. Used by the form guide rows and
  // the Assigned Placements cards. `fromCard` stops that card flashing itself.
  const toggleLock = (u, tower, fromCard = false) => {
    clickedRowRef.current = {
      user: u,
      tower,
      fromCard,
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

  // Queue one save. Saves run strictly in click order.
  const queueSave = (payload) => {
    pendingSavesRef.current += 1;
    saveVersionRef.current += 1;
    const job = saveChainRef.current.then(() =>
      fetch(GOOGLE_SHEET_API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    );
    saveChainRef.current = job.catch(() => {});
    return job.finally(() => {
      pendingSavesRef.current -= 1;
      lastSaveEndRef.current = Date.now();
    });
  };

  const showToast = (user, isSuccess, hideAfter) => {
    clearTimeout(toastTimerRef.current);
    setSaveToast({ visible: true, user, isSuccess });
    if (hideAfter) {
      toastTimerRef.current = setTimeout(
        () => setSaveToast((prev) => ({ ...prev, visible: false })),
        hideAfter,
      );
    }
  };

  const handleRatingChange = async (tower, score) => {
    const activeUser = currentUser;
    const prev = ratingsRef.current;
    if (prev[activeUser]?.[tower] === score) return;

    // Always build on the latest ratings so fast clicks never undo each other
    const updated = {
      ...prev,
      [activeUser]: { ...(prev[activeUser] || {}), [tower]: score },
    };
    applyRatings(updated);
    localStorage.setItem('atc_tower_rankings_gsheet', JSON.stringify(updated));

    if (!cloudEnabled()) {
      showToast(activeUser, true, 1500);
      return;
    }

    showToast(activeUser, false);
    setSyncStatus('Saving...');
    try {
      await queueSave({ controller: activeUser, tower, score });
      if (pendingSavesRef.current === 0) setSyncStatus('Synced');
    } catch (err) {
      setSyncStatus('Save Error');
    }
    // Only the last save in a burst updates the toast
    if (pendingSavesRef.current === 0) showToast(activeUser, true, 2000);
  };

  const confirmResetUserRatings = async () => {
    setShowResetModal(false);
    const activeUser = currentUser;

    const updated = { ...ratingsRef.current, [activeUser]: {} };
    applyRatings(updated);
    localStorage.setItem('atc_tower_rankings_gsheet', JSON.stringify(updated));

    if (!cloudEnabled()) {
      showToast(activeUser, true, 1500);
      return;
    }

    showToast(activeUser, false);
    setSyncStatus('Resetting...');
    try {
      await Promise.all(
        ALL_TOWERS.map((tower) =>
          queueSave({
            controller: activeUser,
            tower,
            score: UNRATED_SCORE,
          }),
        ),
      );
      if (pendingSavesRef.current === 0) setSyncStatus('Synced');
    } catch (err) {
      setSyncStatus('Reset Locally');
    }
    if (pendingSavesRef.current === 0) showToast(activeUser, true, 2000);
  };

  // Save many ratings at once (used by the Help Me Decide helper)
  const handleBulkRatings = async (map) => {
    const activeUser = currentUser;
    const prev = ratingsRef.current;
    const updated = {
      ...prev,
      [activeUser]: { ...(prev[activeUser] || {}), ...map },
    };
    applyRatings(updated);
    localStorage.setItem('atc_tower_rankings_gsheet', JSON.stringify(updated));

    if (!cloudEnabled()) {
      showToast(activeUser, true, 1500);
      return;
    }

    showToast(activeUser, false);
    setSyncStatus('Saving...');
    try {
      await Promise.all(
        Object.entries(map).map(([tower, score]) =>
          queueSave({ controller: activeUser, tower, score }),
        ),
      );
      if (pendingSavesRef.current === 0) setSyncStatus('Synced');
    } catch (err) {
      setSyncStatus('Save Error');
    }
    if (pendingSavesRef.current === 0) showToast(activeUser, true, 2000);
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
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
      scores.length;

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
  // Controller cards need a few ratings first; unrated towers count as 3.
  const MIN_RATED = 5;
  const eligibleUsers = users.filter((u) => getRatedCount(u) >= MIN_RATED);
  const needRatings = `Needs ${MIN_RATED}+ ratings each`;
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

  const polarisedPool = towerMetrics.filter((m) => m.ratingsCount >= 2);
  const mostDivisive = [...polarisedPool].sort(
    (a, b) => b.variance - a.variance || b.ratingsCount - a.ratingsCount,
  )[0];
  const mostAgreed = [...polarisedPool].sort(
    (a, b) =>
      a.variance - b.variance ||
      b.rawAvg - a.rawAvg ||
      b.ratingsCount - a.ratingsCount,
  )[0];
  const fiveStarCount = towerMetrics.filter((m) =>
    Object.values(m.scoresMap).includes(5),
  ).length;
  const oneStarCount = towerMetrics.filter((m) =>
    Object.values(m.scoresMap).includes(1),
  ).length;
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
          tint: 'yellow',
          title: 'The Golden Child',
          subtitle: 'The tower everyone wants.',
          name:
            [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0]?.tower ||
            'N/A',
          badges: towerBadges(
            [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0],
          ),
          label: 'Average',
          value:
            [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg)[0]?.avg ||
            '0.00',
        },
        {
          icon: '💀',
          tint: 'red',
          title: 'The Exiled One',
          subtitle: 'Nobody wants to roster here.',
          name:
            [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0]?.tower ||
            'N/A',
          badges: towerBadges(
            [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0],
          ),
          label: 'Average',
          value:
            [...towerMetrics].sort((a, b) => a.rawAvg - b.rawAvg)[0]?.avg ||
            '0.00',
        },
        {
          icon: '💥',
          tint: 'amber',
          title: 'The Battlefield',
          subtitle: 'Causing full-scale office wars.',
          name: mostDivisive ? mostDivisive.tower : 'N/A',
          badges: towerBadges(mostDivisive),
          detail: mostDivisive ? null : 'Needs 2+ ratings',
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
          detail: mostAgreed ? null : 'Needs 2+ ratings',
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
          detail: generous ? null : needRatings,
          label: 'Average',
          value: generous ? generous.value.toFixed(2) : '0.00',
        },
        {
          icon: '🍋',
          tint: 'orange',
          title: 'Master Grumpy',
          subtitle: 'Hard to please, hates everything.',
          name: critic ? critic.name : 'N/A',
          detail: critic ? null : needRatings,
          label: 'Average',
          value: critic ? critic.value.toFixed(2) : '0.00',
        },
        {
          icon: '😐',
          tint: 'violet',
          title: 'Captain Neutral',
          subtitle: 'Refuses to have strong opinions.',
          name: consistent ? consistent.name : 'N/A',
          detail: consistent ? null : needRatings,
          label: 'Swing',
          value: consistent ? consistent.value.toFixed(2) : '0.00',
        },
        {
          icon: '🎢',
          tint: 'pink',
          title: 'Pure Chaos',
          subtitle: 'Either loves it or despises it.',
          name: extreme ? extreme.name : 'N/A',
          detail: extreme ? null : needRatings,
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
          tint: 'indigo',
          title: 'Partner in Crime',
          subtitle: 'Sharing the exact same brain.',
          name: twins ? twins.name : 'N/A',
          detail: twins ? `Same score on ${twins.same} towers` : needRatings,
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
            ? `Same score on ${opposites.same} towers`
            : needRatings,
          label: 'Gap',
          value: opposites ? opposites.gap.toFixed(2) : '0.00',
        },
        {
          icon: '🐑',
          tint: 'cyan',
          title: 'The Pleaser',
          subtitle: 'Sticks right to the group vibe.',
          name: groupMind ? groupMind.name : 'N/A',
          detail: groupMind ? null : needRatings,
          label: 'Gap',
          value: groupMind ? groupMind.value.toFixed(2) : '0.00',
        },
        {
          icon: '🐱',
          tint: 'rose',
          title: 'Lone Cat',
          subtitle: 'Doing their own totally random thing.',
          name: loneWolf ? loneWolf.name : 'N/A',
          detail: loneWolf ? null : needRatings,
          label: 'Gap',
          value: loneWolf ? loneWolf.value.toFixed(2) : '0.00',
        },
      ],
    },
  ];

  // Optimal Draft Permutation Engine with Frequency-Validated Locks
  const runOptimalDraft = () => {
    const slots = targetSlots || [];
    if (slots.length === 0) return;

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
      const click = clickedRowRef.current;
      const recentClick = click && Date.now() < click.until;
      users.forEach((u) => {
        const from = prevOption[u]?.tower;
        const to = nextOption[u]?.tower;
        if (from && to && from !== to) {
          changed[u] = { from, to };
          if (recentClick && u === click.user) {
            changed[u].skipCard = click.fromCard;
          }
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
      {/* Icon-Only Saving Status Bottom-Right Toast */}
      <div
        aria-live='polite'
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 transform ${
          saveToast.visible
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-3 opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className='bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-center gap-3'>
          <div className='w-7 h-7 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0'>
            {saveToast.isSuccess ? (
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
                className='w-4 h-4 animate-spin text-sky-400'
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

          <div className='flex items-center gap-2 bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 text-xs font-bold text-sky-300 shadow-inner'>
            <svg
              className='w-3.5 h-3.5 text-sky-400'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth='2'
                d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'
              ></path>
            </svg>
            <span>{saveToast.user}</span>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className='bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 mb-6 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4'>
        <div>
          <h1 className='text-2xl md:text-3xl font-black text-sky-400 tracking-tight'>
            ATC Tower Consensus & Draft
          </h1>
          <p className='text-sm text-slate-300 mt-1'>
            Active Profile:{' '}
            <strong className='text-sky-300 font-bold'>{currentUser}</strong>
          </p>
        </div>
        <div className='flex items-center gap-4' aria-live='polite'>
          <span className='text-xs px-4 py-2 rounded-full bg-slate-950 border border-slate-800 text-sky-300 font-bold flex items-center gap-2.5 shadow-inner'>
            <span className='w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse'></span>
            {syncStatus}
          </span>
        </div>
      </header>

      {/* Controller Profile Selector */}
      <section
        aria-labelledby='controllers-heading'
        className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-4 md:p-6 mb-6 shadow-xl'
      >
        <h2
          id='controllers-heading'
          className='text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 px-1'
        >
          Active Controller Profile
        </h2>
        <div className='grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3'>
          {users.map((u) => {
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
                className={`p-3.5 rounded-2xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
                  isActive
                    ? 'border-sky-500/80 bg-sky-950/60 shadow-lg shadow-sky-950/50 ring-1 ring-sky-500/40'
                    : 'border-slate-800/80 bg-slate-950/60 hover:bg-slate-800/60'
                }`}
              >
                <div className='flex justify-between items-center mb-2'>
                  <span
                    className={`font-bold text-sm ${isActive ? 'text-sky-300' : 'text-slate-200'}`}
                  >
                    {u} {isActive && <span className='text-sky-400'>✓</span>}
                  </span>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-mono font-bold ${isComplete ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700/60'}`}
                  >
                    {ratedCount}/{ALL_TOWERS.length}
                  </span>
                </div>
                <div className='w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden shadow-inner'>
                  <div
                    className='bg-sky-500 h-full transition-all duration-300'
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

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
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6'>
              <div>
                <h2 className='text-xl font-bold text-slate-100 mb-1'>
                  Rating All Towers as{' '}
                  <span className='text-sky-400'>{currentUser}</span>
                </h2>
                <p className='text-sm text-slate-300'>
                  Score every tower from 1 (Lowest) to 5 (Highest).
                </p>
              </div>
              <div className='flex flex-wrap items-center gap-2 self-start sm:self-auto'>
                <button
                  onClick={() => setShowHelper(true)}
                  className='px-4 py-2.5 bg-sky-950/70 hover:bg-sky-900 border border-sky-700/80 text-sky-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 shadow-md'
                >
                  🧭 Help Me Decide
                </button>
                <button
                  onClick={() => setShowResetModal(true)}
                  className='px-4 py-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 shadow-md'
                >
                  ↺ Reset {currentUser}'s Ratings
                </button>
              </div>
            </div>

            {/* TOWER RATING CARDS GRID */}
            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {(() => {
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
                  const isRated = score !== undefined && score > 0;
                  return (
                    <PlainCard
                      key={tower}
                      title={tower}
                      bodyClassName='px-4 pb-4 pt-2 space-y-4'
                    >
                      <div className='flex items-center gap-2.5'>
                        <CategoryBadge category={meta.category} />
                        <StateBadge state={meta.state} />
                      </div>
                      <div
                        className='flex items-center justify-between gap-1.5'
                        role='group'
                        aria-label={`Rate ${tower}`}
                      >
                        {[1, 2, 3, 4, 5].map((num) => (
                          <button
                            key={num}
                            onClick={() => handleRatingChange(tower, num)}
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
            <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6'>
              <div>
                <h2 className='text-xl font-bold text-slate-100 mb-1'>
                  Select Final Target List (6 Slots)
                </h2>
                <p className='text-sm text-slate-300'>
                  Choose the 6 destination towers for the draft. Duplicates
                  allowed.
                </p>
              </div>
              <div className='flex items-center gap-2'>
                {Object.keys(manualLocks).length > 0 && (
                  <button
                    onClick={() => setManualLocks({})}
                    className='px-3 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-xl transition duration-200 cursor-pointer shadow-md'
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

            {/* Scrolling Grid of 6 Slots */}
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
                        setTargetSlots(newSlots);

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

              <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800/80 pb-4'>
                <div className='min-h-[3rem]'>
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
                <div className='text-right'>
                  <span className='text-2xl font-extrabold text-sky-400'>
                    {draftResult.averageScore}{' '}
                    <span className='text-xs text-slate-400 font-normal'>
                      avg rating
                    </span>
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
                        role='button'
                        tabIndex={0}
                        aria-pressed={isLocked}
                        tooltip={`Click to ${isLocked ? 'unlock' : 'lock'} ${assignment.tower} for ${u}`}
                        onClick={() =>
                          assignment.tower &&
                          toggleLock(u, assignment.tower, true)
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            if (assignment.tower)
                              toggleLock(u, assignment.tower, true);
                          }
                        }}
                        flashClass={
                          flashInfo && !flashInfo.skipCard
                            ? `tie-flash-${tieFlash.id % 2}`
                            : ''
                        }
                        className='cursor-pointer hover:border-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400'
                        lead={<IconBox>{isLocked ? '🔒' : '🎯'}</IconBox>}
                        title={u}
                        aside={
                          <>
                            {flashInfo && !flashInfo.skipCard && (
                              <span className='text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950 border border-amber-500/70 text-amber-300'>
                                was {flashInfo.from}
                              </span>
                            )}
                            <span className='font-mono font-extrabold text-emerald-400 text-sm'>
                              {assignment.score} / 5
                            </span>
                          </>
                        }
                        bodyClassName='px-4 pb-4 pt-2'
                      >
                        <div className='flex flex-wrap items-center gap-x-2.5 gap-y-1.5'>
                          <span
                            className={`font-extrabold text-lg break-words ${isLocked ? 'text-emerald-300' : 'text-sky-300'}`}
                          >
                            {assignment.tower}
                          </span>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
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
                        bodyClassName='px-4 pb-4 pt-3'
                      >
                        <ol className='space-y-2'>
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
                                className={`flex flex-wrap items-center justify-between gap-y-1.5 text-xs px-3 py-2 rounded-xl border transition cursor-pointer ${isFlashRow ? `tie-flash-${rowFlash.id % 2}` : ''} ${
                                  isThisLocked
                                    ? 'bg-emerald-950/50 border-emerald-500/70 text-emerald-200 font-bold shadow-sm ring-1 ring-emerald-500/40'
                                    : rIdx === 0
                                      ? 'bg-amber-950/30 border-amber-600/50 text-amber-200 font-semibold shadow-sm hover:border-amber-500'
                                      : item.isAssigned
                                        ? 'bg-sky-950/40 border-sky-600/50 text-sky-200 font-bold shadow-sm hover:border-sky-500'
                                        : 'bg-slate-900/60 border-slate-800/60 text-slate-300 hover:bg-slate-800'
                                }`}
                              >
                                <div className='flex items-center gap-2'>
                                  <span
                                    className={`font-extrabold w-4 ${isThisLocked ? 'text-emerald-400' : rIdx === 0 ? 'text-amber-400' : 'text-sky-400'}`}
                                  >
                                    #{rIdx + 1}
                                  </span>
                                  <span>{item.tower}</span>
                                </div>
                                <div className='flex items-center gap-2'>
                                  {item.meta?.category && (
                                    <CategoryBadge
                                      category={item.meta.category}
                                    />
                                  )}
                                  <StateBadge state={item.meta?.state} />
                                  <span className='font-mono text-slate-400 text-[11px]'>
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
            <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6'>
              <div>
                <h2 className='text-xl font-bold text-slate-100 mb-1'>
                  🔥 Hot to Not Score Matrix
                </h2>
                <p className='text-sm text-slate-300'>
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
                        <td className='py-3.5 px-4 text-center font-extrabold text-sky-400 text-base'>
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
            <div>
              <h2 className='text-xl font-bold text-slate-100 mb-1'>
                💡 Team Trivia
              </h2>
              <p className='text-sm text-slate-400'>
                Quick facts from everyone's ratings.
              </p>
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
              <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-800/80 pb-4'>
                <div>
                  <h2 className='text-xl font-bold text-slate-100 mb-1'>
                    📊 Group Preference by Tower Type
                  </h2>
                  <p className='text-sm text-slate-300'>
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
              <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-2 border-b border-slate-800/80 pb-4'>
                <div>
                  <h2 className='text-xl font-bold text-slate-100 mb-1'>
                    🗺️ Group Preference by Australian State
                  </h2>
                  <p className='text-sm text-slate-300'>
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

      {showHelper && (
        <RankHelper
          userRatings={ratings[currentUser] || {}}
          onApply={handleBulkRatings}
          onClose={() => setShowHelper(false)}
        />
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md'
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
              {ALL_TOWERS.length} towers will revert to unrated. This cannot be
              undone.
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
        </div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

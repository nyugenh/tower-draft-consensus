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

const DEFAULT_SCORE = 0; // Default score is 0 (Unrated)

// State Badge styling lookup
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
  Radar: 'bg-cyan-950/90 text-cyan-300 border-cyan-700/60',
  Regional: 'bg-violet-950/90 text-violet-300 border-violet-700/60',
  'Metro D': 'bg-fuchsia-950/90 text-fuchsia-300 border-fuchsia-700/60',
};

function StateBadge({ state }) {
  const colorStyle =
    STATE_BADGE_CLASSES[state] ||
    'bg-slate-900 text-slate-300 border-slate-700';
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded-md border font-extrabold tracking-wide ${colorStyle}`}
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
      className={`text-[10px] px-2 py-0.5 rounded-md border font-bold ${colorStyle}`}
    >
      <span className='sr-only'>Category: </span>
      {category}
    </span>
  );
}

function App() {
  const [users] = useState(CONTROLLERS);
  const [currentUser, setCurrentUser] = useState(
    () => localStorage.getItem('atc_current_user') || CONTROLLERS[0],
  );
  const [ratings, setRatings] = useState({});
  const [syncStatus, setSyncStatus] = useState('Initializing...');
  const [activeTab, setActiveTab] = useState('rate');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showResetModal, setShowResetModal] = useState(false);

  // Icon-Only Toast Notification State
  const [saveToast, setSaveToast] = useState({
    visible: false,
    user: '',
    isSuccess: false,
  });

  const cancelButtonRef = useRef(null);
  const isSavingRef = useRef(false);

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

  // Initial load from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('atc_tower_rankings_gsheet');
    if (saved) {
      try {
        setRatings(JSON.parse(saved));
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
    if (isSavingRef.current) return;

    if (
      !GOOGLE_SHEET_API_URL ||
      GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')
    ) {
      setSyncStatus('Local Mode');
      return;
    }
    try {
      const res = await fetch(GOOGLE_SHEET_API_URL);
      if (res.ok) {
        const cloudData = await res.json();
        if (
          !isSavingRef.current &&
          cloudData &&
          typeof cloudData === 'object'
        ) {
          setRatings(cloudData);
          localStorage.setItem(
            'atc_tower_rankings_gsheet',
            JSON.stringify(cloudData),
          );
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

  const handleRatingChange = async (tower, score) => {
    isSavingRef.current = true;
    const activeUser = currentUser;

    setSaveToast({ visible: true, user: activeUser, isSuccess: false });

    const updated = {
      ...ratings,
      [activeUser]: {
        ...(ratings[activeUser] || {}),
        [tower]: score,
      },
    };
    setRatings(updated);
    localStorage.setItem('atc_tower_rankings_gsheet', JSON.stringify(updated));

    if (
      GOOGLE_SHEET_API_URL &&
      !GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')
    ) {
      setSyncStatus('Saving...');
      try {
        await fetch(GOOGLE_SHEET_API_URL, {
          method: 'POST',
          body: JSON.stringify({ controller: activeUser, tower, score }),
        });
        setSyncStatus('Synced');
        setSaveToast({ visible: true, user: activeUser, isSuccess: true });
      } catch (err) {
        setSyncStatus('Save Error');
        setSaveToast({ visible: true, user: activeUser, isSuccess: true });
      } finally {
        isSavingRef.current = false;
        setTimeout(
          () => setSaveToast((prev) => ({ ...prev, visible: false })),
          2000,
        );
      }
    } else {
      isSavingRef.current = false;
      setSaveToast({ visible: true, user: activeUser, isSuccess: true });
      setTimeout(
        () => setSaveToast((prev) => ({ ...prev, visible: false })),
        1500,
      );
    }
  };

  const confirmResetUserRatings = async () => {
    setShowResetModal(false);
    isSavingRef.current = true;
    const activeUser = currentUser;

    setSaveToast({ visible: true, user: activeUser, isSuccess: false });

    const updated = {
      ...ratings,
      [activeUser]: {},
    };

    setRatings(updated);
    localStorage.setItem('atc_tower_rankings_gsheet', JSON.stringify(updated));

    if (
      GOOGLE_SHEET_API_URL &&
      !GOOGLE_SHEET_API_URL.includes('YOUR_GOOGLE_APPS_SCRIPT')
    ) {
      setSyncStatus('Resetting...');
      try {
        for (let tower of ALL_TOWERS) {
          await fetch(GOOGLE_SHEET_API_URL, {
            method: 'POST',
            body: JSON.stringify({
              controller: activeUser,
              tower,
              score: DEFAULT_SCORE,
            }),
          });
        }
        setSyncStatus('Synced');
        setSaveToast({ visible: true, user: activeUser, isSuccess: true });
      } catch (err) {
        setSyncStatus('Reset Locally');
      } finally {
        isSavingRef.current = false;
        setTimeout(
          () => setSaveToast((prev) => ({ ...prev, visible: false })),
          2000,
        );
      }
    } else {
      isSavingRef.current = false;
      setTimeout(
        () => setSaveToast((prev) => ({ ...prev, visible: false })),
        1500,
      );
    }
  };

  const getRatedCount = (user) => {
    const userRatings = ratings[user] || {};
    return Object.values(userRatings).filter((score) => score > 0).length;
  };

  const getScore = (user, tower) => {
    return ratings[user]?.[tower] !== undefined
      ? ratings[user][tower]
      : DEFAULT_SCORE;
  };

  // Metrics calculation
  const towerMetrics = ALL_TOWERS.map((tower) => {
    let total = 0;
    let explicitCount = 0;
    let scores = [];
    users.forEach((u) => {
      const s = ratings[u]?.[tower];
      if (s !== undefined && s > 0) {
        total += s;
        explicitCount++;
        scores.push(s);
      } else {
        total += DEFAULT_SCORE;
        scores.push(DEFAULT_SCORE);
      }
    });
    const avg = total / users.length;
    let variance = 0;
    if (scores.length > 1) {
      variance =
        scores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
        scores.length;
    }

    const meta = TOWER_METADATA[tower];

    return {
      tower,
      category: meta.category,
      state: meta.state,
      avg: avg.toFixed(2),
      rawAvg: avg,
      ratingsCount: explicitCount,
      variance: variance.toFixed(2),
    };
  });

  const sortedOverall = [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg);

  // Optimal Draft Permutation Engine
  const runOptimalDraft = () => {
    const permute = (arr) => {
      let results = [];
      const helper = (subArr, m) => {
        if (m === 1) {
          results.push([...subArr]);
          return;
        }
        helper(subArr, m - 1);
        for (let i = 0; i < m - 1; i++) {
          if (m % 2 === 0) {
            [subArr[i], subArr[m - 1]] = [subArr[m - 1], subArr[i]];
          } else {
            [subArr[0], subArr[m - 1]] = [subArr[m - 1], subArr[0]];
          }
          helper(subArr, m - 1);
        }
      };
      helper(arr, arr.length);
      return results;
    };

    const slotIndices = [0, 1, 2, 3, 4, 5];
    const allPermutations = permute(slotIndices);

    let maxTotalScore = -1;
    let winningPermutations = [];

    allPermutations.forEach((perm) => {
      let currentScore = 0;
      users.forEach((userIndex, uIdx) => {
        const assignedSlotIdx = perm[uIdx];
        const towerName = targetSlots[assignedSlotIdx];
        currentScore += getScore(users[uIdx], towerName);
      });

      if (currentScore > maxTotalScore) {
        maxTotalScore = currentScore;
        winningPermutations = [perm];
      } else if (currentScore === maxTotalScore && maxTotalScore > -1) {
        winningPermutations.push(perm);
      }
    });

    const formattedOptions = winningPermutations.map((perm) => {
      const assignments = {};
      users.forEach((u, uIdx) => {
        const slotIdx = perm[uIdx];
        const towerName = targetSlots[slotIdx];
        assignments[u] = {
          slotIndex: slotIdx,
          tower: towerName,
          score: getScore(users[uIdx], towerName),
        };
      });
      return assignments;
    });

    setDraftResult({
      totalScore: maxTotalScore,
      averageScore: (maxTotalScore / users.length).toFixed(2),
      options: formattedOptions,
    });
    setSelectedOptionIdx(0);
  };

  const getHeatmapClass = (score) => {
    if (score === 5)
      return 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40';
    if (score === 4)
      return 'bg-sky-600/30 text-sky-300 border border-sky-500/40';
    if (score === 3)
      return 'bg-slate-800 text-slate-200 border border-slate-700';
    if (score === 2)
      return 'bg-amber-600/25 text-amber-300 border border-amber-500/30';
    if (score === 1)
      return 'bg-rose-600/30 text-rose-300 border border-rose-500/40';
    return 'bg-slate-900/80 text-slate-500 border border-slate-800'; // 0 / unrated
  };

  return (
    <div className='max-w-7xl mx-auto p-4 md:p-8 font-sans text-slate-100 antialiased relative min-h-screen'>
      {/* Icon-Only Saving Status Bottom-Right Toast */}
      <div
        aria-live='polite'
        className={`fixed bottom-6 right-6 z-50 transition-all duration-300 transform ${
          saveToast.visible
            ? 'translate-y-0 opacity-100 scale-100'
            : 'translate-y-3 opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className='bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-2.5'>
          <div className='w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0'>
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

          <div className='flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-md border border-slate-800 text-xs font-bold text-sky-300'>
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
      <header className='bg-slate-900/90 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 mb-6 shadow-2xl flex flex-col md:flex-row justify-between items-center gap-4'>
        <div>
          <h1 className='text-2xl font-extrabold text-sky-400 tracking-tight'>
            ATC Tower Consensus & Draft
          </h1>
          <p className='text-sm text-slate-300 mt-0.5'>
            Active Profile:{' '}
            <strong className='text-sky-300 font-bold'>{currentUser}</strong>
          </p>
        </div>
        <div className='flex items-center gap-4' aria-live='polite'>
          <span className='text-xs px-3.5 py-1.5 rounded-full bg-slate-950 border border-slate-800 text-sky-300 font-semibold flex items-center gap-2'>
            <span className='w-2 h-2 rounded-full bg-emerald-400 animate-pulse'></span>
            {syncStatus}
          </span>
        </div>
      </header>

      {/* Controller Profile Selector */}
      <section
        aria-labelledby='controllers-heading'
        className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-4 mb-6 shadow-lg'
      >
        <h2
          id='controllers-heading'
          className='text-xs font-bold text-slate-300 uppercase tracking-wider mb-3'
        >
          Active Controller Profile (Unrated defaults to 0)
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
                aria-label={`Select ${u}. Progress: ${ratedCount} of 31 towers rated.`}
                className={`p-3 rounded-xl border text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
                  isActive
                    ? 'border-sky-500/80 bg-sky-950/60 shadow-lg shadow-sky-950/50'
                    : 'border-slate-800/80 bg-slate-950/60 hover:bg-slate-800/60'
                }`}
              >
                <div className='flex justify-between items-center mb-1.5'>
                  <span
                    className={`font-bold text-sm ${isActive ? 'text-sky-300' : 'text-slate-200'}`}
                  >
                    {u} {isActive && <span className='text-sky-400'>✓</span>}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${isComplete ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800 text-slate-300 border border-slate-700/60'}`}
                  >
                    {ratedCount}/31
                  </span>
                </div>
                <div className='w-full bg-slate-800 h-1.5 rounded-full overflow-hidden'>
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

      {/* Unified Navigation Bar */}
      <nav aria-label='Main Navigation' className='mb-6'>
        <div
          role='tablist'
          aria-label='App Navigation'
          className='bg-slate-900/80 backdrop-blur-md p-2 rounded-2xl border border-slate-800/80 flex flex-wrap sm:flex-nowrap gap-2 shadow-lg'
        >
          <button
            role='tab'
            id='tab-rate'
            aria-selected={activeTab === 'rate'}
            aria-controls='panel-rate'
            onClick={() => setActiveTab('rate')}
            className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
              activeTab === 'rate'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            <span>🎯 Rate Towers</span>
            <span
              className={`text-[10px] font-mono px-1.5 py-0.2 rounded ${activeTab === 'rate' ? 'bg-sky-700 text-sky-100' : 'bg-slate-800 text-slate-400'}`}
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
            className={`flex-1 min-w-[130px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
              activeTab === 'draft'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            ⚡ Target Draft
          </button>
          <button
            role='tab'
            id='tab-master'
            aria-selected={activeTab === 'master'}
            aria-controls='panel-master'
            onClick={() => setActiveTab('master')}
            className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
              activeTab === 'master'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            📋 Master List
          </button>
          <button
            role='tab'
            id='tab-matrix'
            aria-selected={activeTab === 'matrix'}
            aria-controls='panel-matrix'
            onClick={() => setActiveTab('matrix')}
            className={`flex-1 min-w-[130px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
              activeTab === 'matrix'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            📊 Rating Matrix
          </button>
          <button
            role='tab'
            id='tab-stats'
            aria-selected={activeTab === 'stats'}
            aria-controls='panel-stats'
            onClick={() => setActiveTab('stats')}
            className={`flex-1 min-w-[120px] px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition duration-200 flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 cursor-pointer ${
              activeTab === 'stats'
                ? 'bg-sky-600 text-white shadow-md'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            🌡️ Hot to Not
          </button>
        </div>
      </nav>

      {/* TAB 1: RATE ALL TOWERS */}
      {activeTab === 'rate' && (
        <main
          id='panel-rate'
          role='tabpanel'
          aria-labelledby='tab-rate'
          className='space-y-6'
        >
          <div className='flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/80 backdrop-blur-md p-4 rounded-2xl border border-slate-800/80'>
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
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                    categoryFilter === cat
                      ? 'bg-sky-600 text-white shadow'
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
                className='bg-slate-950 border border-slate-800 px-4 py-2 rounded-xl text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 w-full sm:w-64'
              />
            </label>
          </div>

          <section className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl'>
            <div className='flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6'>
              <div>
                <h2 className='text-xl font-bold text-slate-100'>
                  Rating All Towers as{' '}
                  <span className='text-sky-400'>{currentUser}</span>
                </h2>
                <p className='text-sm text-slate-300 mt-0.5'>
                  Score every tower from 1 (Lowest) to 5 (Highest). Unrated
                  defaults to 0.
                </p>
              </div>
              <button
                onClick={() => setShowResetModal(true)}
                className='px-3.5 py-2 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-xl transition duration-200 flex items-center gap-1.5 self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
              >
                ↺ Reset {currentUser}'s Ratings
              </button>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
              {ALL_TOWERS.filter((tower) => {
                const meta = TOWER_METADATA[tower];
                if (searchTerm) {
                  const query = searchTerm.toLowerCase();
                  const matchName = tower.toLowerCase().includes(query);
                  const matchState = meta.state.toLowerCase().includes(query);
                  const matchCat = meta.category.toLowerCase().includes(query);
                  if (!matchName && !matchState && !matchCat) return false;
                }
                if (
                  categoryFilter !== 'All' &&
                  meta.category !== categoryFilter
                )
                  return false;
                return true;
              }).map((tower) => {
                const meta = TOWER_METADATA[tower];
                const score = ratings[currentUser]?.[tower];
                const isRated = score !== undefined && score > 0;
                return (
                  <div
                    key={tower}
                    className='bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl flex flex-col justify-between hover:border-slate-700/80 transition duration-200'
                  >
                    <div className='flex justify-between items-start mb-3'>
                      <div>
                        <span className='font-bold text-base text-slate-100'>
                          {tower}
                        </span>
                        <div className='flex items-center gap-1.5 mt-1'>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
                        </div>
                      </div>
                      {!isRated && (
                        <span className='text-[10px] font-semibold bg-slate-900 text-slate-400 px-2 py-0.5 rounded border border-slate-800'>
                          Unrated (0)
                        </span>
                      )}
                    </div>
                    <div
                      className='flex items-center justify-between gap-1 mt-2'
                      role='group'
                      aria-label={`Rate ${tower}`}
                    >
                      {[1, 2, 3, 4, 5].map((num) => (
                        <button
                          key={num}
                          onClick={() => handleRatingChange(tower, num)}
                          aria-label={`Rate ${tower} ${num} out of 5`}
                          aria-pressed={score === num}
                          className={`w-10 h-10 rounded-lg font-extrabold transition duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                            score === num
                              ? 'bg-sky-500 text-white scale-105 shadow-md shadow-sky-950'
                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                          }`}
                        >
                          {num}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
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
          className='space-y-6'
        >
          <section className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl'>
            <h2 className='text-xl font-bold text-slate-100 mb-2'>
              Select Final Target List (6 Slots)
            </h2>
            <p className='text-sm text-slate-300 mb-6'>
              Choose the 6 destination towers for the draft. Duplicates allowed.
              Options sorted alphabetically.
            </p>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'>
              {targetSlots.map((slotVal, sIdx) => {
                const meta = TOWER_METADATA[slotVal];
                return (
                  <div
                    key={sIdx}
                    className='bg-slate-950/80 p-4 rounded-xl border border-slate-800/80'
                  >
                    <div className='flex justify-between items-center mb-2'>
                      <label
                        htmlFor={`slot-${sIdx}`}
                        className='text-xs font-bold text-slate-300'
                      >
                        Target Slot #{sIdx + 1}
                      </label>
                      <div className='flex items-center gap-1.5'>
                        <CategoryBadge category={meta.category} />
                        <StateBadge state={meta.state} />
                      </div>
                    </div>
                    <select
                      id={`slot-${sIdx}`}
                      value={slotVal}
                      onChange={(e) => {
                        const newSlots = [...targetSlots];
                        newSlots[sIdx] = e.target.value;
                        setTargetSlots(newSlots);
                      }}
                      className='w-full bg-slate-900 text-sky-300 font-bold px-3 py-2 rounded-lg border border-slate-700/80 focus:outline-none focus:border-sky-500 cursor-pointer'
                    >
                      {ALL_TOWERS.map((t) => (
                        <option key={t} value={t}>
                          {t} ({TOWER_METADATA[t].category} -{' '}
                          {TOWER_METADATA[t].state})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            <button
              onClick={runOptimalDraft}
              className='w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3.5 px-6 rounded-xl transition duration-200 shadow-lg shadow-sky-900/50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
            >
              ⚡ Run Optimal Placement Algorithm (Maximize Team Happiness)
            </button>
          </section>

          {draftResult && (
            <section
              className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-6'
              aria-live='polite'
            >
              <div className='flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-800/80 pb-4'>
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
                <div className='text-right'>
                  <span className='text-2xl font-extrabold text-sky-400'>
                    {draftResult.averageScore}{' '}
                    <span className='text-xs text-slate-400 font-normal'>
                      avg rating
                    </span>
                  </span>
                </div>
              </div>

              {/* Option Selector for Tied Combinations */}
              {draftResult.options.length > 1 && (
                <div className='flex items-center gap-2 overflow-x-auto pb-2'>
                  <span className='text-xs font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap'>
                    View Tied Option:
                  </span>
                  {draftResult.options.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSelectedOptionIdx(idx)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition duration-150 ${
                        selectedOptionIdx === idx
                          ? 'bg-sky-600 text-white shadow-md'
                          : 'bg-slate-950 text-slate-300 border border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      Option #{idx + 1}
                    </button>
                  ))}
                </div>
              )}

              {/* Active Selected Assignment Grid */}
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                {users.map((u) => {
                  const currentOptionAssignments =
                    draftResult.options[selectedOptionIdx];
                  const assignment = currentOptionAssignments[u];
                  const meta = TOWER_METADATA[assignment.tower];
                  return (
                    <div
                      key={u}
                      className='bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl flex justify-between items-center'
                    >
                      <div>
                        <span className='text-xs text-slate-400 block font-semibold'>
                          Controller
                        </span>
                        <span className='font-bold text-slate-100 text-lg'>
                          {u}
                        </span>
                      </div>
                      <div className='text-center bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800'>
                        <div className='flex items-center justify-center gap-1.5 mb-1'>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
                        </div>
                        <span className='font-bold text-sky-300'>
                          {assignment.tower}
                        </span>
                      </div>
                      <div className='text-right'>
                        <span className='text-xs text-slate-400 block font-semibold'>
                          Rating
                        </span>
                        <span className='font-extrabold text-emerald-400 text-lg'>
                          {assignment.score} / 5
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </main>
      )}

      {/* TAB 3: MASTER LIST */}
      {activeTab === 'master' && (
        <main
          id='panel-master'
          role='tabpanel'
          aria-labelledby='tab-master'
          className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl'
        >
          <h2 className='text-xl font-bold text-slate-100 mb-2'>
            Master List of All 31 Towers
          </h2>
          <p className='text-sm text-slate-300 mb-6'>
            Ranked by overall team average preference (unrated defaults to 0).
          </p>

          <div className='space-y-3'>
            {sortedOverall.map((stats, idx) => (
              <div
                key={stats.tower}
                className='bg-slate-950/80 border border-slate-800/80 p-4 rounded-xl flex items-center justify-between'
              >
                <div className='flex items-center gap-4'>
                  <span className='w-8 h-8 rounded-full bg-sky-600/20 text-sky-300 font-extrabold flex items-center justify-center border border-sky-500/40'>
                    #{idx + 1}
                  </span>
                  <div>
                    <div className='flex items-center gap-2'>
                      <span className='font-bold text-lg text-slate-100'>
                        {stats.tower}
                      </span>
                      <CategoryBadge category={stats.category} />
                      <StateBadge state={stats.state} />
                    </div>
                  </div>
                </div>
                <div className='text-right'>
                  <span className='text-xl font-extrabold text-sky-400'>
                    {stats.avg}
                  </span>
                  <span className='text-xs text-slate-400 block'>
                    {stats.ratingsCount}/6 explicitly rated
                  </span>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* TAB 4: RATING MATRIX */}
      {activeTab === 'matrix' && (
        <main
          id='panel-matrix'
          role='tabpanel'
          aria-labelledby='tab-matrix'
          className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl overflow-x-auto'
        >
          <h2 className='text-xl font-bold text-slate-100 mb-2'>
            Controller Rating Heatmap Matrix
          </h2>
          <p className='text-sm text-slate-300 mb-6'>
            Color-coded individual preference matrix (* = unrated default 0).
          </p>

          <table className='w-full text-left border-collapse'>
            <thead>
              <tr className='border-b border-slate-800 text-slate-300 text-sm'>
                <th scope='col' className='py-3 px-4 font-bold'>
                  Tower
                </th>
                {users.map((u) => (
                  <th
                    key={u}
                    scope='col'
                    className='py-3 px-4 text-center font-bold'
                  >
                    {u}
                  </th>
                ))}
                <th
                  scope='col'
                  className='py-3 px-4 text-center font-bold text-sky-400'
                >
                  Average
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-800/60'>
              {sortedOverall.map((stats) => (
                <tr key={stats.tower} className='hover:bg-slate-950/50'>
                  <th scope='row' className='py-3 px-4 font-normal'>
                    <div className='flex items-center gap-2'>
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
                      <td key={u} className='py-3 px-4 text-center'>
                        <span
                          className={`inline-block w-8 h-8 leading-8 rounded-lg font-bold text-sm ${getHeatmapClass(score)}`}
                        >
                          {score}
                          {!isExplicit && '*'}
                        </span>
                      </td>
                    );
                  })}
                  <td className='py-3 px-4 text-center font-extrabold text-sky-400'>
                    {stats.avg}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      )}

      {/* TAB 5: STATS & HOT-TO-NOT */}
      {activeTab === 'stats' && (
        <main
          id='panel-stats'
          role='tabpanel'
          aria-labelledby='tab-stats'
          className='space-y-6'
        >
          <section className='bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl'>
            <h2 className='text-xl font-bold text-slate-100 mb-2'>
              🌡️ Station "Hot to Not" Leaderboard
            </h2>
            <p className='text-sm text-slate-300 mb-6'>
              All 31 towers ranked from highest station preference to lowest.
            </p>

            <div className='space-y-2'>
              {sortedOverall.map((stats, idx) => {
                const isHot = idx < 5;
                const isNot = idx >= sortedOverall.length - 5;
                return (
                  <div
                    key={stats.tower}
                    className='bg-slate-950/80 border border-slate-800/80 px-4 py-3 rounded-xl flex items-center justify-between'
                  >
                    <div className='flex items-center gap-3'>
                      <span className='w-7 text-center font-bold text-slate-400 text-sm'>
                        #{idx + 1}
                      </span>
                      <div className='flex items-center gap-2'>
                        <span className='font-bold text-slate-100'>
                          {stats.tower}
                        </span>
                        <CategoryBadge category={stats.category} />
                        <StateBadge state={stats.state} />
                      </div>
                    </div>
                    <div className='flex items-center gap-3'>
                      {isHot && (
                        <span className='text-xs bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded font-bold'>
                          🔥 Hot
                        </span>
                      )}
                      {isNot && (
                        <span className='text-xs bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-bold'>
                          ❄️ Not
                        </span>
                      )}
                      <span className='font-extrabold text-sky-400 w-12 text-right'>
                        {stats.avg}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      )}

      {/* Dark Confirmation Modal */}
      {showResetModal && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm'
          role='dialog'
          aria-modal='true'
          aria-labelledby='modal-title'
        >
          <div className='bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4'>
            <div className='flex items-center gap-3'>
              <div
                className='w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-lg'
                aria-hidden='true'
              >
                ⚠️
              </div>
              <div>
                <h3
                  id='modal-title'
                  className='text-lg font-bold text-slate-100'
                >
                  Reset Controller Ratings?
                </h3>
                <p className='text-xs text-slate-400'>
                  Action cannot be undone
                </p>
              </div>
            </div>

            <p className='text-sm text-slate-300 leading-relaxed'>
              Are you sure you want to reset all tower ratings for{' '}
              <strong className='text-sky-300'>{currentUser}</strong>? All 31
              towers will revert to unrated status (
              <code className='text-xs bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-300 font-mono'>
                0
              </code>
              ).
            </p>

            <div className='flex justify-end gap-3 pt-2'>
              <button
                ref={cancelButtonRef}
                onClick={() => setShowResetModal(false)}
                className='px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl transition duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400'
              >
                Cancel
              </button>
              <button
                onClick={confirmResetUserRatings}
                className='px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-xl transition duration-200 shadow-lg shadow-rose-950 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400'
              >
                Confirm Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

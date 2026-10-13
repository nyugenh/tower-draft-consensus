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

// State Badge styling lookup (Optimized contrast for dark mode)
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

  const handleRandomizeSlots = () => {
    const shuffled = [...ALL_TOWERS].sort(() => 0.5 - Math.random());
    setTargetSlots(shuffled.slice(0, 6));
  };

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
    let highScorers = [];

    users.forEach((u) => {
      const s = ratings[u]?.[tower];
      if (s !== undefined && s > 0) {
        total += s;
        explicitCount++;
        scores.push(s);
        if (s >= 4) highScorers.push(u);
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
      highScorers,
    };
  });

  const sortedOverall = [...towerMetrics].sort((a, b) => b.rawAvg - a.rawAvg);

  // Compute Category & State Aggregates
  const categoriesList = ['Radar', 'Regional', 'Metro D'];
  const categoryStats = categoriesList.map((cat) => {
    const items = towerMetrics.filter((m) => m.category === cat);
    const totalAvg =
      items.reduce((sum, item) => sum + item.rawAvg, 0) / (items.length || 1);
    const topTower = [...items].sort((a, b) => b.rawAvg - a.rawAvg)[0];
    return {
      category: cat,
      count: items.length,
      avg: totalAvg.toFixed(2),
      topTower: topTower ? topTower.tower : 'N/A',
    };
  });

  const statesList = ['NSW', 'QLD', 'VIC', 'WA', 'SA', 'TAS', 'NT', 'ACT'];
  const stateStats = statesList
    .map((st) => {
      const items = towerMetrics.filter((m) => m.state === st);
      const totalAvg =
        items.length > 0
          ? items.reduce((sum, item) => sum + item.rawAvg, 0) / items.length
          : 0;
      const topTower =
        items.length > 0
          ? [...items].sort((a, b) => b.rawAvg - a.rawAvg)[0]
          : null;
      return {
        state: st,
        count: items.length,
        avg: totalAvg.toFixed(2),
        topTower: topTower ? topTower.tower : 'N/A',
      };
    })
    .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

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
      return 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';
    if (score === 4)
      return 'bg-sky-500/20 text-sky-300 border border-sky-500/40';
    if (score === 3)
      return 'bg-slate-800/80 text-slate-300 border border-slate-700/60';
    if (score === 2)
      return 'bg-amber-500/20 text-amber-300 border border-amber-500/40';
    if (score === 1)
      return 'bg-rose-500/20 text-rose-300 border border-rose-500/40';
    return 'bg-slate-900/60 text-slate-400 border border-slate-800/80'; // 0 / unrated
  };

  // Calculate total team score competition for target slots
  const towerDemand = {};
  targetSlots.forEach((t) => {
    towerDemand[t] = users.reduce((sum, u) => sum + getScore(u, t), 0);
  });

  return (
    <div className='max-w-7xl mx-auto p-4 md:p-8 font-sans text-slate-100 antialiased relative min-h-screen bg-slate-950'>
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
                    {ratedCount}/31
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

      {/* Navigation Bar */}
      <nav aria-label='Main Navigation' className='mb-6'>
        <div
          role='tablist'
          aria-label='App Navigation'
          className='bg-slate-900/90 backdrop-blur-xl p-2.5 rounded-3xl border border-slate-800/80 flex flex-wrap sm:flex-nowrap gap-2 shadow-2xl'
        >
          <button
            role='tab'
            id='tab-rate'
            aria-selected={activeTab === 'rate'}
            aria-controls='panel-rate'
            onClick={() => setActiveTab('rate')}
            className={`flex-1 min-w-[150px] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer box-border ${
              activeTab === 'rate'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            <span>🎯 Rate Towers</span>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-md ${activeTab === 'rate' ? 'bg-sky-700 text-sky-100' : 'bg-slate-800 text-slate-400'}`}
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
            className={`flex-1 min-w-[150px] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer box-border ${
              activeTab === 'draft'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            ⚡ Target Draft
          </button>
          <button
            role='tab'
            id='tab-hot-to-not'
            aria-selected={activeTab === 'hot-to-not'}
            aria-controls='panel-hot-to-not'
            onClick={() => setActiveTab('hot-to-not')}
            className={`flex-1 min-w-[150px] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer box-border ${
              activeTab === 'hot-to-not'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            🔥 Hot to Not
          </button>
          <button
            role='tab'
            id='tab-rivalry'
            aria-selected={activeTab === 'rivalry'}
            aria-controls='panel-rivalry'
            onClick={() => setActiveTab('rivalry')}
            className={`flex-1 min-w-[150px] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer box-border ${
              activeTab === 'rivalry'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            ⚔️ Head to Head
          </button>
          <button
            role='tab'
            id='tab-breakdown'
            aria-selected={activeTab === 'breakdown'}
            aria-controls='panel-breakdown'
            onClick={() => setActiveTab('breakdown')}
            className={`flex-1 min-w-[150px] px-4 py-3 rounded-2xl text-xs sm:text-sm font-bold transition-colors duration-150 flex items-center justify-center gap-2 cursor-pointer box-border ${
              activeTab === 'breakdown'
                ? 'bg-sky-600 text-white shadow-lg shadow-sky-950 border border-transparent'
                : 'bg-slate-950/60 text-slate-300 hover:bg-slate-800/80 border border-slate-800/60'
            }`}
          >
            📊 Best to Rest
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
          <div className='flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-900/80 backdrop-blur-xl p-4 md:p-5 rounded-3xl border border-slate-800/80 shadow-xl'>
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
                  Score every tower from 1 (Lowest) to 5 (Highest). Unrated
                  defaults to 0.
                </p>
              </div>
              <button
                onClick={() => setShowResetModal(true)}
                className='px-4 py-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 shadow-md'
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
                    className='bg-slate-950/80 border border-slate-800/80 p-5 rounded-2xl flex flex-col justify-between hover:border-slate-700 transition duration-200 shadow-inner'
                  >
                    <div className='flex justify-between items-start mb-4'>
                      <div>
                        <span className='font-bold text-base text-slate-100'>
                          {tower}
                        </span>
                        <div className='flex items-center gap-2.5 mt-1.5'>
                          <CategoryBadge category={meta.category} />
                          <StateBadge state={meta.state} />
                        </div>
                      </div>
                      {!isRated && (
                        <span className='text-[10px] font-semibold bg-slate-900 text-slate-400 px-2.5 py-1 rounded-lg border border-slate-800'>
                          Unrated (0)
                        </span>
                      )}
                    </div>
                    <div
                      className='flex items-center justify-between gap-1.5 mt-2'
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
              <button
                onClick={handleRandomizeSlots}
                className='px-4 py-2.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 shadow-md'
              >
                🎲 Random 6 Towers
              </button>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'>
              {targetSlots.map((slotVal, sIdx) => {
                const meta = TOWER_METADATA[slotVal];
                return (
                  <div
                    key={sIdx}
                    className='bg-slate-950/80 p-5 rounded-2xl border border-slate-800/80 shadow-inner'
                  >
                    <div className='flex justify-between items-center mb-2.5'>
                      <label
                        htmlFor={`slot-${sIdx}`}
                        className='text-xs font-bold text-slate-300'
                      >
                        Target Slot #{sIdx + 1}
                      </label>
                      <div className='flex items-center gap-2.5'>
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
                      className='w-full bg-slate-900 text-sky-300 font-bold px-3.5 py-2.5 rounded-xl border border-slate-700/80 focus:outline-none focus:border-sky-500 cursor-pointer text-sm shadow-inner'
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
              className='w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-4 px-6 rounded-2xl transition duration-200 shadow-xl shadow-sky-950 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 text-base'
            >
              ⚡ Run Optimal Placement Algorithm (Maximize Team Happiness)
            </button>
          </section>

          {draftResult && (
            <section
              className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6'
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
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer transition duration-150 ${
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
              <div>
                <h4 className='text-xs font-bold text-slate-400 uppercase tracking-wider mb-3'>
                  Assigned Placements
                </h4>
                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {users.map((u) => {
                    const currentOptionAssignments =
                      draftResult.options[selectedOptionIdx];
                    const assignment = currentOptionAssignments[u];
                    const meta = TOWER_METADATA[assignment.tower];
                    return (
                      <div
                        key={u}
                        className='bg-slate-950/80 border border-slate-800/80 p-5 rounded-2xl flex justify-between items-center shadow-inner'
                      >
                        <div>
                          <span className='text-xs text-slate-400 block font-semibold'>
                            Controller
                          </span>
                          <span className='font-bold text-slate-100 text-lg'>
                            {u}
                          </span>
                        </div>
                        <div className='text-center bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800'>
                          <div className='flex items-center justify-center gap-2 mb-1'>
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
              </div>

              {/* Individual Form Submission Guides (Ranked 1 to 6) */}
              <div className='pt-4 border-t border-slate-800/80'>
                <h4 className='text-sm font-bold text-slate-100 mb-1 flex items-center gap-2'>
                  <span>📝 Form Submission Guides for Each ATC</span>
                </h4>
                <p className='text-xs text-slate-400 mb-4'>
                  How each controller should rank the 6 target towers on their
                  individual preference submission forms based on their rated
                  scores:
                </p>

                <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
                  {users.map((u) => {
                    const currentOptionAssignments =
                      draftResult.options[selectedOptionIdx];
                    const assignedTowerName =
                      currentOptionAssignments[u]?.tower;

                    // Rank the 6 target slots with Strategic Fallback Optimization
                    const rankedTargets = targetSlots
                      .map((tower) => ({
                        tower,
                        score: getScore(u, tower),
                        isAssigned: tower === assignedTowerName,
                        competitionScore: towerDemand[tower], // Total team score demand
                        meta: TOWER_METADATA[tower],
                      }))
                      .sort((a, b) => {
                        // 1. Primary: Personal explicit rating score (5/5 beats 4/5)
                        if (b.score !== a.score) return b.score - a.score;

                        // 2. Secondary: Force the assigned draft tower to #1 within its score bracket
                        if (a.isAssigned !== b.isAssigned)
                          return a.isAssigned ? -1 : 1;

                        // 3. Fallback Optimization: If scores tie, prioritize towers with LOWER team competition
                        if (a.competitionScore !== b.competitionScore) {
                          return a.competitionScore - b.competitionScore;
                        }

                        // 4. Final tie-break: Alphabetical order
                        return a.tower.localeCompare(b.tower);
                      });

                    return (
                      <div
                        key={u}
                        className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl space-y-2.5 shadow-inner'
                      >
                        <div className='flex justify-between items-center border-b border-slate-800 pb-2.5'>
                          <span className='font-bold text-sky-300 text-sm'>
                            {u}'s Form Order
                          </span>
                          <span className='text-[10px] bg-slate-900 px-2.5 py-0.5 rounded-md text-slate-400 font-mono'>
                            1 to 6
                          </span>
                        </div>
                        <ol className='space-y-2 pt-1'>
                          {rankedTargets.map((item, rIdx) => (
                            <li
                              key={rIdx}
                              className={`flex items-center justify-between text-xs px-3 py-2 rounded-xl border transition ${
                                item.isAssigned
                                  ? 'bg-sky-950/40 border-sky-600/50 text-sky-200 font-bold shadow-sm'
                                  : 'bg-slate-900/60 border-slate-800/60 text-slate-300'
                              }`}
                            >
                              <div className='flex items-center gap-2'>
                                <span className='font-extrabold text-sky-400 w-4'>
                                  #{rIdx + 1}
                                </span>
                                <span>{item.tower}</span>
                                {item.isAssigned && (
                                  <span className='text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-md font-bold'>
                                    Assigned
                                  </span>
                                )}
                              </div>
                              <div className='flex items-center gap-2'>
                                <StateBadge state={item.meta.state} />
                                <span className='font-mono text-slate-400 text-[11px]'>
                                  {item.score}/5
                                </span>
                              </div>
                            </li>
                          ))}
                        </ol>
                      </div>
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
          className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl overflow-x-auto'
        >
          <div className='mb-6'>
            <h2 className='text-xl font-bold text-slate-100 mb-2'>
              🔥 Hot to Not Score Matrix
            </h2>
            <p className='text-sm text-slate-300'>
              Color-coded controller preference matrix ranked from highest team
              average down to lowest (* = unrated default 0).
            </p>
          </div>

          <table className='w-full text-left border-collapse min-w-[650px]'>
            <thead>
              <tr className='border-b border-slate-800 text-slate-300 text-sm'>
                <th scope='col' className='py-3.5 px-4 font-bold'>
                  Tower
                </th>
                {users.map((u) => (
                  <th
                    key={u}
                    scope='col'
                    className='py-3.5 px-4 text-center font-bold'
                  >
                    {u}
                  </th>
                ))}
                <th
                  scope='col'
                  className='py-3.5 px-4 text-center font-bold text-sky-400'
                >
                  Average
                </th>
              </tr>
            </thead>
            <tbody className='divide-y divide-slate-800/60'>
              {sortedOverall.map((stats) => (
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
                          {score}
                          {!isExplicit && '*'}
                        </span>
                      </td>
                    );
                  })}
                  <td className='py-3.5 px-4 text-center font-extrabold text-sky-400 text-base'>
                    {stats.avg}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </main>
      )}

      {/* TAB 4: RIVALRY & COMPETITION RADAR */}
      {activeTab === 'rivalry' && (
        <main
          id='panel-rivalry'
          role='tabpanel'
          aria-labelledby='panel-rivalry'
          className='space-y-6'
        >
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl'>
            <div className='mb-6'>
              <h2 className='text-xl font-bold text-slate-100 mb-2'>
                ⚔️ Contested Stations & High Rivalry
              </h2>
              <p className='text-sm text-slate-300'>
                Towers where multiple controllers have rated 4/5 or 5/5, ranked
                by highest direct competition.
              </p>
            </div>

            <div className='space-y-3.5'>
              {sortedOverall
                .filter((s) => s.highScorers.length > 0)
                .sort((a, b) => {
                  // 1st Priority: Most high scorers (most people competing for it)
                  if (b.highScorers.length !== a.highScorers.length) {
                    return b.highScorers.length - a.highScorers.length;
                  }
                  // 2nd Priority: Highest team average score
                  return b.rawAvg - a.rawAvg;
                })
                .map((stats) => (
                  <div
                    key={stats.tower}
                    className='bg-slate-950/80 border border-slate-800 p-5 rounded-2xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shadow-inner'
                  >
                    <div className='flex items-center gap-3'>
                      <div className='flex items-center gap-2.5'>
                        <span className='font-bold text-lg text-slate-100'>
                          {stats.tower}
                        </span>
                        <CategoryBadge category={stats.category} />
                        <StateBadge state={stats.state} />
                      </div>
                    </div>
                    <div className='flex flex-wrap items-center gap-2'>
                      <span className='text-xs text-slate-400 font-semibold'>
                        High Scorer Contestants ({stats.highScorers.length}):
                      </span>
                      {stats.highScorers.map((con) => (
                        <span
                          key={con}
                          className='text-xs bg-sky-950/90 text-sky-300 border border-sky-800/80 px-2.5 py-1 rounded-lg font-bold'
                        >
                          {con}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </section>
        </main>
      )}

      {/* TAB 5: CATEGORY & STATE STATS */}
      {activeTab === 'breakdown' && (
        <main
          id='panel-breakdown'
          role='tabpanel'
          aria-labelledby='tab-breakdown'
          className='space-y-6'
        >
          {/* Category Breakdown */}
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl'>
            <div className='mb-6'>
              <h2 className='text-xl font-bold text-slate-100 mb-2'>
                📊 Group Preference by Tower Type
              </h2>
              <p className='text-sm text-slate-300'>
                Aggregated preference metrics across Radar, Regional, and Metro
                D classifications.
              </p>
            </div>

            <div className='grid grid-cols-1 md:grid-cols-3 gap-5'>
              {categoryStats.map((cat) => (
                <div
                  key={cat.category}
                  className='bg-slate-950/80 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner'
                >
                  <div className='flex justify-between items-center mb-4'>
                    <span className='font-bold text-lg text-slate-100'>
                      {cat.category}
                    </span>
                    <CategoryBadge category={cat.category} />
                  </div>
                  <div className='space-y-2.5'>
                    <div className='flex justify-between items-center text-sm border-b border-slate-800/60 pb-2'>
                      <span className='text-slate-400'>Total Towers</span>
                      <span className='font-bold text-slate-200'>
                        {cat.count}
                      </span>
                    </div>
                    <div className='flex justify-between items-center text-sm border-b border-slate-800/60 pb-2'>
                      <span className='text-slate-400'>
                        Group Average Score
                      </span>
                      <span className='font-extrabold text-sky-400 text-base'>
                        {cat.avg} / 5
                      </span>
                    </div>
                    <div className='flex justify-between items-center text-sm pt-1'>
                      <span className='text-slate-400'>Top Pick</span>
                      <span className='font-bold text-emerald-400'>
                        {cat.topTower}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* State Breakdown */}
          <section className='bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl'>
            <div className='mb-6'>
              <h2 className='text-xl font-bold text-slate-100 mb-2'>
                🗺️ Group Preference by Australian State
              </h2>
              <p className='text-sm text-slate-300'>
                Ranked state geographical appeal based on group ratings across
                all 31 towers.
              </p>
            </div>

            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4'>
              {stateStats.map((st) => (
                <div
                  key={st.state}
                  className='bg-slate-950/80 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner'
                >
                  <div className='flex justify-between items-center mb-3.5'>
                    <StateBadge state={st.state} />
                    <span className='text-xs font-mono text-slate-400'>
                      {st.count} {st.count === 1 ? 'Tower' : 'Towers'}
                    </span>
                  </div>
                  <div className='space-y-2.5'>
                    <div className='flex justify-between items-center text-sm border-b border-slate-800/60 pb-2'>
                      <span className='text-slate-400'>State Avg Score</span>
                      <span className='font-extrabold text-sky-400 text-base'>
                        {st.avg}
                      </span>
                    </div>
                    <div className='flex justify-between items-center text-sm pt-1'>
                      <span className='text-slate-400'>Top Station</span>
                      <span className='font-bold text-emerald-400'>
                        {st.topTower}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </main>
      )}

      {/* Dark Confirmation Modal */}
      {showResetModal && (
        <div
          className='fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md'
          role='dialog'
          aria-modal='true'
          aria-labelledby='modal-title'
        >
          <div className='bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 max-w-md w-full shadow-2xl space-y-4'>
            <div className='flex items-center gap-3'>
              <div
                className='w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-lg'
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
              <code className='text-xs bg-slate-950 px-1.5 py-0.5 rounded-md border border-slate-800 text-slate-300 font-mono'>
                0
              </code>
              ).
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
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.render(<App />, document.getElementById('root'));

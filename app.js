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
  const isSavingRef = useRef(false);
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
  // Set to { user, tower } (the form row clicked to lock/unlock), so the next
  // redraft flashes the towers that move, except the row that was clicked.
  const lockFlashPendingRef = useRef(null);

  // Hot to Not table sorting: key is 'tower', 'avg', or a controller name
  const [matrixSort, setMatrixSort] = useState({ key: 'avg', dir: 'desc' });

  // Manual Locks State: { [user]: towerName }
  const [manualLocks, setManualLocks] = useState({});

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
          const cloudJson = JSON.stringify(cloudData);
          if (cloudJson !== localStorage.getItem('atc_tower_rankings_gsheet')) {
            setRatings(cloudData);
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
    lockFlashPendingRef.current = { user: u, tower, fromCard };
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
    // Unrated (0) scores are left out: averages and variance only use real ratings
    const ratedScores = scores.filter((v) => v > 0);
    const avg = explicitCount > 0 ? total / explicitCount : 0;
    let variance = 0;
    if (ratedScores.length > 1) {
      variance =
        ratedScores.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) /
        ratedScores.length;
    }

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
        return m.scoresMap[key] > 0 ? m.scoresMap[key] : null;
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

  // Compute Category & State Aggregates
  const categoriesList = ['Radar', 'Regional', 'Metro D'];
  const categoryStats = categoriesList
    .map((cat) => {
      const items = towerMetrics.filter((m) => m.category === cat);
      const ratedItems = items.filter((m) => m.ratingsCount > 0);
      const totalAvg =
        ratedItems.reduce((sum, item) => sum + item.rawAvg, 0) /
        (ratedItems.length || 1);
      const topTower = [...ratedItems].sort(
        (a, b) => b.rawAvg - a.rawAvg || b.ratingsCount - a.ratingsCount,
      )[0];
      return {
        category: cat,
        count: items.length,
        avg: totalAvg.toFixed(2),
        topTower: topTower ? topTower.tower : 'N/A',
      };
    })
    .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

  const statesList = ['NSW', 'QLD', 'VIC', 'WA', 'SA', 'TAS', 'NT', 'ACT'];
  const stateStats = statesList
    .map((st) => {
      const items = towerMetrics.filter((m) => m.state === st);
      const ratedItems = items.filter((m) => m.ratingsCount > 0);
      const totalAvg =
        ratedItems.length > 0
          ? ratedItems.reduce((sum, item) => sum + item.rawAvg, 0) /
            ratedItems.length
          : 0;
      const topTower =
        ratedItems.length > 0
          ? [...ratedItems].sort(
              (a, b) => b.rawAvg - a.rawAvg || b.ratingsCount - a.ratingsCount,
            )[0]
          : null;
      return {
        state: st,
        count: items.length,
        avg: totalAvg.toFixed(2),
        topTower: topTower ? topTower.tower : 'N/A',
      };
    })
    .sort((a, b) => parseFloat(b.avg) - parseFloat(a.avg));

  // Trivia Insights Derivation
  const ratedTowers = towerMetrics.filter((m) => m.ratingsCount > 0);
  const mostPolarised = towerMetrics
    .filter((m) => m.ratingsCount >= 2)
    .sort(
      (a, b) => b.variance - a.variance || b.ratingsCount - a.ratingsCount,
    )[0];

  // Optimal Draft Permutation Engine with Frequency-Validated Locks
  const runOptimalDraft = () => {
    const lockClick = lockFlashPendingRef.current;
    const lockTriggered = lockClick !== null;
    lockFlashPendingRef.current = null;
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

    const nextOptions = formattedOptions.length > 0 ? formattedOptions : [{}];
    const draftKey = JSON.stringify([bestGlobalScore, nextOptions]);
    if (draftKey === lastDraftKeyRef.current) return;
    lastDraftKeyRef.current = draftKey;

    setDraftResult({
      totalScore: bestGlobalScore,
      averageScore: (bestGlobalScore / users.length).toFixed(2),
      options: nextOptions,
    });
    setSelectedOptionIdx(0);

    // After a lock/unlock, flash whichever controllers' towers changed
    const changed = {};
    if (lockTriggered) {
      const prevOption = draftResult?.options?.[selectedOptionIdx] || {};
      const nextOption = nextOptions[0] || {};
      users.forEach((u) => {
        const from = prevOption[u]?.tower;
        const to = nextOption[u]?.tower;
        if (from && to && from !== to) {
          changed[u] = { from, to };
          // In the form being clicked, don't flash the clicked tower itself
          if (u === lockClick.user) {
            changed[u].skipTower = lockClick.tower;
            changed[u].skipCard = lockClick.fromCard;
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
              <button
                onClick={() => setShowResetModal(true)}
                className='px-4 py-2.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 self-start sm:self-auto cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 shadow-md'
              >
                ↺ Reset {currentUser}'s Ratings
              </button>
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
                  className='px-4 py-2.5 bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-700/80 text-indigo-200 text-xs font-bold rounded-2xl transition duration-200 flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 shadow-md'
                >
                  🎲 Randomise 6 Towers
                </button>
              </div>
            </div>

            {/* Scrolling Grid of 6 Slots */}
            <div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6'>
              {targetSlots.map((slotVal, sIdx) => {
                const meta = TOWER_METADATA[slotVal];
                return (
                  <div
                    key={sIdx}
                    className='bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 shadow-inner'
                  >
                    <div className='flex justify-between items-center mb-2'>
                      <label
                        htmlFor={`slot-${sIdx}`}
                        className='text-xs font-bold text-slate-300'
                      >
                        Target Slot #{sIdx + 1}
                      </label>
                      <div className='flex items-center gap-2'>
                        <CategoryBadge category={meta.category} />
                        <StateBadge state={meta.state} />
                      </div>
                    </div>
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
                  </div>
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

                {/* Clear Locks Button Area (Inline when no tied options, wraps/aligns when tied options are present) */}
                <div
                  className={`flex items-center min-h-[36px] shrink-0 w-full sm:w-auto justify-end ${Object.keys(manualLocks).length > 0 ? '' : 'invisible'}`}
                >
                  <button
                    onClick={() => setManualLocks({})}
                    disabled={Object.keys(manualLocks).length === 0}
                    className='px-3.5 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/80 text-rose-200 text-xs font-bold rounded-xl transition duration-200 cursor-pointer shadow-md whitespace-nowrap'
                  >
                    Clear Locks ({Object.keys(manualLocks).length})
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
                      <div
                        key={u}
                        role='button'
                        tabIndex={0}
                        aria-pressed={isLocked}
                        title={`Click to ${isLocked ? 'unlock' : 'lock'} ${assignment.tower} for ${u}`}
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
                        className={`relative p-5 rounded-2xl flex justify-between items-center shadow-inner border transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                          isLocked
                            ? 'bg-emerald-950/40 border-emerald-500/80 ring-1 ring-emerald-500/40'
                            : 'bg-slate-950/80 border-slate-800/80 hover:border-slate-600'
                        } ${flashInfo && !flashInfo.skipCard ? `tie-flash-${tieFlash.id % 2}` : ''}`}
                      >
                        {flashInfo && !flashInfo.skipCard && (
                          <span className='absolute -top-2.5 right-4 text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-950 border border-amber-500/70 text-amber-300 shadow-md'>
                            was {flashInfo.from}
                          </span>
                        )}
                        <div>
                          <span className='text-xs text-slate-400 block font-semibold'>
                            Controller
                          </span>
                          <span className='font-bold text-slate-100 text-lg'>
                            {u}
                          </span>
                        </div>
                        <div
                          className={`text-center px-3.5 py-2 rounded-xl border ${isLocked ? 'bg-emerald-950/60 border-emerald-700/60' : 'bg-slate-900 border-slate-800'}`}
                        >
                          <div className='flex items-center justify-center gap-2 mb-1'>
                            <CategoryBadge category={meta.category} />
                            <StateBadge state={meta.state} />
                          </div>
                          <span
                            className={`font-bold ${isLocked ? 'text-emerald-300' : 'text-sky-300'}`}
                          >
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
                    const uniqueTargetTowers = [...new Set(targetSlots || [])];
                    const currentLock = manualLocks[u];
                    const assignedTowerName =
                      draftResult.options[selectedOptionIdx]?.[u]?.tower;

                    // 1. #1 is EXACTLY what was calculated in the optimal placement result (or manual lock if set)
                    const topTowerName = currentLock || assignedTowerName;

                    // 2. Gather all other target towers, sorted by personal score descending
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

                    // 3. Combine: #1 is at the top, followed by the rest cleanly without duplicates
                    let items = [
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

                    return (
                      <div
                        key={u}
                        className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl space-y-2.5 shadow-inner'
                      >
                        <div>
                          <span className='text-xs text-slate-400 block font-semibold'>
                            Controller
                          </span>
                          <span className='font-bold text-slate-100 text-lg'>
                            {u}
                          </span>
                        </div>
                        <ol className='space-y-2 pt-1'>
                          {items.map((item, rIdx) => {
                            const isThisLocked = currentLock === item.tower;
                            const flashInfo = tieFlash?.users?.[u];
                            const isFlashRow =
                              flashInfo &&
                              item.tower !== flashInfo.skipTower &&
                              (item.tower === flashInfo.to ||
                                item.tower === flashInfo.from);
                            return (
                              <li
                                key={`${item.tower}-${rIdx}`}
                                onClick={() => toggleLock(u, item.tower)}
                                title={`Click to lock ${item.tower} as #1 for ${u}`}
                                className={`flex flex-wrap items-center justify-between gap-y-1.5 text-xs px-3 py-2 rounded-xl border transition cursor-pointer ${isFlashRow ? `tie-flash-${tieFlash.id % 2}` : ''} ${
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
                💡 Team Rating Trivia & Superlatives
              </h2>
              <p className='text-sm text-slate-400'>
                Live statistics, structural breakdowns, and controller
                personalities derived straight from team ratings.
              </p>
            </div>

            {/* SECTION 1: TOWER CONSENSUS & DISTRIBUTION */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2 border-b border-slate-800/80 pb-2'>
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                  Tower Consensus & Distribution
                </span>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                {/* Card 1: Most Polarised Tower */}
                <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                  <div className='flex items-center gap-3'>
                    <div className='w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold text-lg shrink-0'>
                      ⚡
                    </div>
                    <div>
                      <h3 className='font-bold text-slate-100 text-sm'>
                        Most Polarised
                      </h3>
                      <p className='text-[11px] text-slate-400 line-clamp-1'>
                        Highest score variance
                      </p>
                    </div>
                  </div>
                  <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                    <div className='min-w-0'>
                      <span className='font-bold text-sm text-sky-300 block truncate'>
                        {mostPolarised ? mostPolarised.tower : 'N/A'}
                      </span>
                      <div className='flex items-center gap-1 mt-1'>
                        {mostPolarised && (
                          <CategoryBadge category={mostPolarised.category} />
                        )}
                        {mostPolarised && (
                          <StateBadge state={mostPolarised.state} />
                        )}
                      </div>
                    </div>
                    <div className='text-right shrink-0'>
                      <span className='text-[10px] text-slate-400 block font-semibold'>
                        Variance
                      </span>
                      <span className='font-mono text-amber-400 font-extrabold text-sm'>
                        {mostPolarised ? mostPolarised.variance : '0.00'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card 2: Most Unanimous Tower */}
                {(() => {
                  const unanimous = [...towerMetrics]
                    .filter((m) => m.ratingsCount >= 2)
                    .sort(
                      (a, b) =>
                        a.variance - b.variance ||
                        b.rawAvg - a.rawAvg ||
                        b.ratingsCount - a.ratingsCount,
                    )[0];

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🤝
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Most Unanimous
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Lowest score variance
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-sky-300 block truncate'>
                            {unanimous ? unanimous.tower : 'N/A'}
                          </span>
                          <div className='flex items-center gap-1 mt-1'>
                            {unanimous && (
                              <CategoryBadge category={unanimous.category} />
                            )}
                            {unanimous && (
                              <StateBadge state={unanimous.state} />
                            )}
                          </div>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Variance
                          </span>
                          <span className='font-mono text-cyan-400 font-extrabold text-sm'>
                            {unanimous ? unanimous.variance : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 3: Five-Star Favourites */}
                {(() => {
                  const perfectCount = towerMetrics.filter((m) =>
                    Object.values(m.scoresMap).includes(5),
                  ).length;
                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          ⭐
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Five-Star Favourites
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Towers given a 5/5
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-yellow-300 block truncate'>
                            {perfectCount} of 31 Towers
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Top tier status
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Share
                          </span>
                          <span className='font-mono text-yellow-400 font-extrabold text-sm'>
                            {Math.round((perfectCount / 31) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 4: One-Star Rejections */}
                {(() => {
                  const lowestCount = towerMetrics.filter((m) =>
                    Object.values(m.scoresMap).includes(1),
                  ).length;
                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🚫
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            One-Star Rejections
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Towers given a 1/5
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-rose-300 block truncate'>
                            {lowestCount} of 31 Towers
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Bottom tier status
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Share
                          </span>
                          <span className='font-mono text-rose-400 font-extrabold text-sm'>
                            {Math.round((lowestCount / 31) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* SECTION 2: CONTROLLER PAIRINGS & TEAM DYNAMICS */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2 border-b border-slate-800/80 pb-2'>
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                  Controller Pairings & Group Deviation
                </span>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                {/* Card 5: Rating Twins */}
                {(() => {
                  let twins = null;
                  for (let i = 0; i < users.length; i++) {
                    for (let j = i + 1; j < users.length; j++) {
                      let shared = 0;
                      let exact = 0;
                      let gapTotal = 0;
                      ALL_TOWERS.forEach((t) => {
                        const x = ratings[users[i]]?.[t];
                        const y = ratings[users[j]]?.[t];
                        if (x > 0 && y > 0) {
                          shared++;
                          gapTotal += Math.abs(x - y);
                          if (x === y) exact++;
                        }
                      });
                      if (shared < 5) continue;
                      const gap = gapTotal / shared;
                      if (
                        !twins ||
                        gap < twins.gap ||
                        (gap === twins.gap && shared > twins.shared)
                      ) {
                        twins = {
                          a: users[i],
                          b: users[j],
                          gap,
                          shared,
                          exact,
                        };
                      }
                    }
                  }

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-500/30 text-teal-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          👯
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Rating Twins
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Closest rating alignment
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-teal-300 block truncate'>
                            {twins ? `${twins.a} & ${twins.b}` : 'N/A'}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            {twins
                              ? `${twins.exact}/${twins.shared} exact`
                              : 'Requires 5+ shared'}
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Avg Gap
                          </span>
                          <span className='font-mono text-teal-400 font-extrabold text-sm'>
                            {twins ? twins.gap.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 6: Rating Opposites */}
                {(() => {
                  let opposites = null;
                  for (let i = 0; i < users.length; i++) {
                    for (let j = i + 1; j < users.length; j++) {
                      let shared = 0;
                      let exact = 0;
                      let gapTotal = 0;
                      ALL_TOWERS.forEach((t) => {
                        const x = ratings[users[i]]?.[t];
                        const y = ratings[users[j]]?.[t];
                        if (x > 0 && y > 0) {
                          shared++;
                          gapTotal += Math.abs(x - y);
                          if (x === y) exact++;
                        }
                      });
                      if (shared < 5) continue;
                      const gap = gapTotal / shared;
                      if (
                        !opposites ||
                        gap > opposites.gap ||
                        (gap === opposites.gap && shared > opposites.shared)
                      ) {
                        opposites = {
                          a: users[i],
                          b: users[j],
                          gap,
                          shared,
                          exact,
                        };
                      }
                    }
                  }

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 text-purple-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          ☯️
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Rating Opposites
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Widest preference gap
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-purple-300 block truncate'>
                            {opposites
                              ? `${opposites.a} & ${opposites.b}`
                              : 'N/A'}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            {opposites
                              ? `${opposites.exact}/${opposites.shared} exact`
                              : 'Requires 5+ shared'}
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Avg Gap
                          </span>
                          <span className='font-mono text-purple-400 font-extrabold text-sm'>
                            {opposites ? opposites.gap.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 7: Hive Mind */}
                {(() => {
                  let minDevUser = 'N/A';
                  let minDevVal = Infinity;
                  users.forEach((u) => {
                    let devSum = 0;
                    let count = 0;
                    towerMetrics.forEach((m) => {
                      const s = getScore(u, m.tower);
                      if (s > 0) {
                        devSum += Math.abs(s - m.rawAvg);
                        count++;
                      }
                    });
                    const avgDev = count ? devSum / count : Infinity;
                    if (avgDev < minDevVal) {
                      minDevVal = avgDev;
                      minDevUser = u;
                    }
                  });

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🐝
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Hive Mind
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Lowest team deviation
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-indigo-300 block truncate'>
                            {minDevVal !== Infinity ? minDevUser : 'N/A'}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Closest to consensus
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Avg Dev
                          </span>
                          <span className='font-mono text-indigo-400 font-extrabold text-sm'>
                            {minDevVal !== Infinity
                              ? minDevVal.toFixed(2)
                              : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 8: Lone Wolf */}
                {(() => {
                  let maxDevUser = 'N/A';
                  let maxDevVal = -1;
                  users.forEach((u) => {
                    let devSum = 0;
                    let count = 0;
                    towerMetrics.forEach((m) => {
                      const s = getScore(u, m.tower);
                      if (s > 0) {
                        devSum += Math.abs(s - m.rawAvg);
                        count++;
                      }
                    });
                    const avgDev = count ? devSum / count : 0;
                    if (avgDev > maxDevVal) {
                      maxDevVal = avgDev;
                      maxDevUser = u;
                    }
                  });

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30 text-pink-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🐺
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Lone Wolf
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Highest team deviation
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-pink-300 block truncate'>
                            {maxDevUser}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Farthest from consensus
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Avg Dev
                          </span>
                          <span className='font-mono text-pink-400 font-extrabold text-sm'>
                            {maxDevVal.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* SECTION 3: CONTROLLER SCORING PERSONALITIES */}
            <div className='space-y-4'>
              <div className='flex items-center gap-2 border-b border-slate-800/80 pb-2'>
                <span className='text-xs font-semibold uppercase tracking-wider text-slate-400'>
                  Controller Scoring Personalities
                </span>
              </div>
              <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
                {/* Card 9: Team Optimist */}
                {(() => {
                  const optimist = users.reduce(
                    (best, u) => {
                      const uScores = Object.values(ratings[u] || {}).filter(
                        (s) => s > 0,
                      );
                      const avg = uScores.length
                        ? uScores.reduce((a, b) => a + b, 0) / uScores.length
                        : 0;
                      return avg > best.avg
                        ? { name: u, avg: avg.toFixed(2) }
                        : best;
                    },
                    { name: 'N/A', avg: 0 },
                  );

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🌟
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Team Optimist
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Highest overall average
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-sky-300 block truncate'>
                            {optimist.name}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Generous scoring
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            User Avg
                          </span>
                          <span className='font-mono text-sky-400 font-extrabold text-sm'>
                            {optimist.avg}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 10: Strict Critic */}
                {(() => {
                  const realist = users.reduce(
                    (strict, u) => {
                      const uScores = Object.values(ratings[u] || {}).filter(
                        (s) => s > 0,
                      );
                      const avg = uScores.length
                        ? uScores.reduce((a, b) => a + b, 0) / uScores.length
                        : 5;
                      return avg < strict.avg
                        ? { name: u, avg: avg.toFixed(2) }
                        : strict;
                    },
                    { name: 'N/A', avg: 5 },
                  );

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/30 text-orange-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🎯
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Strict Critic
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Lowest overall average
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-orange-300 block truncate'>
                            {realist.name}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Tough standards
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            User Avg
                          </span>
                          <span className='font-mono text-orange-400 font-extrabold text-sm'>
                            {realist.avg}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 11: Fence Sitter (Lowest Rating Variance) */}
                {(() => {
                  let fenceUser = 'N/A';
                  let minVar = Infinity;

                  users.forEach((u) => {
                    const uScores = Object.values(ratings[u] || {}).filter(
                      (s) => s > 0,
                    );
                    if (uScores.length > 1) {
                      const avg =
                        uScores.reduce((a, b) => a + b, 0) / uScores.length;
                      const variance =
                        uScores.reduce(
                          (acc, val) => acc + Math.pow(val - avg, 2),
                          0,
                        ) / uScores.length;
                      if (variance < minVar) {
                        minVar = variance;
                        fenceUser = u;
                      }
                    }
                  });

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 text-violet-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🪵
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Fence Sitter
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Lowest rating variance
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-violet-300 block truncate'>
                            {fenceUser}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Consistent scoring
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Variance
                          </span>
                          <span className='font-mono text-violet-400 font-extrabold text-sm'>
                            {minVar !== Infinity ? minVar.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Card 12: Extremist (Highest Rating Variance) */}
                {(() => {
                  let extremeUser = 'N/A';
                  let maxVar = -1;

                  users.forEach((u) => {
                    const uScores = Object.values(ratings[u] || {}).filter(
                      (s) => s > 0,
                    );
                    if (uScores.length > 1) {
                      const avg =
                        uScores.reduce((a, b) => a + b, 0) / uScores.length;
                      const variance =
                        uScores.reduce(
                          (acc, val) => acc + Math.pow(val - avg, 2),
                          0,
                        ) / uScores.length;
                      if (variance > maxVar) {
                        maxVar = variance;
                        extremeUser = u;
                      }
                    }
                  });

                  return (
                    <div className='bg-slate-950/90 border border-slate-800 p-5 rounded-2xl flex flex-col justify-between shadow-inner space-y-4'>
                      <div className='flex items-center gap-3'>
                        <div className='w-10 h-10 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 flex items-center justify-center font-bold text-lg shrink-0'>
                          🔥
                        </div>
                        <div>
                          <h3 className='font-bold text-slate-100 text-sm'>
                            Extremist
                          </h3>
                          <p className='text-[11px] text-slate-400 line-clamp-1'>
                            Highest rating variance
                          </p>
                        </div>
                      </div>
                      <div className='bg-slate-900/80 p-3.5 rounded-xl border border-slate-800/80 flex justify-between items-center gap-2'>
                        <div className='min-w-0'>
                          <span className='font-bold text-sm text-red-300 block truncate'>
                            {extremeUser}
                          </span>
                          <span className='text-[11px] text-slate-400 block truncate mt-0.5'>
                            Polarised spread
                          </span>
                        </div>
                        <div className='text-right shrink-0'>
                          <span className='text-[10px] text-slate-400 block font-semibold'>
                            Variance
                          </span>
                          <span className='font-mono text-red-400 font-extrabold text-sm'>
                            {maxVar !== -1 ? maxVar.toFixed(2) : '0.00'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
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
                {categoryStats.map((cat, idx) => {
                  const catItems = towerMetrics.filter(
                    (m) => m.category === cat.category,
                  );
                  const ratedCatItems = catItems.filter(
                    (m) => m.ratingsCount > 0,
                  );

                  let topController = 'N/A';
                  let lowestController = 'N/A';
                  let bottomPick = 'N/A';

                  if (ratedCatItems.length > 0) {
                    const sortedCatTowers = [...ratedCatItems].sort(
                      (a, b) =>
                        b.rawAvg - a.rawAvg ||
                        b.ratingsCount - a.ratingsCount ||
                        a.tower.localeCompare(b.tower),
                    );
                    if (sortedCatTowers.length > 1) {
                      bottomPick =
                        sortedCatTowers[sortedCatTowers.length - 1].tower;
                    }

                    const controllerCatAvgs = users
                      .map((u) => {
                        let sum = 0;
                        let count = 0;
                        ratedCatItems.forEach((m) => {
                          const s = ratings[u]?.[m.tower];
                          if (s !== undefined && s > 0) {
                            sum += s;
                            count++;
                          }
                        });
                        return {
                          user: u,
                          avg: count > 0 ? sum / count : -1,
                          count,
                        };
                      })
                      .filter((x) => x.count > 0);

                    if (controllerCatAvgs.length > 0) {
                      controllerCatAvgs.sort(
                        (a, b) => b.avg - a.avg || a.user.localeCompare(b.user),
                      );
                      const highestVal = controllerCatAvgs[0].avg;
                      const topUsers = controllerCatAvgs
                        .filter((x) => x.avg === highestVal)
                        .map((x) => x.user);
                      topController = topUsers.join(', ');

                      const lowestVal =
                        controllerCatAvgs[controllerCatAvgs.length - 1].avg;
                      const lowestUsers = controllerCatAvgs
                        .filter((x) => x.avg === lowestVal)
                        .map((x) => x.user);
                      lowestController = lowestUsers.join(', ');
                    }
                  }

                  return (
                    <div
                      key={cat.category}
                      className='bg-gradient-to-b from-slate-950/90 to-slate-950/70 border border-slate-800/90 p-6 rounded-3xl flex flex-col shadow-xl transition-all duration-300 hover:border-slate-700 hover:shadow-sky-950/20'
                    >
                      {/* Card Header & Pill Badge */}
                      <div className='flex justify-between items-center gap-3 mb-5'>
                        <div className='flex items-center gap-3'>
                          <span className='w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 font-extrabold text-xs text-sky-400 flex items-center justify-center shrink-0 shadow-inner'>
                            #{idx + 1}
                          </span>
                          <CategoryBadge category={cat.category} />
                        </div>
                        <span className='text-xs font-mono text-slate-400 font-semibold'>
                          {cat.count} {cat.count === 1 ? 'Tower' : 'Towers'}
                        </span>
                      </div>

                      <div className='bg-slate-900/80 border border-slate-800/90 rounded-2xl p-4 mb-5 flex items-center justify-between shadow-inner'>
                        <span className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
                          Group Average
                        </span>
                        <div className='flex items-baseline gap-1'>
                          <span className='font-extrabold text-sky-400 text-xl'>
                            {cat.avg}
                          </span>
                          <span className='text-xs text-slate-500 font-medium'>
                            / 5
                          </span>
                        </div>
                      </div>

                      {/* Stat Metrics List with Matched Font Size and Spacing */}
                      <div className='space-y-3 text-sm'>
                        <div className='flex justify-between items-start gap-4 bg-slate-900/40 hover:bg-slate-900/60 transition px-4 py-3 rounded-2xl border border-slate-800/60'>
                          <span className='text-slate-300 font-medium'>
                            {cat.count === 1 ? 'Tower' : 'Top Pick'}
                          </span>
                          <span className='font-bold text-emerald-400 text-right break-words'>
                            {cat.topTower}
                          </span>
                        </div>
                        {cat.count > 1 && (
                          <div className='flex justify-between items-start gap-4 bg-slate-900/40 hover:bg-slate-900/60 transition px-4 py-3 rounded-2xl border border-slate-800/60'>
                            <span className='text-slate-300 font-medium'>
                              Bottom Pick
                            </span>
                            <span className='font-bold text-rose-400 text-right break-words'>
                              {bottomPick}
                            </span>
                          </div>
                        )}
                        <div className='flex justify-between items-start gap-4 bg-slate-900/40 hover:bg-slate-900/60 transition px-4 py-3 rounded-2xl border border-slate-800/60'>
                          <span className='text-slate-300 font-medium'>
                            Top Rated
                          </span>
                          <span className='font-bold text-sky-300 text-right break-words'>
                            {topController}
                          </span>
                        </div>
                        <div className='flex justify-between items-start gap-4 bg-slate-900/40 hover:bg-slate-900/60 transition px-4 py-3 rounded-2xl border border-slate-800/60'>
                          <span className='text-slate-300 font-medium'>
                            Bottom Rated
                          </span>
                          <span className='font-bold text-orange-300 text-right break-words'>
                            {lowestController}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
                {stateStats.map((st, idx) => {
                  const stItems = towerMetrics.filter(
                    (m) => m.state === st.state,
                  );
                  const ratedStItems = stItems.filter(
                    (m) => m.ratingsCount > 0,
                  );

                  let topController = 'N/A';
                  let lowestController = 'N/A';
                  let bottomPick = 'N/A';

                  if (ratedStItems.length > 0) {
                    const sortedStTowers = [...ratedStItems].sort(
                      (a, b) =>
                        b.rawAvg - a.rawAvg ||
                        b.ratingsCount - a.ratingsCount ||
                        a.tower.localeCompare(b.tower),
                    );
                    if (sortedStTowers.length > 1) {
                      bottomPick =
                        sortedStTowers[sortedStTowers.length - 1].tower;
                    }

                    const controllerStAvgs = users
                      .map((u) => {
                        let sum = 0;
                        let count = 0;
                        ratedStItems.forEach((m) => {
                          const s = ratings[u]?.[m.tower];
                          if (s !== undefined && s > 0) {
                            sum += s;
                            count++;
                          }
                        });
                        return {
                          user: u,
                          avg: count > 0 ? sum / count : -1,
                          count,
                        };
                      })
                      .filter((x) => x.count > 0);

                    if (controllerStAvgs.length > 0) {
                      controllerStAvgs.sort(
                        (a, b) => b.avg - a.avg || a.user.localeCompare(b.user),
                      );
                      const highestVal = controllerStAvgs[0].avg;
                      const topUsers = controllerStAvgs
                        .filter((x) => x.avg === highestVal)
                        .map((x) => x.user);
                      topController = topUsers.join(', ');

                      const lowestVal =
                        controllerStAvgs[controllerStAvgs.length - 1].avg;
                      const lowestUsers = controllerStAvgs
                        .filter((x) => x.avg === lowestVal)
                        .map((x) => x.user);
                      lowestController = lowestUsers.join(', ');
                    }
                  }

                  return (
                    <div
                      key={st.state}
                      className='bg-gradient-to-b from-slate-950/90 to-slate-950/70 border border-slate-800/90 p-5 rounded-3xl flex flex-col shadow-xl transition-all duration-300 hover:border-slate-700 hover:shadow-sky-950/20'
                    >
                      {/* Card Header & Average */}
                      <div className='flex justify-between items-center gap-3 mb-4'>
                        <div className='flex items-center gap-2.5'>
                          <span className='w-7 h-7 rounded-xl bg-sky-500/10 border border-sky-500/20 font-extrabold text-[11px] text-sky-400 flex items-center justify-center shrink-0 shadow-inner'>
                            #{idx + 1}
                          </span>
                          <StateBadge state={st.state} />
                        </div>
                        <span className='text-xs font-mono text-slate-400 font-semibold'>
                          {st.count} {st.count === 1 ? 'Tower' : 'Towers'}
                        </span>
                      </div>

                      <div className='bg-slate-900/80 border border-slate-800/90 rounded-2xl p-3.5 mb-4 flex items-center justify-between shadow-inner'>
                        <span className='text-xs font-bold text-slate-400 uppercase tracking-wider'>
                          State Average
                        </span>
                        <div className='flex items-baseline gap-1'>
                          <span className='font-extrabold text-sky-400 text-lg'>
                            {st.avg}
                          </span>
                          <span className='text-xs text-slate-500 font-medium'>
                            / 5
                          </span>
                        </div>
                      </div>

                      {/* Stat Metrics List with 'By' removed */}
                      <div className='space-y-2 text-xs'>
                        <div className='flex justify-between items-center gap-3 bg-slate-900/40 hover:bg-slate-900/60 transition px-3 py-2 rounded-xl border border-slate-800/60'>
                          <span className='text-slate-400 font-medium'>
                            {st.count === 1 ? 'Tower' : 'Top Pick'}
                          </span>
                          <span className='font-bold text-emerald-400 text-right truncate'>
                            {st.topTower}
                          </span>
                        </div>
                        {st.count > 1 && (
                          <div className='flex justify-between items-center gap-3 bg-slate-900/40 hover:bg-slate-900/60 transition px-3 py-2 rounded-xl border border-slate-800/60'>
                            <span className='text-slate-400 font-medium'>
                              Bottom Pick
                            </span>
                            <span className='font-bold text-rose-400 text-right truncate'>
                              {bottomPick}
                            </span>
                          </div>
                        )}
                        <div className='flex justify-between items-center gap-3 bg-slate-900/40 hover:bg-slate-900/60 transition px-3 py-2 rounded-xl border border-slate-800/60'>
                          <span className='text-slate-400 font-medium'>
                            Top Rated
                          </span>
                          <span className='font-bold text-sky-300 text-right truncate'>
                            {topController}
                          </span>
                        </div>
                        <div className='flex justify-between items-center gap-3 bg-slate-900/40 hover:bg-slate-900/60 transition px-3 py-2 rounded-xl border border-slate-800/60'>
                          <span className='text-slate-400 font-medium'>
                            Bottom Rated
                          </span>
                          <span className='font-bold text-orange-300 text-right truncate'>
                            {lowestController}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
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
              towers will revert to unrated status.
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
                className='px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-2xl transition duration-200 shadow-lg shadow-rose-950 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-450'
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

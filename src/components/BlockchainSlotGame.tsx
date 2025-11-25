import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { ErrorDisplay, LoadingOverlay, Toast } from './ErrorDisplay';
import { GameError } from '../utils/errorHandler';
import { SpinResult } from '../utils';
// import { RTPrealTimeMonitor } from '../utils/rtpAnalysis'; // Temporarily disabled

// Symbol configuration matching smart contract - temporarily simplified
const SYMBOLS: Record<string, { id: number; name: string; payout: number; weight: number; img: string }> = {
  gorbagana: { id: 0, name: 'gorbagana', payout: 100, weight: 1, img: '/gorbagana.jpeg' },
  wild: { id: 1, name: 'wild', payout: 50, weight: 2, img: '/Wild.png' },
  bonusChest: { id: 2, name: 'bonusChest', payout: 25, weight: 3, img: '/Bonuschest.png' },
  trash: { id: 3, name: 'trash', payout: 20, weight: 4, img: '/trashbag.jpeg' },
  takeout: { id: 4, name: 'takeout', payout: 15, weight: 5, img: '/chinesefood.jpeg' },
  fish: { id: 5, name: 'fish', payout: 10, weight: 6, img: '/fishbone.jpeg' },
  rat: { id: 6, name: 'rat', payout: 5, weight: 7, img: '/rat.jpeg' },
  banana: { id: 7, name: 'banana', payout: 2, weight: 8, img: '/bananapeel.jpeg' },
};

type SymbolName = keyof typeof SYMBOLS;
type SymbolId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface BlockchainSlotGameProps {
  onSpin?: (betAmount: number) => Promise<SpinResult>;
  isConnected?: boolean;
  balance?: number;
  currentError?: GameError | null;
  onClearError?: () => void;
  isLoading?: boolean;
  onBalanceRefresh?: () => Promise<void>;
}

const REEL_ROWS = 3;
const REEL_COLS = 3;
const DEFAULT_BET_AMOUNT = 0.01; // 0.01 GOR
const SPIN_ANIMATION_DURATION = 1500;
const SPIN_ANIMATION_INTERVAL = 100;

// Convert symbol ID to symbol name
const getSymbolNameById = (id: SymbolId): SymbolName => {
  const symbolEntries = Object.entries(SYMBOLS) as [SymbolName, typeof SYMBOLS[SymbolName]][];
  const found = symbolEntries.find(([_, symbol]) => symbol.id === id);
  return found ? found[0] : 'banana';
};

// Convert symbols array to grid format - only middle row matters for payline
const symbolsToGrid = (symbols: [number, number, number]): SymbolName[][] => {
  const symbolNames = Object.keys(SYMBOLS) as SymbolName[];
  const getRandomSymbol = () => symbolNames[Math.floor(Math.random() * symbolNames.length)];

  const paylineSymbols = symbols.map(id => getSymbolNameById(id as SymbolId));

  return [
    // Top row - random symbols (visual only)
    [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
    // Middle row - the actual payline from blockchain
    [paylineSymbols[0], paylineSymbols[1], paylineSymbols[2]],
    // Bottom row - random symbols (visual only)
    [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]
  ];
};

// Create initial random grid
const createInitialGrid = (): SymbolName[][] => {
  const symbolNames = Object.keys(SYMBOLS) as SymbolName[];
  const getRandomSymbol = () => symbolNames[Math.floor(Math.random() * symbolNames.length)];
  return Array(REEL_ROWS).fill(null).map(() =>
    Array(REEL_COLS).fill(null).map(getRandomSymbol)
  );
};

export const BlockchainSlotGame: React.FC<BlockchainSlotGameProps> = ({
  onSpin,
  isConnected = false,
  balance = 0,
  currentError,
  onClearError,
  isLoading = false,
  onBalanceRefresh
}) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [grid, setGrid] = useState<SymbolName[][]>(createInitialGrid);
  const [lastWin, setLastWin] = useState<number>(0);
  const [winningLines, setWinningLines] = useState<number[]>([]);
  const [betAmount, setBetAmount] = useState(DEFAULT_BET_AMOUNT);
  const [error, setError] = useState<string>('');
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('info');

  // Win animation states
  const [isWinAnimating, setIsWinAnimating] = useState(false);
  const [winType, setWinType] = useState<'small' | 'medium' | 'big' | 'mega'>('small');
  const [showWinText, setShowWinText] = useState(false);
  const [particles, setParticles] = useState<Array<{ id: number, x: number, y: number, color: string, size: number }>>([]);
  const [winMultiplier, setWinMultiplier] = useState(0);

  // Skill-based mechanics states
  const [reelsStopped, setReelsStopped] = useState<boolean[]>([false, false, false]);
  const [reelTimers, setReelTimers] = useState<number[]>([0, 0, 0]);
  const [skillMode, setSkillMode] = useState(true); // Toggle for skill vs auto mode
  const [timingBonuses, setTimingBonuses] = useState<number[]>([1, 1, 1]);

  // Progressive Jackpot states
  const [grandJackpot, setGrandJackpot] = useState(10.0); // Starting at 10 GOR
  const [minorJackpot, setMinorJackpot] = useState(2.5);  // Starting at 2.5 GOR
  const [jackpotWon, setJackpotWon] = useState<'grand' | 'minor' | null>(null);
  const [showJackpotWin, setShowJackpotWin] = useState(false);

  // Weighted symbol pool for animations
  const weightedSymbolPool = useMemo<SymbolName[]>(() => {
    const pool: SymbolName[] = [];
    for (const symbolName of Object.keys(SYMBOLS) as SymbolName[]) {
      const symbol = SYMBOLS[symbolName];
      for (let i = 0; i < symbol.weight; i++) {
        pool.push(symbolName);
      }
    }
    return pool;
  }, []);

  const getRandomWeightedSymbol = useCallback((): SymbolName => {
    const randomIndex = Math.floor(Math.random() * weightedSymbolPool.length);
    return weightedSymbolPool[randomIndex];
  }, [weightedSymbolPool]);

  // Determine win type based on payout
  const getWinType = (payout: number, bet: number): 'small' | 'medium' | 'big' | 'mega' => {
    const multiplier = payout / bet;
    if (multiplier >= 50) return 'mega';
    if (multiplier >= 20) return 'big';
    if (multiplier >= 10) return 'medium';
    return 'small';
  };

  // Create particle effects
  const createParticles = useCallback((winType: 'small' | 'medium' | 'big' | 'mega') => {
    const particleCount = winType === 'mega' ? 50 : winType === 'big' ? 30 : winType === 'medium' ? 20 : 10;
    const colors = {
      small: ['#fbbf24', '#f59e0b'],
      medium: ['#10b981', '#059669', '#34d399'],
      big: ['#3b82f6', '#1d4ed8', '#60a5fa'],
      mega: ['#f59e0b', '#dc2626', '#7c3aed', '#ec4899']
    };

    const newParticles = Array.from({ length: particleCount }, (_, i) => ({
      id: Date.now() + i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[winType][Math.floor(Math.random() * colors[winType].length)],
      size: Math.random() * 8 + 4
    }));

    setParticles(newParticles);

    // Clear particles after animation
    setTimeout(() => setParticles([]), 3000);
  }, []);

  // Trigger win animations
  const triggerWinAnimation = useCallback((payout: number, bet: number) => {
    const type = getWinType(payout, bet);
    const multiplier = payout / bet;

    setWinType(type);
    setWinMultiplier(multiplier);
    setIsWinAnimating(true);
    setShowWinText(true);

    createParticles(type);

    // Clear win animation after duration
    setTimeout(() => {
      setIsWinAnimating(false);
      setShowWinText(false);
    }, type === 'mega' ? 4000 : type === 'big' ? 3000 : 2000);
  }, [createParticles]);

  // Skill-based mechanics functions
  const calculateTimingBonus = useCallback((_reelIndex: number, timing: number): number => {
    // Perfect timing window (around 500-700ms gives best bonus)
    const perfectTiming = 600;
    const tolerance = 100;
    const difference = Math.abs(timing - perfectTiming);

    if (difference <= tolerance) {
      // Perfect timing gives 1.5x bonus
      return 1.5 - (difference / tolerance) * 0.3;
    } else {
      // Poor timing gives reduced bonus
      return Math.max(0.8, 1.2 - (difference / 1000));
    }
  }, []);

  const stopReel = useCallback((reelIndex: number) => {
    if (reelsStopped[reelIndex] || !isSpinning) return;

    const timing = reelTimers[reelIndex];
    const bonus = calculateTimingBonus(reelIndex, timing);

    setReelsStopped(prev => {
      const newStopped = [...prev];
      newStopped[reelIndex] = true;
      return newStopped;
    });

    setTimingBonuses(prev => {
      const newBonuses = [...prev];
      newBonuses[reelIndex] = bonus;
      return newBonuses;
    });
  }, [reelsStopped, isSpinning, reelTimers, calculateTimingBonus]);

  // Progressive Jackpot functions
  const updateJackpots = useCallback((betAmount: number) => {
    // 2% of each bet goes to Grand Jackpot, 1% to Minor Jackpot
    const grandContribution = betAmount * 0.02;
    const minorContribution = betAmount * 0.01;

    setGrandJackpot(prev => prev + grandContribution);
    setMinorJackpot(prev => prev + minorContribution);
  }, []);

  const checkForJackpot = useCallback((symbols: [number, number, number]) => {
    const gorbaganaId = SYMBOLS.gorbagana.id;
    const wildId = SYMBOLS.wild.id;

    // Grand Jackpot: 3 Gorbagana symbols
    if (symbols.every(id => id === gorbaganaId)) {
      setJackpotWon('grand');
      setShowJackpotWin(true);
      setLastWin(grandJackpot);
      setGrandJackpot(10.0); // Reset to base amount

      setTimeout(() => {
        setShowJackpotWin(false);
        setJackpotWon(null);
      }, 5000);

      return grandJackpot;
    }

    // Minor Jackpot: 3 Wild symbols OR 2 Gorbagana + 1 Wild
    const gorbaganaCount = symbols.filter(id => id === gorbaganaId).length;
    const wildCount = symbols.filter(id => id === wildId).length;

    if (symbols.every(id => id === wildId) || (gorbaganaCount === 2 && wildCount === 1)) {
      setJackpotWon('minor');
      setShowJackpotWin(true);
      setLastWin(minorJackpot);
      setMinorJackpot(2.5); // Reset to base amount

      setTimeout(() => {
        setShowJackpotWin(false);
        setJackpotWon(null);
      }, 4000);

      return minorJackpot;
    }

    return 0;
  }, [grandJackpot, minorJackpot]);

  // Enhanced toast notification helper
  const showToastMessage = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToastMessage(message);
    setToastType(type);
    setShowToast(true);
  }, []);

  const handleSpin = async () => {
    if (!isConnected) {
      showToastMessage('Please connect your wallet first', 'warning');
      return;
    }

    if (isSpinning || isLoading) return;

    if (balance < betAmount) {
      showToastMessage('Insufficient balance for this bet', 'error');
      return;
    }

    setIsSpinning(true);
    setLastWin(0);
    setWinningLines([]);
    setError('');

    // Reset skill mechanics properly
    setReelsStopped([false, false, false]);
    setTimingBonuses([1, 1, 1]);
    setReelTimers([0, 0, 0]);

    // Start reel timers for skill mode with proper stopping logic
    let timerInterval: NodeJS.Timeout | null = null;
    if (skillMode) {
      timerInterval = setInterval(() => {
        setReelTimers(prev => prev.map((timer, index) => {
          // Only increment if reel is not stopped
          return reelsStopped[index] ? timer : timer + 50;
        }));
      }, 50);

      // Clear timer when spin animation ends
      setTimeout(() => {
        if (timerInterval) clearInterval(timerInterval);
      }, SPIN_ANIMATION_DURATION);
    }

    // Start animation
    const animationInterval = setInterval(() => {
      setGrid(prevGrid =>
        prevGrid.map((row, rowIndex) =>
          row.map((_, colIndex) => {
            // If in skill mode and reel is stopped, don't change that column
            if (skillMode && rowIndex === 1 && reelsStopped[colIndex]) {
              return prevGrid[rowIndex][colIndex];
            }
            return getRandomWeightedSymbol();
          })
        )
      );
    }, SPIN_ANIMATION_INTERVAL);

    try {
      let spinResult;

      if (onSpin) {
        // Use blockchain spin
        spinResult = await onSpin(betAmount);
        
        // Refresh balance after successful spin
        if (onBalanceRefresh) {
          try {
            await onBalanceRefresh();
          } catch (balanceError) {
            console.warn('Failed to refresh balance:', balanceError);
            // Don't fail the spin if balance refresh fails
          }
        }
        
        // Show success toast for successful spins
        if (spinResult.payout > 0) {
          showToastMessage(`Won ${spinResult.payout.toFixed(4)} GOR!`, 'success');
        } else {
          showToastMessage('Spin completed - Better luck next time!', 'info');
        }
      } else {
        // Fallback to local simulation with skill bonuses
        const symbols: [number, number, number] = [
          Math.floor(Math.random() * 8),
          Math.floor(Math.random() * 8),
          Math.floor(Math.random() * 8)
        ];

        let payout = 0;
        // Only pay out on three matching symbols
        if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
          const symbolData = Object.values(SYMBOLS).find(s => s.id === symbols[0]);
          let basePayout = symbolData ? symbolData.payout * betAmount : 0;

          // Apply skill bonuses if in skill mode
          if (skillMode) {
            const avgBonus = timingBonuses.reduce((sum, bonus) => sum + bonus, 0) / 3;
            basePayout *= avgBonus;
          }

          payout = basePayout;
        }

        // Create SpinResult object matching the interface
        spinResult = { 
          symbols, 
          payout,
          txSignature: 'local-simulation',
          timestamp: Date.now(),
          betAmount: betAmount
        };
      }

      setTimeout(() => {
        clearInterval(animationInterval);

        const finalGrid = symbolsToGrid(spinResult.symbols);
        setGrid(finalGrid);

        // Update progressive jackpots with each spin
        updateJackpots(betAmount);

        // Check for jackpot wins first (highest priority)
        const jackpotPayout = checkForJackpot(spinResult.symbols);

        // Determine final payout (jackpot overrides regular payout)
        const finalPayout = jackpotPayout > 0 ? jackpotPayout : spinResult.payout;

        if (finalPayout > 0) {
          setLastWin(finalPayout);
          setWinningLines([1]); // Only middle row (index 1) is the payline

          // Trigger win animations after a short delay
          setTimeout(() => {
            triggerWinAnimation(finalPayout, betAmount);
          }, 500);
        }

        setIsSpinning(false);
      }, SPIN_ANIMATION_DURATION);

    } catch (error) {
      clearInterval(animationInterval);
      console.error('Spin error:', error);
      
      // Handle GameError vs regular Error
      if (error && typeof error === 'object' && 'userMessage' in error) {
        // This is a GameError from the enhanced error handling
        setError((error as GameError).userMessage);
      } else {
        // Fallback for regular errors
        setError(error instanceof Error ? error.message : 'Spin failed');
      }
      
      setIsSpinning(false);
    }
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const titleShadowStyle = (color: string) => ({
    textShadow: `0 0 15px ${color}, 0 2px 2px rgba(0,0,0,0.7)`
  });

  return (
    <div className="flex items-center justify-center min-h-screen text-white p-2 antialiased" style={{ fontFamily: "'Exo 2', sans-serif" }}>
      <div className="relative w-full max-w-[420px] min-h-[800px] bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-[3rem] p-4 flex flex-col justify-between shadow-[0_0_20px_rgba(139,92,246,0.3),0_0_40px_rgba(139,92,246,0.1),inset_0_0_15px_rgba(10,2,29,0.8)] border border-purple-500/30 backdrop-blur-sm">

        {/* Wallet Connection Status */}
        <div className="text-center mb-2">
          {isConnected ? (
            <div className="text-green-400 text-sm">
              ✅ Wallet Connected | Balance: {balance.toFixed(4)} GOR
            </div>
          ) : (
            <div className="text-orange-400 text-sm">
              ⚠️ Wallet Not Connected
            </div>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-2 mb-2 text-center text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Header */}
        <header>
          <div className="flex justify-between items-center text-yellow-400 font-bold px-2">
            <div className="text-center w-28 py-1 border-2 border-fuchsia-600/50 relative" style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}>
              <div className="text-xs uppercase">GRAND</div>
              <div className="text-xs text-green-400 font-bold">{grandJackpot.toFixed(3)} GOR</div>
              {jackpotWon === 'grand' && showJackpotWin && (
                <div className="absolute inset-0 bg-yellow-400 text-black rounded animate-pulse flex items-center justify-center text-xs font-black">
                  WON!
                </div>
              )}
            </div>
            <div className="w-20 h-6 border-2 border-fuchsia-600/50 flex items-center justify-center" style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}>
              <div className="text-xs">🎰</div>
            </div>
            <div className="text-center w-28 py-1 border-2 border-fuchsia-600/50 relative" style={{ clipPath: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)' }}>
              <div className="text-xs uppercase">MINOR</div>
              <div className="text-xs text-blue-400 font-bold">{minorJackpot.toFixed(3)} GOR</div>
              {jackpotWon === 'minor' && showJackpotWin && (
                <div className="absolute inset-0 bg-blue-400 text-white rounded animate-pulse flex items-center justify-center text-xs font-black">
                  WON!
                </div>
              )}
            </div>
          </div>
          <div className="text-center my-4 select-none">
            <h1 className="text-4xl md:text-5xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-600 drop-shadow-lg" style={titleShadowStyle('rgba(0,255,255,0.5)')}>
              Gorbagana
            </h1>
            <h2 className="text-4xl md:text-5xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-orange-400 to-amber-600 -mt-2 drop-shadow-lg" style={titleShadowStyle('rgba(255,165,0,0.5)')}>
              Trash Rush
            </h2>
          </div>
        </header>

        {/* Skill Mode Toggle */}
        <div className="mb-3 flex justify-center">
          <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-1 flex items-center gap-1 shadow-lg border border-slate-600/50">
            <span className="text-xs text-gray-300 px-2 font-medium">Mode:</span>
            <button
              onClick={() => setSkillMode(!skillMode)}
              className={`relative px-4 py-2 rounded-lg text-xs font-bold transition-all duration-300 transform ${
                skillMode
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-md scale-105'
                  : 'bg-gradient-to-r from-slate-600 to-slate-500 text-gray-300 hover:from-slate-500 hover:to-slate-400'
              } ${isSpinning ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
              disabled={isSpinning}
            >
              <span className="flex items-center gap-1">
                {skillMode ? '🎯' : '🎲'} {skillMode ? 'SKILL' : 'AUTO'}
              </span>
              {skillMode && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></div>
              )}
            </button>
          </div>
        </div>

        {/* Pay Table */}
        <div className="mb-3 p-2 bg-slate-900/50 rounded-lg border border-fuchsia-500/30">
          <div className="text-center text-yellow-400 font-bold text-xs mb-1 uppercase tracking-wider">
            Pay Table {skillMode && <span className="text-green-400">+ Skill Bonus</span>}
          </div>
          <div className="flex justify-between items-center gap-1 text-xs">
            {Object.entries(SYMBOLS)
              .sort((a, b) => b[1].payout - a[1].payout)
              .map(([symbolName, symbol]) => (
                <div key={symbolName} className="flex flex-col items-center bg-black/40 rounded p-1 min-w-0 flex-1">
                  <img
                    src={symbol.img}
                    alt={symbolName}
                    className="w-4 h-4 object-contain mb-1"
                  />
                  <div className="text-yellow-400 font-bold text-xs">
                    {(symbol.payout * betAmount).toFixed(3)}
                  </div>
                </div>
              ))}
          </div>
          <div className="text-center text-gray-400 text-xs mt-1">
            3 match required • Middle row only
            {skillMode && <div className="text-green-400 mt-1">🎯 Perfect timing = 1.5x bonus!</div>}
          </div>
        </div>

        {/* Reels */}
        <main className="relative w-full aspect-square p-2 border-2 border-fuchsia-500/80 rounded-2xl shadow-[0_0_25px_rgba(192,38,211,0.5),inset_0_0_15px_rgba(192,38,211,0.3)] bg-black/30 overflow-hidden">
          {/* Win Screen Flash Overlay */}
          {isWinAnimating && (
            <div
              className={`absolute inset-0 z-20 pointer-events-none rounded-2xl transition-all duration-500 ${winType === 'mega' ? 'bg-gradient-to-br from-purple-500/30 via-pink-500/30 to-yellow-500/30 animate-pulse' :
                winType === 'big' ? 'bg-gradient-to-br from-blue-500/25 via-cyan-500/25 to-blue-600/25 animate-pulse' :
                  winType === 'medium' ? 'bg-gradient-to-br from-green-500/20 via-emerald-500/20 to-green-600/20' :
                    'bg-gradient-to-br from-yellow-500/15 via-amber-500/15 to-yellow-600/15'
                }`}
              style={{
                animation: isWinAnimating ? `winFlash-${winType} ${winType === 'mega' ? '0.8s' : '0.6s'} ease-in-out` : 'none'
              }}
            />
          )}

          {/* Particle Effects */}
          {particles.map(particle => (
            <div
              key={particle.id}
              className="absolute pointer-events-none z-30 rounded-full animate-bounce"
              style={{
                left: `${particle.x}%`,
                top: `${particle.y}%`,
                width: `${particle.size}px`,
                height: `${particle.size}px`,
                backgroundColor: particle.color,
                boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
                animation: `particleFloat 3s ease-out forwards, particleFade 3s ease-out forwards`
              }}
            />
          ))}

          {/* Win Text Overlay */}
          {showWinText && (
            <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
              <div className={`text-center transform transition-all duration-1000 ${winType === 'mega' ? 'animate-bounce' : 'animate-pulse'
                }`}>
                <div className={`font-black uppercase tracking-wider mb-2 ${winType === 'mega' ? 'text-6xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600' :
                  winType === 'big' ? 'text-5xl text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400' :
                    winType === 'medium' ? 'text-4xl text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400' :
                      'text-3xl text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-400'
                  }`}
                  style={{
                    textShadow: winType === 'mega' ? '0 0 20px rgba(255,255,0,0.8), 0 0 40px rgba(255,0,255,0.6)' :
                      winType === 'big' ? '0 0 15px rgba(0,255,255,0.8)' :
                        winType === 'medium' ? '0 0 10px rgba(0,255,0,0.8)' :
                          '0 0 8px rgba(255,255,0,0.8)'
                  }}>
                  {winType === 'mega' ? 'MEGA WIN!' :
                    winType === 'big' ? 'BIG WIN!' :
                      winType === 'medium' ? 'NICE WIN!' :
                        'WIN!'}
                </div>
                <div className={`font-bold ${winType === 'mega' ? 'text-2xl text-yellow-300' :
                  winType === 'big' ? 'text-xl text-cyan-300' :
                    winType === 'medium' ? 'text-lg text-green-300' :
                      'text-base text-yellow-300'
                  }`}>
                  {winMultiplier.toFixed(1)}x MULTIPLIER
                </div>
              </div>
            </div>
          )}

          {/* Skill Mode: Reel Stop Buttons */}
          {skillMode && isSpinning && (
            <div className="absolute bottom-2 left-2 right-2 z-50 flex justify-between gap-2">
              {[0, 1, 2].map(reelIndex => (
                <button
                  key={reelIndex}
                  onClick={() => stopReel(reelIndex)}
                  disabled={reelsStopped[reelIndex]}
                  className={`flex-1 py-2 px-3 rounded-lg font-bold text-sm transition-all duration-200 ${reelsStopped[reelIndex]
                    ? 'bg-green-600 text-white cursor-not-allowed'
                    : 'bg-red-600 hover:bg-red-500 text-white shadow-lg hover:shadow-xl active:scale-95'
                    }`}
                >
                  {reelsStopped[reelIndex] ? (
                    <div className="flex items-center justify-center gap-1">
                      <span>✓</span>
                      <span className="text-xs">{timingBonuses[reelIndex].toFixed(2)}x</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <span>STOP</span>
                      <span className="text-xs">{(reelTimers[reelIndex] / 1000).toFixed(1)}s</span>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-3 grid-rows-3 gap-2 h-full relative z-10">
            {grid.flat().map((symbolName, index) => {
              const isWinningSymbol = winningLines.includes(Math.floor(index / REEL_COLS));
              const colIndex = index % REEL_COLS;
              const rowIndex = Math.floor(index / REEL_COLS);
              const isPaylineSymbol = rowIndex === 1; // Middle row is payline

              return (
                <div
                  key={index}
                  className={`bg-slate-900/50 rounded-lg flex items-center justify-center overflow-hidden transition-all duration-300 relative ${isWinningSymbol ?
                    `shadow-[0_0_15px_5px_#fde047] scale-105 bg-yellow-400/20 ${isWinAnimating ?
                      winType === 'mega' ? 'animate-pulse shadow-[0_0_25px_8px_#fde047]' :
                        winType === 'big' ? 'animate-pulse shadow-[0_0_20px_6px_#60a5fa]' :
                          winType === 'medium' ? 'animate-pulse shadow-[0_0_15px_4px_#34d399]' :
                            'animate-pulse'
                      : ''
                    }` : ''
                    } ${skillMode && isPaylineSymbol && isSpinning && reelsStopped[colIndex]
                      ? 'ring-2 ring-green-400 bg-green-400/10'
                      : ''
                    }`}
                >
                  {/* Timing Bonus Indicator */}
                  {skillMode && isPaylineSymbol && reelsStopped[colIndex] && (
                    <div className="absolute top-1 right-1 bg-green-600 text-white text-xs px-1 rounded z-20">
                      {timingBonuses[colIndex].toFixed(1)}x
                    </div>
                  )}

                  <img
                    src={SYMBOLS[symbolName].img}
                    alt={symbolName}
                    className={`w-full h-full object-contain p-2 transition-all duration-300 ease-in-out ${isWinningSymbol && isWinAnimating ?
                      winType === 'mega' ? 'animate-bounce scale-110' :
                        winType === 'big' ? 'animate-pulse scale-105' :
                          'scale-105'
                      : ''
                      }`}
                    style={{
                      transform: isSpinning && !(skillMode && isPaylineSymbol && reelsStopped[colIndex]) ? 'scale(0.8) rotate(15deg)' :
                        isWinningSymbol && isWinAnimating ? 'scale(1.1) rotate(0deg)' :
                          'scale(1) rotate(0deg)',
                      filter: isWinningSymbol && isWinAnimating ?
                        winType === 'mega' ? 'brightness(1.5) saturate(1.5) drop-shadow(0 0 10px rgba(255,255,0,0.8))' :
                          winType === 'big' ? 'brightness(1.3) saturate(1.3) drop-shadow(0 0 8px rgba(0,255,255,0.6))' :
                            winType === 'medium' ? 'brightness(1.2) saturate(1.2) drop-shadow(0 0 6px rgba(0,255,0,0.6))' :
                              'brightness(1.1) saturate(1.1)'
                        : 'none'
                    }}
                  />
                </div>
              );
            })}
          </div>
        </main>

        {/* Controls */}
        <footer className="w-full mt-4">
          {/* Bet Amount Selector */}
          <div className="flex justify-center mb-4">
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-xl p-2 flex items-center gap-3 shadow-lg border border-slate-600/50">
              <span className="text-sm text-gray-300 font-medium flex items-center gap-1">
                <span className="text-yellow-400">💰</span> Bet:
              </span>
              <div className="relative">
                <select
                  value={betAmount}
                  onChange={(e) => setBetAmount(Number(e.target.value))}
                  className={`appearance-none bg-gradient-to-r from-slate-700 to-slate-600 text-white rounded-lg px-4 py-2 pr-8 text-sm font-bold border border-slate-500/50 transition-all duration-200 ${
                    isSpinning
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:from-slate-600 hover:to-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/50'
                  }`}
                  disabled={isSpinning}
                >
                  <option value={0.001}>0.001 GOR</option>
                  <option value={0.01}>0.01 GOR</option>
                  <option value={0.1}>0.1 GOR</option>
                  <option value={0.5}>0.5 GOR</option>
                  <option value={1}>1 GOR</option>
                </select>
                <div className="absolute right-2 top-1/2 transform -translate-y-1/2 pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
              <div className="text-xs text-gray-400 bg-slate-800/50 px-2 py-1 rounded">
                Max: {balance.toFixed(3)} GOR
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-yellow-400 px-1">
            <div className="text-center border-2 border-fuchsia-500/80 rounded-lg p-2 w-20 h-12 flex items-center justify-center cursor-pointer hover:bg-fuchsia-500/20 transition-colors">
              <span className="uppercase font-bold text-xs tracking-wider">Menu</span>
            </div>

            <div className="flex-grow flex flex-col items-center">
              <div className="relative text-center py-1 px-6 text-yellow-400">
                <span className="absolute left-0 top-1/2 -translate-y-1/2 text-3xl font-thin transform -scale-x-100" style={{ fontFamily: 'serif' }}>)</span>
                <span className="absolute right-0 top-1/2 -translate-y-1/2 text-3xl font-thin" style={{ fontFamily: 'serif' }}>)</span>
                <span className={`font-black text-xl tracking-widest transition-all duration-300 ${isWinAnimating ?
                  winType === 'mega' ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-pink-500 to-purple-600 animate-pulse' :
                    winType === 'big' ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400 animate-pulse' :
                      winType === 'medium' ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400 animate-pulse' :
                        'text-yellow-300 animate-pulse'
                  : 'text-yellow-400'
                  }`}>
                  WIN
                </span>
              </div>
              <div className={`text-xl font-bold h-6 transition-all duration-500 ${lastWin > 0 ?
                isWinAnimating ?
                  winType === 'mega' ? 'text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-pink-400 to-purple-500 animate-bounce text-2xl' :
                    winType === 'big' ? 'text-transparent bg-clip-text bg-gradient-to-r from-blue-300 to-cyan-300 animate-pulse text-xl' :
                      winType === 'medium' ? 'text-transparent bg-clip-text bg-gradient-to-r from-green-300 to-emerald-300 animate-pulse' :
                        'text-yellow-300 animate-pulse'
                  : 'text-white'
                : 'text-white'
                }`}>
                {lastWin > 0 ? `${lastWin.toFixed(4)} GOR` : ''}
              </div>
              {/* Win Multiplier Display */}
              {isWinAnimating && winMultiplier > 0 && (
                <div className={`text-sm font-bold mt-1 animate-bounce ${winType === 'mega' ? 'text-yellow-300' :
                  winType === 'big' ? 'text-cyan-300' :
                    winType === 'medium' ? 'text-green-300' :
                      'text-yellow-400'
                  }`}>
                  {winMultiplier.toFixed(1)}x
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={handleSpin}
                disabled={isSpinning || isLoading || !isConnected || balance < betAmount}
                aria-label={isSpinning ? 'Spinning...' : isLoading ? 'Processing...' : 'Spin the reels'}
                className={`relative w-20 h-20 rounded-full font-black text-lg uppercase transition-all duration-300 transform ${
                  isSpinning || isLoading
                    ? 'bg-gradient-to-b from-orange-500 to-red-700 text-white shadow-[0_8px_20px_rgba(255,165,0,0.6)] animate-pulse scale-110'
                    : !isConnected || balance < betAmount
                      ? 'bg-gradient-to-b from-gray-600 to-gray-800 text-gray-400 cursor-not-allowed shadow-[0_4px_10px_rgba(0,0,0,0.3)]'
                      : 'bg-gradient-to-b from-blue-500 to-indigo-800 text-white shadow-[0_8px_25px_rgba(59,130,246,0.5),inset_0_-4px_15px_rgba(0,0,0,0.8),inset_0_2px_4px_rgba(255,255,255,0.3)] hover:shadow-[0_10px_30px_rgba(59,130,246,0.7)] hover:scale-105 active:scale-95 active:translate-y-1'
                } border-2 border-blue-300/50`}
              >
                {isSpinning ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin text-2xl mb-1">⟳</div>
                    <div className="text-xs font-bold">SPINNING</div>
                  </div>
                ) : isLoading ? (
                  <div className="flex flex-col items-center">
                    <div className="animate-spin text-2xl mb-1">⚙️</div>
                    <div className="text-xs font-bold">PROCESSING</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center">
                    <span className="text-xl mb-1">🎰</span>
                    <span className="text-sm font-black">SPIN</span>
                  </div>
                )}
              </button>

              {/* Pulsing ring effect when ready to spin */}
              {!isSpinning && !isLoading && isConnected && balance >= betAmount && (
                <div className="absolute inset-0 rounded-full border-2 border-cyan-400/50 animate-ping"></div>
              )}

              {/* Loading indicator */}
              {(isSpinning || isLoading) && (
                <div className="absolute inset-0 rounded-full border-2 border-orange-400/50 animate-spin border-t-transparent"></div>
              )}
            </div>
          </div>
        </footer>
      </div>

      {/* Error Display */}
      <ErrorDisplay
        error={currentError || null}
        onRetry={() => {
          if (onClearError) onClearError();
          // Retry the last operation if it was a spin
          if (currentError?.type && ['TRANSACTION_ERROR', 'NETWORK_ERROR'].includes(currentError.type)) {
            handleSpin();
          }
        }}
        onDismiss={onClearError}
        showTechnicalDetails={process.env.NODE_ENV === 'development'}
      />

      {/* Loading Overlay */}
      <LoadingOverlay
        isLoading={isLoading && !isSpinning}
        message={isLoading ? 'Processing transaction...' : 'Loading...'}
        onCancel={() => {
          // Cancel functionality could be added here if needed
          console.log('User requested to cancel operation');
        }}
      />

      {/* Toast Notifications */}
      <Toast
        message={toastMessage}
        type={toastType}
        isVisible={showToast}
        onDismiss={() => setShowToast(false)}
        duration={3000}
      />
    </div>
  );
};

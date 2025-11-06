/**
 * Comprehensive Player Simulation System
 * Tests various player scenarios and RTP mechanics
 */

import { SYMBOL_CONFIG, simulateGameplay, RTPrealTimeMonitor } from './rtpAnalysis';

export interface PlayerProfile {
  id: string;
  name: string;
  startingBalance: number;
  betStrategy: 'conservative' | 'moderate' | 'aggressive' | 'martingale' | 'fixed';
  baseBet: number;
  maxBet: number;
  stopLoss: number; // Stop when balance drops below this
  stopWin: number;  // Stop when balance reaches this
  sessionLength: number; // Maximum spins per session
}

export interface SimulationResult {
  playerId: string;
  playerName: string;
  startingBalance: number;
  endingBalance: number;
  totalSpins: number;
  totalWagered: number;
  totalWon: number;
  netResult: number;
  biggestWin: number;
  biggestLoss: number;
  winStreak: number;
  loseStreak: number;
  hitRate: number;
  averageBet: number;
  sessionDuration: number;
  rtp: number;
  houseEdge: number;
  bustedOut: boolean;
  reachedTarget: boolean;
  spinHistory: Array<{
    spin: number;
    bet: number;
    symbols: [number, number, number];
    payout: number;
    balance: number;
    rtp: number;
  }>;
}

export interface MultiPlayerSimulation {
  totalPlayers: number;
  totalSpins: number;
  totalWagered: number;
  totalPayout: number;
  houseProfit: number;
  overallRTP: number;
  overallHouseEdge: number;
  playerResults: SimulationResult[];
  summary: {
    playersWon: number;
    playersLost: number;
    playersBusted: number;
    averageSession: number;
    medianResult: number;
    worstLoss: number;
    biggestWin: number;
  };
}

// Predefined player profiles for testing
export const PLAYER_PROFILES: PlayerProfile[] = [
  {
    id: 'casual',
    name: 'Casual Player',
    startingBalance: 1.0,
    betStrategy: 'conservative',
    baseBet: 0.01,
    maxBet: 0.05,
    stopLoss: 0.2,
    stopWin: 2.0,
    sessionLength: 100
  },
  {
    id: 'regular',
    name: 'Regular Player',
    startingBalance: 5.0,
    betStrategy: 'moderate',
    baseBet: 0.05,
    maxBet: 0.25,
    stopLoss: 1.0,
    stopWin: 10.0,
    sessionLength: 200
  },
  {
    id: 'highroller',
    name: 'High Roller',
    startingBalance: 50.0,
    betStrategy: 'aggressive',
    baseBet: 0.5,
    maxBet: 5.0,
    stopLoss: 10.0,
    stopWin: 100.0,
    sessionLength: 500
  },
  {
    id: 'martingale',
    name: 'Martingale Player',
    startingBalance: 10.0,
    betStrategy: 'martingale',
    baseBet: 0.01,
    maxBet: 2.0,
    stopLoss: 0.5,
    stopWin: 20.0,
    sessionLength: 1000
  },
  {
    id: 'grinder',
    name: 'Grinder',
    startingBalance: 2.0,
    betStrategy: 'fixed',
    baseBet: 0.01,
    maxBet: 0.01,
    stopLoss: 0.1,
    stopWin: 5.0,
    sessionLength: 2000
  }
];

/**
 * Simulate the slot game mechanics (matching smart contract logic)
 */
function simulateSlotSpin(bet: number, spinNumber: number): {
  symbols: [number, number, number];
  payout: number;
} {
  // Simulate the weighted random generation from smart contract
  const weights = [1, 2, 3, 4, 5, 6, 7, 8]; // Symbol weights
  const totalWeight = 36;
  
  // Generate pseudo-random seed (simulating blockchain randomness)
  const seed = Date.now() + spinNumber + Math.random() * 1000000;
  
  const generateSymbol = (seedOffset: number): number => {
    const randomValue = Math.floor((seed + seedOffset) % totalWeight);
    let cumulativeWeight = 0;
    
    for (let symbol = 0; symbol < weights.length; symbol++) {
      cumulativeWeight += weights[symbol];
      if (randomValue < cumulativeWeight) {
        return symbol;
      }
    }
    return 7; // Fallback to banana
  };
  
  const symbols: [number, number, number] = [
    generateSymbol(0),
    generateSymbol(7919), // Prime offset
    generateSymbol(7927)  // Different prime offset
  ];
  
  // Calculate payout (matching smart contract logic)
  let payout = 0;
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const multipliers = [100, 50, 25, 20, 15, 10, 5, 2]; // Symbol payouts
    const multiplier = multipliers[symbols[0]] || 0;
    payout = bet * multiplier;
  }
  
  return { symbols, payout };
}

/**
 * Calculate next bet based on strategy
 */
function calculateNextBet(
  profile: PlayerProfile,
  currentBet: number,
  lastWin: boolean,
  balance: number,
  consecutiveLosses: number
): number {
  switch (profile.betStrategy) {
    case 'conservative':
      // Increase bet slightly after wins, decrease after losses
      if (lastWin) {
        return Math.min(currentBet * 1.1, profile.maxBet, balance * 0.1);
      } else {
        return Math.max(currentBet * 0.9, profile.baseBet);
      }
      
    case 'moderate':
      // Standard betting with some variance
      const variance = 0.8 + Math.random() * 0.4; // 0.8x to 1.2x
      return Math.min(Math.max(profile.baseBet * variance, profile.baseBet), profile.maxBet, balance * 0.2);
      
    case 'aggressive':
      // Higher bets, more risk
      if (balance > profile.startingBalance) {
        return Math.min(profile.maxBet, balance * 0.3);
      } else {
        return Math.min(profile.baseBet * 2, balance * 0.5);
      }
      
    case 'martingale':
      // Double bet after loss, reset after win
      if (lastWin) {
        return profile.baseBet;
      } else {
        return Math.min(currentBet * 2, profile.maxBet, balance);
      }
      
    case 'fixed':
      // Always bet the same amount
      return Math.min(profile.baseBet, balance);
      
    default:
      return profile.baseBet;
  }
}

/**
 * Simulate a single player session
 */
export function simulatePlayerSession(profile: PlayerProfile): SimulationResult {
  let balance = profile.startingBalance;
  let currentBet = profile.baseBet;
  let totalWagered = 0;
  let totalWon = 0;
  let spins = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let currentStreak = 0;
  let winStreak = 0;
  let loseStreak = 0;
  let wins = 0;
  let consecutiveLosses = 0;
  let lastWin = false;
  
  const spinHistory: SimulationResult['spinHistory'] = [];
  const monitor = new RTPrealTimeMonitor();
  
  const startTime = Date.now();
  
  while (
    spins < profile.sessionLength &&
    balance >= profile.stopLoss &&
    balance < profile.stopWin &&
    balance >= currentBet
  ) {
    spins++;
    
    // Calculate bet for this spin
    currentBet = calculateNextBet(profile, currentBet, lastWin, balance, consecutiveLosses);
    currentBet = Math.min(currentBet, balance); // Can't bet more than balance
    
    if (currentBet <= 0) break; // Can't continue if no money to bet
    
    // Deduct bet from balance
    balance -= currentBet;
    totalWagered += currentBet;
    
    // Simulate spin
    const result = simulateSlotSpin(currentBet, spins);
    const payout = result.payout;
    
    // Add payout to balance
    balance += payout;
    totalWon += payout;
    
    // Record in RTP monitor
    monitor.recordSpin(currentBet, payout);
    
    // Track statistics
    const netSpin = payout - currentBet;
    if (netSpin > 0) {
      wins++;
      lastWin = true;
      consecutiveLosses = 0;
      currentStreak = currentStreak > 0 ? currentStreak + 1 : 1;
      winStreak = Math.max(winStreak, currentStreak);
      biggestWin = Math.max(biggestWin, netSpin);
    } else {
      lastWin = false;
      consecutiveLosses++;
      currentStreak = currentStreak < 0 ? currentStreak - 1 : -1;
      loseStreak = Math.max(loseStreak, Math.abs(currentStreak));
      biggestLoss = Math.max(biggestLoss, Math.abs(netSpin));
    }
    
    // Record spin history
    spinHistory.push({
      spin: spins,
      bet: currentBet,
      symbols: result.symbols,
      payout,
      balance,
      rtp: monitor.getCurrentRTP()
    });
  }
  
  const sessionDuration = Date.now() - startTime;
  const netResult = balance - profile.startingBalance;
  const hitRate = spins > 0 ? (wins / spins) * 100 : 0;
  const averageBet = spins > 0 ? totalWagered / spins : 0;
  const rtp = monitor.getCurrentRTP();
  const houseEdge = 100 - rtp;
  
  return {
    playerId: profile.id,
    playerName: profile.name,
    startingBalance: profile.startingBalance,
    endingBalance: balance,
    totalSpins: spins,
    totalWagered,
    totalWon,
    netResult,
    biggestWin,
    biggestLoss,
    winStreak,
    loseStreak,
    hitRate,
    averageBet,
    sessionDuration,
    rtp,
    houseEdge,
    bustedOut: balance < profile.stopLoss,
    reachedTarget: balance >= profile.stopWin,
    spinHistory
  };
}

/**
 * Run multi-player simulation
 */
export function runMultiPlayerSimulation(
  profiles: PlayerProfile[] = PLAYER_PROFILES,
  playersPerProfile: number = 10
): MultiPlayerSimulation {
  const allResults: SimulationResult[] = [];
  let totalWagered = 0;
  let totalPayout = 0;
  let totalSpins = 0;
  
  console.log('🎰 Running Multi-Player Simulation...');
  console.log(`Testing ${profiles.length} player types with ${playersPerProfile} players each`);
  
  // Run simulations for each profile type
  for (const profile of profiles) {
    console.log(`\nSimulating ${playersPerProfile} ${profile.name} players...`);
    
    for (let i = 0; i < playersPerProfile; i++) {
      const playerProfile = {
        ...profile,
        id: `${profile.id}_${i + 1}`,
        name: `${profile.name} #${i + 1}`
      };
      
      const result = simulatePlayerSession(playerProfile);
      allResults.push(result);
      
      totalWagered += result.totalWagered;
      totalPayout += result.totalWon;
      totalSpins += result.totalSpins;
    }
  }
  
  // Calculate overall statistics
  const houseProfit = totalWagered - totalPayout;
  const overallRTP = totalWagered > 0 ? (totalPayout / totalWagered) * 100 : 0;
  const overallHouseEdge = 100 - overallRTP;
  
  // Calculate summary statistics
  const playersWon = allResults.filter(r => r.netResult > 0).length;
  const playersLost = allResults.filter(r => r.netResult < 0).length;
  const playersBusted = allResults.filter(r => r.bustedOut).length;
  
  const netResults = allResults.map(r => r.netResult).sort((a, b) => a - b);
  const medianResult = netResults[Math.floor(netResults.length / 2)];
  const worstLoss = Math.min(...netResults);
  const biggestWin = Math.max(...netResults);
  const averageSession = allResults.reduce((sum, r) => sum + r.totalSpins, 0) / allResults.length;
  
  return {
    totalPlayers: allResults.length,
    totalSpins,
    totalWagered,
    totalPayout,
    houseProfit,
    overallRTP,
    overallHouseEdge,
    playerResults: allResults,
    summary: {
      playersWon,
      playersLost,
      playersBusted,
      averageSession,
      medianResult,
      worstLoss,
      biggestWin
    }
  };
}

/**
 * Generate detailed simulation report
 */
export function generateSimulationReport(simulation: MultiPlayerSimulation): string {
  const report = [];
  
  report.push('🎰 GORBAGANA SLOTS - PLAYER SIMULATION REPORT');
  report.push('===========================================\n');
  
  // Overall Statistics
  report.push('📊 OVERALL STATISTICS');
  report.push('---------------------');
  report.push(`Total Players: ${simulation.totalPlayers}`);
  report.push(`Total Spins: ${simulation.totalSpins.toLocaleString()}`);
  report.push(`Total Wagered: ${simulation.totalWagered.toFixed(4)} GOR`);
  report.push(`Total Payout: ${simulation.totalPayout.toFixed(4)} GOR`);
  report.push(`House Profit: ${simulation.houseProfit.toFixed(4)} GOR`);
  report.push(`Overall RTP: ${simulation.overallRTP.toFixed(2)}%`);
  report.push(`House Edge: ${simulation.overallHouseEdge.toFixed(2)}%`);
  
  // Player Outcomes
  report.push('\n👥 PLAYER OUTCOMES');
  report.push('------------------');
  report.push(`Players Won: ${simulation.summary.playersWon} (${(simulation.summary.playersWon / simulation.totalPlayers * 100).toFixed(1)}%)`);
  report.push(`Players Lost: ${simulation.summary.playersLost} (${(simulation.summary.playersLost / simulation.totalPlayers * 100).toFixed(1)}%)`);
  report.push(`Players Busted: ${simulation.summary.playersBusted} (${(simulation.summary.playersBusted / simulation.totalPlayers * 100).toFixed(1)}%)`);
  report.push(`Average Session: ${simulation.summary.averageSession.toFixed(0)} spins`);
  report.push(`Median Result: ${simulation.summary.medianResult.toFixed(4)} GOR`);
  report.push(`Biggest Win: ${simulation.summary.biggestWin.toFixed(4)} GOR`);
  report.push(`Worst Loss: ${simulation.summary.worstLoss.toFixed(4)} GOR`);
  
  // Player Type Analysis
  report.push('\n🎯 PLAYER TYPE ANALYSIS');
  report.push('-----------------------');
  
  const profileGroups = new Map<string, SimulationResult[]>();
  simulation.playerResults.forEach(result => {
    const profileType = result.playerId.split('_')[0];
    if (!profileGroups.has(profileType)) {
      profileGroups.set(profileType, []);
    }
    profileGroups.get(profileType)!.push(result);
  });
  
  for (const [profileType, results] of profileGroups) {
    const avgResult = results.reduce((sum, r) => sum + r.netResult, 0) / results.length;
    const avgRTP = results.reduce((sum, r) => sum + r.rtp, 0) / results.length;
    const winRate = results.filter(r => r.netResult > 0).length / results.length * 100;
    const bustRate = results.filter(r => r.bustedOut).length / results.length * 100;
    
    report.push(`\n${profileType.toUpperCase()}:`);
    report.push(`  Average Result: ${avgResult.toFixed(4)} GOR`);
    report.push(`  Average RTP: ${avgRTP.toFixed(2)}%`);
    report.push(`  Win Rate: ${winRate.toFixed(1)}%`);
    report.push(`  Bust Rate: ${bustRate.toFixed(1)}%`);
  }
  
  // Risk Assessment
  report.push('\n⚠️ RISK ASSESSMENT');
  report.push('------------------');
  
  if (simulation.overallHouseEdge > 10) {
    report.push('🚨 CRITICAL: House edge extremely high - players losing too much');
  } else if (simulation.overallHouseEdge > 7) {
    report.push('⚠️ WARNING: House edge above recommended levels');
  } else if (simulation.overallHouseEdge < 3) {
    report.push('⚠️ WARNING: House edge too low - unsustainable for house');
  } else {
    report.push('✅ House edge within acceptable range');
  }
  
  if (simulation.summary.playersBusted / simulation.totalPlayers > 0.5) {
    report.push('🚨 CRITICAL: Over 50% of players busted out');
  } else if (simulation.summary.playersBusted / simulation.totalPlayers > 0.3) {
    report.push('⚠️ WARNING: High bust rate may indicate poor player experience');
  }
  
  if (simulation.summary.playersWon / simulation.totalPlayers < 0.1) {
    report.push('🚨 CRITICAL: Very few players winning - poor retention expected');
  }
  
  // Recommendations
  report.push('\n💡 RECOMMENDATIONS');
  report.push('------------------');
  
  if (simulation.overallHouseEdge > 7) {
    report.push('• Reduce house edge by increasing payout multipliers');
    report.push('• Improve hit frequency to enhance player experience');
  }
  
  if (simulation.summary.playersBusted / simulation.totalPlayers > 0.3) {
    report.push('• Consider implementing loss limits or responsible gambling features');
    report.push('• Adjust volatility to reduce extreme losses');
  }
  
  if (simulation.summary.playersWon / simulation.totalPlayers < 0.2) {
    report.push('• Increase small win frequency to improve player engagement');
    report.push('• Consider bonus features or progressive elements');
  }
  
  return report.join('\n');
}

/**
 * Export simulation data to CSV format
 */
export function exportSimulationToCSV(simulation: MultiPlayerSimulation): string {
  const headers = [
    'Player ID', 'Player Name', 'Starting Balance', 'Ending Balance', 'Net Result',
    'Total Spins', 'Total Wagered', 'Total Won', 'RTP', 'House Edge',
    'Hit Rate', 'Average Bet', 'Biggest Win', 'Biggest Loss',
    'Win Streak', 'Lose Streak', 'Busted Out', 'Reached Target'
  ];
  
  const rows = simulation.playerResults.map(result => [
    result.playerId,
    result.playerName,
    result.startingBalance.toFixed(4),
    result.endingBalance.toFixed(4),
    result.netResult.toFixed(4),
    result.totalSpins,
    result.totalWagered.toFixed(4),
    result.totalWon.toFixed(4),
    result.rtp.toFixed(2),
    result.houseEdge.toFixed(2),
    result.hitRate.toFixed(2),
    result.averageBet.toFixed(4),
    result.biggestWin.toFixed(4),
    result.biggestLoss.toFixed(4),
    result.winStreak,
    result.loseStreak,
    result.bustedOut ? 'Yes' : 'No',
    result.reachedTarget ? 'Yes' : 'No'
  ]);
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}
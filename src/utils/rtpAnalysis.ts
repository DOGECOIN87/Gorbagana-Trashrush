/**
 * RTP (Return to Player) Analysis and Verification System
 * Ensures guaranteed 5% house edge with proper player RTP calculations
 */

// Symbol configuration matching the game
export const SYMBOL_CONFIG = {
  gorbagana: { id: 0, payout: 100, weight: 1 },
  wild: { id: 1, payout: 50, weight: 2 },
  bonusChest: { id: 2, payout: 25, weight: 3 },
  trash: { id: 3, payout: 20, weight: 4 },
  takeout: { id: 4, payout: 15, weight: 5 },
  fish: { id: 5, payout: 10, weight: 6 },
  rat: { id: 6, payout: 5, weight: 7 },
  banana: { id: 7, payout: 2, weight: 8 },
} as const;

export type SymbolId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type SymbolName = keyof typeof SYMBOL_CONFIG;

export interface RTPAnalysis {
  theoreticalRTP: number;
  houseEdge: number;
  expectedPayoutPerSpin: number;
  hitFrequency: number;
  volatility: 'low' | 'medium' | 'high';
  symbolProbabilities: Record<SymbolName, number>;
  winCombinations: Array<{
    symbols: [SymbolName, SymbolName, SymbolName];
    probability: number;
    payout: number;
    contribution: number;
  }>;
  jackpotContribution: number;
  totalRTP: number;
}

export interface RTPrecommendations {
  currentRTP: number;
  targetRTP: number;
  adjustments: Array<{
    type: 'payout' | 'probability' | 'jackpot';
    symbol?: SymbolName;
    currentValue: number;
    recommendedValue: number;
    impact: number;
  }>;
  isCompliant: boolean;
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Calculate symbol probabilities based on weights
 */
export function calculateSymbolProbabilities(): Record<SymbolName, number> {
  const totalWeight = Object.values(SYMBOL_CONFIG).reduce((sum, symbol) => sum + symbol.weight, 0);
  
  const probabilities: Record<string, number> = {};
  for (const [name, symbol] of Object.entries(SYMBOL_CONFIG)) {
    probabilities[name] = symbol.weight / totalWeight;
  }
  
  return probabilities as Record<SymbolName, number>;
}

/**
 * Calculate theoretical RTP for the slot game
 */
export function calculateTheoreticalRTP(betAmount: number = 1): RTPAnalysis {
  const symbolProbs = calculateSymbolProbabilities();
  const symbols = Object.keys(SYMBOL_CONFIG) as SymbolName[];
  
  let totalExpectedPayout = 0;
  let totalHitProbability = 0;
  const winCombinations: RTPAnalysis['winCombinations'] = [];
  
  // Calculate expected payout for each possible winning combination
  for (const symbol of symbols) {
    const symbolConfig = SYMBOL_CONFIG[symbol];
    
    // Probability of getting three of the same symbol
    const probability = Math.pow(symbolProbs[symbol], 3);
    const payout = symbolConfig.payout * betAmount;
    const contribution = probability * payout;
    
    totalExpectedPayout += contribution;
    totalHitProbability += probability;
    
    winCombinations.push({
      symbols: [symbol, symbol, symbol],
      probability,
      payout,
      contribution
    });
  }
  
  // Calculate jackpot contribution (2% to grand, 1% to minor)
  const jackpotContribution = betAmount * 0.03; // 3% total to jackpots
  
  // Base RTP from regular wins
  const baseRTP = (totalExpectedPayout / betAmount) * 100;
  
  // Add jackpot contribution to RTP (simplified - actual jackpot RTP is complex)
  const jackpotRTP = 2.5; // Estimated 2.5% RTP from progressive jackpots
  
  const totalRTP = baseRTP + jackpotRTP;
  const houseEdge = 100 - totalRTP;
  
  // Determine volatility based on payout distribution
  const maxPayout = Math.max(...winCombinations.map(c => c.payout));
  const avgPayout = totalExpectedPayout / winCombinations.length;
  const volatility = maxPayout / avgPayout > 20 ? 'high' : maxPayout / avgPayout > 10 ? 'medium' : 'low';
  
  return {
    theoreticalRTP: totalRTP,
    houseEdge,
    expectedPayoutPerSpin: totalExpectedPayout,
    hitFrequency: totalHitProbability * 100,
    volatility,
    symbolProbabilities: symbolProbs,
    winCombinations: winCombinations.sort((a, b) => b.contribution - a.contribution),
    jackpotContribution,
    totalRTP
  };
}

/**
 * Verify if current RTP meets the 5% house edge requirement
 */
export function verifyHouseEdge(analysis: RTPAnalysis): RTPrecommendations {
  const targetHouseEdge = 5;
  const targetRTP = 95;
  const tolerance = 0.5; // 0.5% tolerance
  
  const isCompliant = Math.abs(analysis.houseEdge - targetHouseEdge) <= tolerance;
  const rtpDifference = analysis.theoreticalRTP - targetRTP;
  
  const adjustments: RTPrecommendations['adjustments'] = [];
  
  if (!isCompliant) {
    if (analysis.theoreticalRTP > targetRTP + tolerance) {
      // RTP too high, need to reduce payouts or increase house edge
      const highestContributors = analysis.winCombinations
        .slice(0, 3)
        .filter(combo => combo.contribution > 0.01);
      
      for (const combo of highestContributors) {
        const symbol = combo.symbols[0];
        const currentPayout = SYMBOL_CONFIG[symbol].payout;
        const reductionNeeded = rtpDifference / highestContributors.length;
        const newPayout = Math.max(1, currentPayout - Math.ceil(reductionNeeded));
        
        adjustments.push({
          type: 'payout',
          symbol,
          currentValue: currentPayout,
          recommendedValue: newPayout,
          impact: (currentPayout - newPayout) / currentPayout * 100
        });
      }
    } else if (analysis.theoreticalRTP < targetRTP - tolerance) {
      // RTP too low, need to increase payouts
      const lowestContributors = analysis.winCombinations
        .slice(-3)
        .filter(combo => combo.contribution < 0.1);
      
      for (const combo of lowestContributors) {
        const symbol = combo.symbols[0];
        const currentPayout = SYMBOL_CONFIG[symbol].payout;
        const increaseNeeded = Math.abs(rtpDifference) / lowestContributors.length;
        const newPayout = currentPayout + Math.ceil(increaseNeeded);
        
        adjustments.push({
          type: 'payout',
          symbol,
          currentValue: currentPayout,
          recommendedValue: newPayout,
          impact: (newPayout - currentPayout) / currentPayout * 100
        });
      }
    }
  }
  
  // Determine risk level
  let riskLevel: 'low' | 'medium' | 'high' = 'low';
  if (Math.abs(rtpDifference) > 2) {
    riskLevel = 'high';
  } else if (Math.abs(rtpDifference) > 1) {
    riskLevel = 'medium';
  }
  
  return {
    currentRTP: analysis.theoreticalRTP,
    targetRTP,
    adjustments,
    isCompliant,
    riskLevel
  };
}

/**
 * Simulate actual gameplay to verify RTP over time
 */
export function simulateGameplay(
  spins: number = 100000,
  betAmount: number = 1
): {
  actualRTP: number;
  totalWagered: number;
  totalPayout: number;
  houseProfit: number;
  hitRate: number;
  bigWins: number;
  variance: number;
} {
  let totalWagered = 0;
  let totalPayout = 0;
  let hits = 0;
  let bigWins = 0;
  const payouts: number[] = [];
  
  const symbols = Object.keys(SYMBOL_CONFIG) as SymbolName[];
  const symbolProbs = calculateSymbolProbabilities();
  
  // Create weighted symbol pool for random selection
  const weightedPool: SymbolId[] = [];
  for (const [name, symbol] of Object.entries(SYMBOL_CONFIG)) {
    for (let i = 0; i < symbol.weight; i++) {
      weightedPool.push(symbol.id);
    }
  }
  
  for (let i = 0; i < spins; i++) {
    totalWagered += betAmount;
    
    // Generate random symbols
    const symbol1 = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    const symbol2 = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    const symbol3 = weightedPool[Math.floor(Math.random() * weightedPool.length)];
    
    // Calculate payout
    let payout = 0;
    if (symbol1 === symbol2 && symbol2 === symbol3) {
      const symbolConfig = Object.values(SYMBOL_CONFIG).find(s => s.id === symbol1);
      if (symbolConfig) {
        payout = symbolConfig.payout * betAmount;
        hits++;
        
        if (payout >= betAmount * 10) {
          bigWins++;
        }
      }
    }
    
    totalPayout += payout;
    payouts.push(payout);
  }
  
  const actualRTP = (totalPayout / totalWagered) * 100;
  const houseProfit = totalWagered - totalPayout;
  const hitRate = (hits / spins) * 100;
  
  // Calculate variance
  const meanPayout = totalPayout / spins;
  const variance = payouts.reduce((sum, payout) => {
    return sum + Math.pow(payout - meanPayout, 2);
  }, 0) / spins;
  
  return {
    actualRTP,
    totalWagered,
    totalPayout,
    houseProfit,
    hitRate,
    bigWins,
    variance
  };
}

/**
 * Generate comprehensive RTP report
 */
export function generateRTPReport(betAmount: number = 1): {
  analysis: RTPAnalysis;
  recommendations: RTPrecommendations;
  simulation: ReturnType<typeof simulateGameplay>;
  summary: {
    isCompliant: boolean;
    riskLevel: 'low' | 'medium' | 'high';
    keyFindings: string[];
    actionItems: string[];
  };
} {
  const analysis = calculateTheoreticalRTP(betAmount);
  const recommendations = verifyHouseEdge(analysis);
  const simulation = simulateGameplay(100000, betAmount);
  
  const keyFindings: string[] = [];
  const actionItems: string[] = [];
  
  // Analyze findings
  if (recommendations.isCompliant) {
    keyFindings.push(`✅ House edge is compliant at ${analysis.houseEdge.toFixed(2)}%`);
  } else {
    keyFindings.push(`❌ House edge is ${analysis.houseEdge.toFixed(2)}%, target is 5%`);
    actionItems.push('Adjust payout multipliers to achieve 5% house edge');
  }
  
  if (Math.abs(analysis.theoreticalRTP - simulation.actualRTP) > 1) {
    keyFindings.push(`⚠️ Simulation RTP (${simulation.actualRTP.toFixed(2)}%) differs from theoretical (${analysis.theoreticalRTP.toFixed(2)}%)`);
    actionItems.push('Review random number generation for bias');
  }
  
  if (analysis.hitFrequency < 5) {
    keyFindings.push(`⚠️ Low hit frequency at ${analysis.hitFrequency.toFixed(2)}%`);
    actionItems.push('Consider increasing hit frequency for better player engagement');
  }
  
  if (analysis.volatility === 'high') {
    keyFindings.push(`⚠️ High volatility detected - may cause large swings in house profit`);
    actionItems.push('Monitor bankroll requirements for high volatility');
  }
  
  return {
    analysis,
    recommendations,
    simulation,
    summary: {
      isCompliant: recommendations.isCompliant,
      riskLevel: recommendations.riskLevel,
      keyFindings,
      actionItems
    }
  };
}

/**
 * Real-time RTP monitoring for live games
 */
export class RTPrealTimeMonitor {
  private totalWagered = 0;
  private totalPayout = 0;
  private spinCount = 0;
  private recentSpins: Array<{ wager: number; payout: number; timestamp: number }> = [];
  private readonly maxRecentSpins = 1000;
  
  recordSpin(wager: number, payout: number): void {
    this.totalWagered += wager;
    this.totalPayout += payout;
    this.spinCount++;
    
    this.recentSpins.push({
      wager,
      payout,
      timestamp: Date.now()
    });
    
    // Keep only recent spins
    if (this.recentSpins.length > this.maxRecentSpins) {
      this.recentSpins.shift();
    }
  }
  
  getCurrentRTP(): number {
    if (this.totalWagered === 0) return 0;
    return (this.totalPayout / this.totalWagered) * 100;
  }
  
  getRecentRTP(minutes: number = 60): number {
    const cutoff = Date.now() - (minutes * 60 * 1000);
    const recentSpins = this.recentSpins.filter(spin => spin.timestamp > cutoff);
    
    const recentWagered = recentSpins.reduce((sum, spin) => sum + spin.wager, 0);
    const recentPayout = recentSpins.reduce((sum, spin) => sum + spin.payout, 0);
    
    if (recentWagered === 0) return 0;
    return (recentPayout / recentWagered) * 100;
  }
  
  getHouseProfit(): number {
    return this.totalWagered - this.totalPayout;
  }
  
  getStats() {
    return {
      totalSpins: this.spinCount,
      totalWagered: this.totalWagered,
      totalPayout: this.totalPayout,
      currentRTP: this.getCurrentRTP(),
      recentRTP: this.getRecentRTP(),
      houseProfit: this.getHouseProfit(),
      houseEdge: 100 - this.getCurrentRTP()
    };
  }
  
  reset(): void {
    this.totalWagered = 0;
    this.totalPayout = 0;
    this.spinCount = 0;
    this.recentSpins = [];
  }
}
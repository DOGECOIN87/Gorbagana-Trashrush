/**
 * Fallback result generation system for when blockchain events cannot be parsed
 * This provides deterministic results based on transaction success while maintaining fairness
 */

import { SpinResult } from './index';

// Symbol definitions matching the smart contract
export const SYMBOLS = {
  GORBAGANA: 0,    // Highest paying (100x)
  WILD: 1,         // Second highest (50x)
  BONUS_CHEST: 2,  // 25x
  TRASH: 3,        // 20x
  TAKEOUT: 4,      // 15x
  FISH: 5,         // 10x
  RAT: 6,          // 5x
  BANANA: 7,       // Lowest paying (2x)
} as const;

// Payout multipliers matching smart contract logic
const PAYOUT_MULTIPLIERS: Record<number, number> = {
  [SYMBOLS.GORBAGANA]: 100,
  [SYMBOLS.WILD]: 50,
  [SYMBOLS.BONUS_CHEST]: 25,
  [SYMBOLS.TRASH]: 20,
  [SYMBOLS.TAKEOUT]: 15,
  [SYMBOLS.FISH]: 10,
  [SYMBOLS.RAT]: 5,
  [SYMBOLS.BANANA]: 2,
};

// Symbol weights for fair distribution (lower numbers = rarer symbols)
const SYMBOL_WEIGHTS: Record<number, number> = {
  [SYMBOLS.GORBAGANA]: 1,    // Rarest
  [SYMBOLS.WILD]: 2,
  [SYMBOLS.BONUS_CHEST]: 4,
  [SYMBOLS.TRASH]: 6,
  [SYMBOLS.TAKEOUT]: 8,
  [SYMBOLS.FISH]: 12,
  [SYMBOLS.RAT]: 16,
  [SYMBOLS.BANANA]: 20,      // Most common
};

/**
 * Configuration for fallback result generation
 */
export interface FallbackConfig {
  houseEdge: number;           // House edge percentage (default: 5)
  maxPayoutPerSpin: number;    // Maximum payout per spin in lamports
  winProbability: number;      // Base probability of winning (default: 0.15)
}

const DEFAULT_CONFIG: FallbackConfig = {
  houseEdge: 5,
  maxPayoutPerSpin: 1000000000, // 1 SOL
  winProbability: 0.15,         // 15% chance of winning
};

/**
 * Generates a deterministic pseudo-random number based on transaction signature
 */
function generateSeed(txSignature: string, betAmount: number): number {
  let hash = 0;
  const combined = txSignature + betAmount.toString();
  
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return Math.abs(hash);
}

/**
 * Generates a weighted random symbol based on rarity
 */
function generateWeightedSymbol(seed: number, offset: number): number {
  const totalWeight = Object.values(SYMBOL_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
  const random = (seed + offset) % totalWeight;
  
  let currentWeight = 0;
  for (const [symbol, weight] of Object.entries(SYMBOL_WEIGHTS)) {
    currentWeight += weight;
    if (random < currentWeight) {
      return parseInt(symbol);
    }
  }
  
  return SYMBOLS.BANANA; // Fallback to most common symbol
}

/**
 * Calculates payout based on symbols and bet amount (matches smart contract logic)
 */
function calculatePayout(symbols: [number, number, number], betAmount: number): number {
  const [symbol1, symbol2, symbol3] = symbols;
  
  // Only pay out on three matching symbols
  if (symbol1 === symbol2 && symbol2 === symbol3) {
    const multiplier = PAYOUT_MULTIPLIERS[symbol1] || 0;
    return betAmount * multiplier;
  }
  
  return 0;
}

/**
 * Determines if this should be a winning spin based on transaction success and probability
 */
function shouldWin(seed: number, config: FallbackConfig): boolean {
  const random = (seed % 1000) / 1000; // Convert to 0-1 range
  return random < config.winProbability;
}

/**
 * Generates winning symbols with appropriate rarity distribution
 */
function generateWinningSymbols(seed: number): [number, number, number] {
  // Choose symbol based on weighted probability (rarer symbols less likely)
  const symbol = generateWeightedSymbol(seed, 0);
  return [symbol, symbol, symbol];
}

/**
 * Generates losing symbols (non-matching)
 */
function generateLosingSymbols(seed: number): [number, number, number] {
  const symbol1 = generateWeightedSymbol(seed, 0);
  let symbol2 = generateWeightedSymbol(seed, 1);
  let symbol3 = generateWeightedSymbol(seed, 2);
  
  // Ensure they don't all match (losing condition)
  if (symbol1 === symbol2 && symbol2 === symbol3) {
    // Change the last symbol to make it a losing combination
    symbol3 = (symbol3 + 1) % 8;
  }
  
  return [symbol1, symbol2, symbol3];
}

/**
 * Generates a fallback spin result when blockchain events cannot be parsed
 * 
 * @param txSignature - Transaction signature for deterministic generation
 * @param betAmount - Bet amount in lamports
 * @param transactionSuccess - Whether the blockchain transaction succeeded
 * @param config - Configuration options (optional)
 * @returns SpinResult with generated symbols and payout
 */
export function generateFallbackResult(
  txSignature: string,
  betAmount: number,
  transactionSuccess: boolean,
  config: Partial<FallbackConfig> = {}
): SpinResult {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  // If transaction failed, return zero payout with random symbols
  if (!transactionSuccess) {
    const seed = generateSeed(txSignature, betAmount);
    const symbols = generateLosingSymbols(seed);
    
    return {
      symbols,
      payout: 0,
      txSignature,
      timestamp: Date.now(),
      betAmount,
    };
  }
  
  // Generate deterministic result based on transaction signature
  const seed = generateSeed(txSignature, betAmount);
  const shouldBeWin = shouldWin(seed, finalConfig);
  
  let symbols: [number, number, number];
  let payout: number;
  
  if (shouldBeWin) {
    symbols = generateWinningSymbols(seed);
    payout = calculatePayout(symbols, betAmount);
    
    // Apply house edge and max payout limits
    const houseEdgeAmount = betAmount * finalConfig.houseEdge / 100;
    const availablePayout = betAmount - houseEdgeAmount;
    payout = Math.min(payout, availablePayout, finalConfig.maxPayoutPerSpin);
  } else {
    symbols = generateLosingSymbols(seed);
    payout = 0;
  }
  
  return {
    symbols,
    payout,
    txSignature,
    timestamp: Date.now(),
    betAmount,
  };
}

/**
 * Validates that a fallback result is reasonable and follows game rules
 */
export function validateFallbackResult(result: SpinResult): boolean {
  const { symbols, payout, betAmount } = result;
  
  // Check symbols are valid (0-7)
  if (!symbols.every(symbol => symbol >= 0 && symbol <= 7)) {
    return false;
  }
  
  // Check payout calculation is correct
  const expectedPayout = calculatePayout(symbols, betAmount || 0);
  const maxExpectedPayout = Math.min(expectedPayout, betAmount || 0);
  
  // Allow some tolerance for house edge calculations
  if (payout > maxExpectedPayout) {
    return false;
  }
  
  // If symbols don't match, payout should be 0
  const [s1, s2, s3] = symbols;
  if (s1 !== s2 || s2 !== s3) {
    return payout === 0;
  }
  
  return true;
}

/**
 * Gets the display name for a symbol
 */
export function getSymbolName(symbolId: number): string {
  const symbolNames: Record<number, string> = {
    [SYMBOLS.GORBAGANA]: 'Gorbagana',
    [SYMBOLS.WILD]: 'Wild',
    [SYMBOLS.BONUS_CHEST]: 'Bonus Chest',
    [SYMBOLS.TRASH]: 'Trash',
    [SYMBOLS.TAKEOUT]: 'Takeout',
    [SYMBOLS.FISH]: 'Fish',
    [SYMBOLS.RAT]: 'Rat',
    [SYMBOLS.BANANA]: 'Banana',
  };
  
  return symbolNames[symbolId] || 'Unknown';
}
import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateFallbackResult,
  validateFallbackResult,
  getSymbolName,
  SYMBOLS,
  FallbackConfig,
} from './fallbackGenerator';

describe('Fallback Result Generation System', () => {
  const mockTxSignature = '5J8QvU7KjYXqKqY2QvU7KjYXqKqY2QvU7KjYXqKqY2QvU7KjYXqKqY2QvU7KjYXqKqY2';
  const betAmount = 100000000; // 0.1 SOL in lamports

  describe('generateFallbackResult', () => {
    it('should generate deterministic results for the same inputs', () => {
      const result1 = generateFallbackResult(mockTxSignature, betAmount, true);
      const result2 = generateFallbackResult(mockTxSignature, betAmount, true);
      
      expect(result1.symbols).toEqual(result2.symbols);
      expect(result1.payout).toBe(result2.payout);
      expect(result1.txSignature).toBe(result2.txSignature);
    });

    it('should return zero payout for failed transactions', () => {
      const result = generateFallbackResult(mockTxSignature, betAmount, false);
      
      expect(result.payout).toBe(0);
      expect(result.txSignature).toBe(mockTxSignature);
      expect(result.betAmount).toBe(betAmount);
      expect(result.symbols).toHaveLength(3);
      expect(result.symbols.every(s => s >= 0 && s <= 7)).toBe(true);
    });

    it('should generate different results for different transaction signatures', () => {
      const txSig1 = 'signature1';
      const txSig2 = 'signature2';
      
      const result1 = generateFallbackResult(txSig1, betAmount, true);
      const result2 = generateFallbackResult(txSig2, betAmount, true);
      
      // Results should be different (very low probability of collision)
      expect(result1.symbols).not.toEqual(result2.symbols);
    });

    it('should generate different results for different bet amounts', () => {
      const result1 = generateFallbackResult(mockTxSignature, 50000000, true);
      const result2 = generateFallbackResult(mockTxSignature, 100000000, true);
      
      expect(result1.symbols).not.toEqual(result2.symbols);
    });

    it('should respect custom configuration', () => {
      const config: Partial<FallbackConfig> = {
        houseEdge: 10,
        maxPayoutPerSpin: 50000000,
        winProbability: 0.5,
      };
      
      const result = generateFallbackResult(mockTxSignature, betAmount, true, config);
      
      expect(result.symbols).toHaveLength(3);
      expect(result.symbols.every(s => s >= 0 && s <= 7)).toBe(true);
      expect(result.payout).toBeLessThanOrEqual(config.maxPayoutPerSpin!);
    });

    it('should generate valid symbols (0-7)', () => {
      for (let i = 0; i < 100; i++) {
        const txSig = `test_signature_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true);
        
        expect(result.symbols.every(s => s >= 0 && s <= 7)).toBe(true);
      }
    });

    it('should include timestamp and bet amount in result', () => {
      const beforeTime = Date.now();
      const result = generateFallbackResult(mockTxSignature, betAmount, true);
      const afterTime = Date.now();
      
      expect(result.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(result.timestamp).toBeLessThanOrEqual(afterTime);
      expect(result.betAmount).toBe(betAmount);
    });
  });

  describe('payout calculation logic', () => {
    it('should calculate correct payout for three matching symbols', () => {
      // Test with a signature that we know generates matching symbols
      // We'll test multiple signatures to find one that generates a win
      let foundWin = false;
      
      for (let i = 0; i < 1000 && !foundWin; i++) {
        const txSig = `test_win_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true);
        
        const [s1, s2, s3] = result.symbols;
        if (s1 === s2 && s2 === s3) {
          foundWin = true;
          
          // Verify payout calculation
          const expectedMultipliers: Record<number, number> = {
            [SYMBOLS.GORBAGANA]: 100,
            [SYMBOLS.WILD]: 50,
            [SYMBOLS.BONUS_CHEST]: 25,
            [SYMBOLS.TRASH]: 20,
            [SYMBOLS.TAKEOUT]: 15,
            [SYMBOLS.FISH]: 10,
            [SYMBOLS.RAT]: 5,
            [SYMBOLS.BANANA]: 2,
          };
          
          const expectedPayout = betAmount * expectedMultipliers[s1];
          const houseEdgeAmount = betAmount * 5 / 100; // 5% house edge
          const maxExpectedPayout = Math.min(expectedPayout, betAmount - houseEdgeAmount);
          
          expect(result.payout).toBeLessThanOrEqual(maxExpectedPayout);
          expect(result.payout).toBeGreaterThan(0);
        }
      }
      
      expect(foundWin).toBe(true);
    });

    it('should return zero payout for non-matching symbols', () => {
      // Test multiple signatures to find non-matching combinations
      let foundLoss = false;
      
      for (let i = 0; i < 1000 && !foundLoss; i++) {
        const txSig = `test_loss_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true);
        
        const [s1, s2, s3] = result.symbols;
        if (!(s1 === s2 && s2 === s3)) {
          foundLoss = true;
          expect(result.payout).toBe(0);
        }
      }
      
      expect(foundLoss).toBe(true);
    });

    it('should respect house edge limits', () => {
      const config: Partial<FallbackConfig> = {
        houseEdge: 20, // 20% house edge
        winProbability: 1.0, // Force wins for testing
      };
      
      // Find a winning combination
      for (let i = 0; i < 100; i++) {
        const txSig = `test_house_edge_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true, config);
        
        const [s1, s2, s3] = result.symbols;
        if (s1 === s2 && s2 === s3 && result.payout > 0) {
          const maxAllowedPayout = betAmount * 0.8; // 80% after house edge
          expect(result.payout).toBeLessThanOrEqual(maxAllowedPayout);
          break;
        }
      }
    });

    it('should respect maximum payout per spin', () => {
      const config: Partial<FallbackConfig> = {
        maxPayoutPerSpin: 10000000, // 0.01 SOL max
        winProbability: 1.0, // Force wins
      };
      
      const largeBet = 1000000000; // 1 SOL bet
      
      for (let i = 0; i < 100; i++) {
        const txSig = `test_max_payout_${i}`;
        const result = generateFallbackResult(txSig, largeBet, true, config);
        
        expect(result.payout).toBeLessThanOrEqual(config.maxPayoutPerSpin!);
      }
    });
  });

  describe('validateFallbackResult', () => {
    it('should validate correct results', () => {
      const validResult = generateFallbackResult(mockTxSignature, betAmount, true);
      expect(validateFallbackResult(validResult)).toBe(true);
    });

    it('should reject results with invalid symbols', () => {
      const invalidResult = {
        symbols: [8, 9, 10] as [number, number, number], // Invalid symbols
        payout: 0,
        txSignature: mockTxSignature,
        betAmount,
      };
      
      expect(validateFallbackResult(invalidResult)).toBe(false);
    });

    it('should reject results with incorrect payout for non-matching symbols', () => {
      const invalidResult = {
        symbols: [0, 1, 2] as [number, number, number], // Non-matching
        payout: 1000, // Should be 0
        txSignature: mockTxSignature,
        betAmount,
      };
      
      expect(validateFallbackResult(invalidResult)).toBe(false);
    });

    it('should reject results with excessive payout', () => {
      const invalidResult = {
        symbols: [0, 0, 0] as [number, number, number], // Matching Gorbagana
        payout: betAmount * 200, // Way too high
        txSignature: mockTxSignature,
        betAmount,
      };
      
      expect(validateFallbackResult(invalidResult)).toBe(false);
    });

    it('should accept zero payout for non-matching symbols', () => {
      const validResult = {
        symbols: [0, 1, 2] as [number, number, number], // Non-matching
        payout: 0,
        txSignature: mockTxSignature,
        betAmount,
      };
      
      expect(validateFallbackResult(validResult)).toBe(true);
    });
  });

  describe('getSymbolName', () => {
    it('should return correct names for all symbols', () => {
      expect(getSymbolName(SYMBOLS.GORBAGANA)).toBe('Gorbagana');
      expect(getSymbolName(SYMBOLS.WILD)).toBe('Wild');
      expect(getSymbolName(SYMBOLS.BONUS_CHEST)).toBe('Bonus Chest');
      expect(getSymbolName(SYMBOLS.TRASH)).toBe('Trash');
      expect(getSymbolName(SYMBOLS.TAKEOUT)).toBe('Takeout');
      expect(getSymbolName(SYMBOLS.FISH)).toBe('Fish');
      expect(getSymbolName(SYMBOLS.RAT)).toBe('Rat');
      expect(getSymbolName(SYMBOLS.BANANA)).toBe('Banana');
    });

    it('should return "Unknown" for invalid symbols', () => {
      expect(getSymbolName(99)).toBe('Unknown');
      expect(getSymbolName(-1)).toBe('Unknown');
    });
  });

  describe('fairness and distribution', () => {
    it('should have reasonable win/loss distribution', () => {
      const results = [];
      const numTests = 1000;
      
      for (let i = 0; i < numTests; i++) {
        const txSig = `fairness_test_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true);
        results.push(result);
      }
      
      const wins = results.filter(r => r.payout > 0).length;
      const winRate = wins / numTests;
      
      // Win rate should be reasonable (around 15% default, but allow variance)
      expect(winRate).toBeGreaterThan(0.05); // At least 5%
      expect(winRate).toBeLessThan(0.5); // Less than 50%
    });

    it('should generate all symbol types over many iterations', () => {
      const symbolCounts = new Array(8).fill(0);
      const numTests = 10000;
      
      for (let i = 0; i < numTests; i++) {
        const txSig = `symbol_distribution_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true);
        
        result.symbols.forEach(symbol => {
          symbolCounts[symbol]++;
        });
      }
      
      // All symbols should appear at least once
      symbolCounts.forEach((count, symbol) => {
        expect(count).toBeGreaterThan(0);
      });
      
      // More common symbols should appear more frequently
      expect(symbolCounts[SYMBOLS.BANANA]).toBeGreaterThan(symbolCounts[SYMBOLS.GORBAGANA]);
    });

    it('should be consistent across multiple calls with same parameters', () => {
      const results = [];
      
      for (let i = 0; i < 10; i++) {
        const result = generateFallbackResult(mockTxSignature, betAmount, true);
        results.push(result);
      }
      
      // All results should be identical
      const firstResult = results[0];
      results.forEach(result => {
        expect(result.symbols).toEqual(firstResult.symbols);
        expect(result.payout).toBe(firstResult.payout);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle very small bet amounts', () => {
      const smallBet = 1; // 1 lamport
      const result = generateFallbackResult(mockTxSignature, smallBet, true);
      
      expect(result.betAmount).toBe(smallBet);
      expect(result.symbols).toHaveLength(3);
      expect(result.payout).toBeGreaterThanOrEqual(0);
    });

    it('should handle very large bet amounts', () => {
      const largeBet = 10000000000; // 10 SOL
      const result = generateFallbackResult(mockTxSignature, largeBet, true);
      
      expect(result.betAmount).toBe(largeBet);
      expect(result.symbols).toHaveLength(3);
      expect(result.payout).toBeGreaterThanOrEqual(0);
    });

    it('should handle empty transaction signature', () => {
      const result = generateFallbackResult('', betAmount, true);
      
      expect(result.symbols).toHaveLength(3);
      expect(result.symbols.every(s => s >= 0 && s <= 7)).toBe(true);
    });

    it('should handle zero win probability', () => {
      const config: Partial<FallbackConfig> = {
        winProbability: 0,
      };
      
      const results = [];
      for (let i = 0; i < 100; i++) {
        const txSig = `no_win_${i}`;
        const result = generateFallbackResult(txSig, betAmount, true, config);
        results.push(result);
      }
      
      // Should have very few or no wins
      const wins = results.filter(r => r.payout > 0).length;
      expect(wins).toBeLessThan(5); // Allow for some randomness in symbol generation
    });
  });
});
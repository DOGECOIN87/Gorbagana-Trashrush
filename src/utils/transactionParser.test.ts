import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import {
  extractSpinResultFromTransaction,
  parseTransactionLogs,
  validateSpinEventData,
  lamportsToSol,
  solToLamports,
  type SpinEventData,
  type SpinRequestedEventData,
  type ParsedTransactionResult
} from './transactionParser';

// Mock connection
const mockConnection = {
  getTransaction: vi.fn()
} as unknown as Connection;

const mockProgramId = new PublicKey('5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF');
const mockUserPubkey = new PublicKey('11111111111111111111111111111112');

describe('Transaction Parser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractSpinResultFromTransaction', () => {
    it('should return error when transaction is not found', async () => {
      vi.mocked(mockConnection.getTransaction).mockResolvedValue(null);

      const result = await extractSpinResultFromTransaction(
        mockConnection,
        'invalid-signature',
        mockProgramId
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction not found');
    });

    it('should return error when transaction failed', async () => {
      const mockTransaction = {
        meta: {
          err: { InstructionError: [0, 'Custom error'] },
          logMessages: []
        }
      };

      vi.mocked(mockConnection.getTransaction).mockResolvedValue(mockTransaction);

      const result = await extractSpinResultFromTransaction(
        mockConnection,
        'failed-tx-signature',
        mockProgramId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Transaction failed');
    });

    it('should fallback to log parsing when event parsing fails', async () => {
      const mockTransaction = {
        meta: {
          err: null,
          logMessages: [
            'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
            'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [1, 2, 3], payout: 1000000000 }',
            'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF consumed 12345 compute units',
            'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
          ],
          innerInstructions: []
        }
      };

      vi.mocked(mockConnection.getTransaction).mockResolvedValue(mockTransaction);

      const result = await extractSpinResultFromTransaction(
        mockConnection,
        'valid-tx-signature',
        mockProgramId
      );

      expect(result.success).toBe(true);
      expect(result.spinResult).toBeDefined();
      expect(result.spinResult?.symbols).toEqual([1, 2, 3]);
      expect(result.spinResult?.payout).toBe(1000000000);
    });

    it('should handle connection errors gracefully', async () => {
      vi.mocked(mockConnection.getTransaction).mockRejectedValue(new Error('Network error'));

      const result = await extractSpinResultFromTransaction(
        mockConnection,
        'error-tx-signature',
        mockProgramId
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Network error');
    });
  });

  describe('parseTransactionLogs', () => {
    it('should parse SpinResult from logs correctly', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [0, 1, 2], payout: 500000000 }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinResult).toBeDefined();
      expect(result.spinResult?.user.toString()).toBe(mockUserPubkey.toString());
      expect(result.spinResult?.symbols).toEqual([0, 1, 2]);
      expect(result.spinResult?.payout).toBe(500000000);
    });

    it('should parse SpinRequested from logs correctly', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinRequested { user: 11111111111111111111111111111112, bet_amount: 100000000, symbols: [3, 4, 5] }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinRequested).toBeDefined();
      expect(result.spinRequested?.user.toString()).toBe(mockUserPubkey.toString());
      expect(result.spinRequested?.betAmount).toBe(100000000);
      expect(result.spinRequested?.symbols).toEqual([3, 4, 5]);
    });

    it('should parse both SpinRequested and SpinResult from logs', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinRequested { user: 11111111111111111111111111111112, bet_amount: 200000000, symbols: [6, 7, 0] }',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [6, 7, 0], payout: 0 }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinRequested).toBeDefined();
      expect(result.spinResult).toBeDefined();
      expect(result.spinRequested?.betAmount).toBe(200000000);
      expect(result.spinResult?.payout).toBe(0);
    });

    it('should handle logs with no events but successful transaction', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.error).toContain('Transaction successful but no event data found');
    });

    it('should return error when no events found and transaction not successful', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: Some other log message',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF failed'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No spin events found in transaction logs');
    });

    it('should handle malformed log entries gracefully', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinResult { user: invalid-pubkey, symbols: [1, 2], payout: not-a-number }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinResult).toBeUndefined();
      expect(result.error).toContain('Transaction successful but no event data found');
    });

    it('should handle empty logs array', () => {
      const result = parseTransactionLogs([], mockProgramId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No spin events found in transaction logs');
    });
  });

  describe('validateSpinEventData', () => {
    it('should validate correct SpinEventData', () => {
      const validData: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1, 2],
        payout: 1000000000
      };

      expect(validateSpinEventData(validData)).toBe(true);
    });

    it('should reject invalid user PublicKey', () => {
      const invalidData = {
        user: 'not-a-pubkey',
        symbols: [0, 1, 2],
        payout: 1000000000
      } as any;

      expect(validateSpinEventData(invalidData)).toBe(false);
    });

    it('should reject invalid symbols array length', () => {
      const invalidData: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1] as any,
        payout: 1000000000
      };

      expect(validateSpinEventData(invalidData)).toBe(false);
    });

    it('should reject symbols with invalid values', () => {
      const invalidData: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1, 8], // 8 is out of range (0-7)
        payout: 1000000000
      };

      expect(validateSpinEventData(invalidData)).toBe(false);
    });

    it('should reject negative payout', () => {
      const invalidData: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1, 2],
        payout: -1000000000
      };

      expect(validateSpinEventData(invalidData)).toBe(false);
    });

    it('should reject non-numeric symbols', () => {
      const invalidData = {
        user: mockUserPubkey,
        symbols: ['0', '1', '2'],
        payout: 1000000000
      } as any;

      expect(validateSpinEventData(invalidData)).toBe(false);
    });

    it('should accept zero payout', () => {
      const validData: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1, 2],
        payout: 0
      };

      expect(validateSpinEventData(validData)).toBe(true);
    });

    it('should accept all valid symbol values (0-7)', () => {
      for (let i = 0; i <= 7; i++) {
        const validData: SpinEventData = {
          user: mockUserPubkey,
          symbols: [i, i, i],
          payout: 1000000000
        };

        expect(validateSpinEventData(validData)).toBe(true);
      }
    });
  });

  describe('lamportsToSol', () => {
    it('should convert lamports to SOL correctly', () => {
      expect(lamportsToSol(1000000000)).toBe(1);
      expect(lamportsToSol(500000000)).toBe(0.5);
      expect(lamportsToSol(0)).toBe(0);
      expect(lamportsToSol(1)).toBe(0.000000001);
    });
  });

  describe('solToLamports', () => {
    it('should convert SOL to lamports correctly', () => {
      expect(solToLamports(1)).toBe(1000000000);
      expect(solToLamports(0.5)).toBe(500000000);
      expect(solToLamports(0)).toBe(0);
      expect(solToLamports(0.000000001)).toBe(1);
    });

    it('should handle floating point precision by flooring', () => {
      expect(solToLamports(0.0000000015)).toBe(1); // Should floor to 1
      expect(solToLamports(1.9999999999)).toBe(1999999999); // Should floor
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle logs with special characters', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [1, 2, 3], payout: 1000000000 }',
        'Program log: Some log with special chars: !@#$%^&*()',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinResult).toBeDefined();
    });

    it('should handle logs with multiple SpinResult entries (use last one)', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [1, 2, 3], payout: 1000000000 }',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [4, 5, 6], payout: 2000000000 }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinResult?.symbols).toEqual([4, 5, 6]);
      expect(result.spinResult?.payout).toBe(2000000000);
    });

    it('should handle very large payout values', () => {
      const logs = [
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF invoke [1]',
        'Program log: SpinResult { user: 11111111111111111111111111111112, symbols: [0, 0, 0], payout: 999999999999999999 }',
        'Program 5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF success'
      ];

      const result = parseTransactionLogs(logs, mockProgramId);

      expect(result.success).toBe(true);
      expect(result.spinResult?.payout).toBe(999999999999999999);
    });

    it('should validate data with missing optional fields', () => {
      const dataWithoutBetAmount: SpinEventData = {
        user: mockUserPubkey,
        symbols: [0, 1, 2],
        payout: 1000000000
        // betAmount is optional
      };

      expect(validateSpinEventData(dataWithoutBetAmount)).toBe(true);
    });
  });
});
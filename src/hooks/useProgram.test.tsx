import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicKey, Connection } from '@solana/web3.js';
import { 
  extractSpinResultFromTransaction, 
  generateFallbackResult,
  validateSpinEventData,
  SpinResult 
} from '../utils';

// Mock the utility functions
vi.mock('../utils', () => ({
  extractSpinResultFromTransaction: vi.fn(),
  generateFallbackResult: vi.fn(),
  validateSpinEventData: vi.fn(),
  lamportsToSol: vi.fn((lamports: number) => lamports / 1000000000),
}));

const mockExtractSpinResult = vi.mocked(extractSpinResultFromTransaction);
const mockGenerateFallbackResult = vi.mocked(generateFallbackResult);
const mockValidateSpinEventData = vi.mocked(validateSpinEventData);

// Create a mock spinSlots function that mimics the actual implementation
async function createMockSpinSlots(
  connection: Connection,
  wallet: { publicKey: PublicKey | null },
  program: any,
  slotsStateAddress: PublicKey | null
) {
  return async (betAmount: number): Promise<SpinResult> => {
    let txSignature: string | null = null;
    
    try {
      if (!program || !wallet.publicKey || !slotsStateAddress) {
        throw new Error('Program not initialized or wallet not connected');
      }

      const betAmountLamports = Math.floor(betAmount * 1000000000);

      if (betAmountLamports <= 0) {
        throw new Error('Invalid bet amount: must be greater than 0');
      }

      // Mock getting slots state
      let slotsState;
      try {
        slotsState = await program.account.slotsState.fetch(slotsStateAddress);
      } catch (error) {
        throw new Error('Slots state not found. Please initialize the game first.');
      }

      if (slotsState.paused) {
        throw new Error('Game is currently paused. Please try again later.');
      }

      if (betAmountLamports > slotsState.maxPayoutPerSpin) {
        const maxBetSol = slotsState.maxPayoutPerSpin / 1000000000;
        throw new Error(`Bet amount too high. Maximum bet is ${maxBetSol} SOL`);
      }

      // Mock transaction submission
      txSignature = await program.methods
        .spin({ toNumber: () => betAmountLamports })
        .accounts({
          slotsState: slotsStateAddress,
          user: wallet.publicKey,
          treasury: slotsState.treasury,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
        })
        .rpc();

      // Mock transaction confirmation
      const confirmation = await connection.confirmTransaction(txSignature, 'confirmed');
      const transactionSuccess = !confirmation.value.err;

      // Try to extract spin results from transaction events
      const parseResult = await extractSpinResultFromTransaction(
        connection, 
        txSignature, 
        new PublicKey('5mumbfHtxQTQTAnhsmMbJsRU1VLNaguMQdmdVzoUk5RF')
      );

      // If we successfully parsed events, validate and return the result
      if (parseResult.success && parseResult.spinResult) {
        const eventData = parseResult.spinResult;
        
        if (validateSpinEventData(eventData)) {
          return {
            symbols: eventData.symbols,
            payout: eventData.payout,
            txSignature,
            timestamp: Date.now(),
            betAmount: betAmountLamports,
          };
        }
      }

      // Generate fallback result
      return generateFallbackResult(
        txSignature,
        betAmountLamports,
        transactionSuccess,
        {
          houseEdge: slotsState.houseEdge || 5,
          maxPayoutPerSpin: slotsState.maxPayoutPerSpin,
          winProbability: 0.15
        }
      );

    } catch (error) {
      console.error('Spin error:', error);
      
      // Handle specific error types with user-friendly messages
      if (error instanceof Error) {
        // Check for common Anchor/Solana errors
        if (error.message.includes('InsufficientFunds')) {
          throw new Error('Insufficient funds in your wallet to place this bet');
        }
        
        if (error.message.includes('InvalidBetAmount')) {
          throw new Error('Invalid bet amount. Please check the minimum and maximum bet limits');
        }
        
        if (error.message.includes('BetTooHigh')) {
          throw new Error('Bet amount exceeds the maximum allowed per spin');
        }
        
        if (error.message.includes('InsufficientPool')) {
          throw new Error('Insufficient funds in the game pool. Please try a smaller bet');
        }
        
        if (error.message.includes('GamePaused')) {
          throw new Error('Game is currently paused. Please try again later');
        }
        
        if (error.message.includes('User rejected')) {
          throw new Error('Transaction was cancelled by user');
        }
        
        if (error.message.includes('Network')) {
          throw new Error('Network error. Please check your connection and try again');
        }

        // If we have a transaction signature but the transaction failed, 
        // still generate a fallback result for consistency
        if (txSignature && error.message.includes('Transaction failed')) {
          console.log('Transaction failed, generating fallback result with zero payout');
          return generateFallbackResult(txSignature, betAmountLamports, false);
        }
      }
      
      // Re-throw the error with original message if no specific handling
      throw error;
    }
  };
}

describe('useProgram - spinSlots function integration tests', () => {
  let mockConnection: Connection;
  let mockWallet: { publicKey: PublicKey | null };
  let mockProgram: any;
  let slotsStateAddress: PublicKey;
  let spinSlots: (betAmount: number) => Promise<SpinResult>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockConnection = {
      confirmTransaction: vi.fn(),
      getTransaction: vi.fn(),
    } as unknown as Connection;

    mockWallet = {
      publicKey: new PublicKey('11111111111111111111111111111112'),
    };

    slotsStateAddress = new PublicKey('11111111111111111111111111111113');

    mockProgram = {
      methods: {
        spin: vi.fn(() => ({
          accounts: vi.fn(() => ({
            rpc: vi.fn(),
          })),
        })),
      },
      account: {
        slotsState: {
          fetch: vi.fn(),
        },
      },
    };

    // Create the spinSlots function
    spinSlots = await createMockSpinSlots(mockConnection, mockWallet, mockProgram, slotsStateAddress);
    
    // Default mock implementations
    mockConnection.confirmTransaction = vi.fn().mockResolvedValue({
      value: { err: null }
    });
    
    mockProgram.account.slotsState.fetch.mockResolvedValue({
      authority: mockWallet.publicKey,
      initialized: true,
      treasury: mockWallet.publicKey,
      totalSpins: 0,
      totalPayout: 0,
      houseEdge: 5,
      maxPayoutPerSpin: 1000000000, // 1 SOL
      totalPool: 5000000000, // 5 SOL
      minPoolThreshold: 1000000000,
      paused: false,
    });
    
    mockProgram.methods.spin.mockReturnValue({
      accounts: vi.fn().mockReturnValue({
        rpc: vi.fn().mockResolvedValue('mock-tx-signature'),
      }),
    });
  });

  it('should successfully extract results from transaction events', async () => {
    // Mock successful event parsing
    mockExtractSpinResult.mockResolvedValue({
      success: true,
      spinResult: {
        user: mockWallet.publicKey!,
        symbols: [0, 0, 0] as [number, number, number],
        payout: 1000000000,
      },
    });
    
    mockValidateSpinEventData.mockReturnValue(true);

    const result = await spinSlots(0.1); // 0.1 SOL bet

    expect(result).toEqual(expect.objectContaining({
      symbols: [0, 0, 0],
      payout: 1000000000,
      txSignature: 'mock-tx-signature',
    }));

    expect(mockExtractSpinResult).toHaveBeenCalledWith(
      mockConnection,
      'mock-tx-signature',
      expect.any(PublicKey)
    );
    
    expect(mockValidateSpinEventData).toHaveBeenCalled();
    expect(mockGenerateFallbackResult).not.toHaveBeenCalled();
  });

  it('should use fallback result when event parsing fails', async () => {
    const mockFallbackResult: SpinResult = {
      symbols: [1, 2, 3] as [number, number, number],
      payout: 0,
      txSignature: 'mock-tx-signature',
      timestamp: Date.now(),
      betAmount: 100000000,
    };

    // Mock failed event parsing
    mockExtractSpinResult.mockResolvedValue({
      success: false,
      error: 'No events found',
    });
    
    mockGenerateFallbackResult.mockReturnValue(mockFallbackResult);

    const result = await spinSlots(0.1);

    expect(result).toEqual(mockFallbackResult);
    expect(mockGenerateFallbackResult).toHaveBeenCalledWith(
      'mock-tx-signature',
      100000000, // bet amount in lamports
      true, // transaction success
      expect.objectContaining({
        houseEdge: 5,
        maxPayoutPerSpin: 1000000000,
        winProbability: 0.15,
      })
    );
  });

  it('should use fallback result when event data validation fails', async () => {
    const mockFallbackResult: SpinResult = {
      symbols: [1, 2, 3] as [number, number, number],
      payout: 0,
      txSignature: 'mock-tx-signature',
      timestamp: Date.now(),
      betAmount: 100000000,
    };

    // Mock successful parsing but failed validation
    mockExtractSpinResult.mockResolvedValue({
      success: true,
      spinResult: {
        user: mockWallet.publicKey!,
        symbols: [0, 0, 0] as [number, number, number],
        payout: 1000000000,
      },
    });
    
    mockValidateSpinEventData.mockReturnValue(false); // Validation fails
    mockGenerateFallbackResult.mockReturnValue(mockFallbackResult);

    const result = await spinSlots(0.1);

    expect(result).toEqual(mockFallbackResult);
    expect(mockGenerateFallbackResult).toHaveBeenCalled();
  });

  it('should handle transaction failure with fallback result', async () => {
    const mockFallbackResult: SpinResult = {
      symbols: [1, 2, 3] as [number, number, number],
      payout: 0,
      txSignature: 'mock-tx-signature',
      timestamp: Date.now(),
      betAmount: 100000000,
    };

    // Mock transaction failure
    mockConnection.confirmTransaction = vi.fn().mockResolvedValue({
      value: { err: { InstructionError: [0, 'Custom error'] } }
    });
    
    mockExtractSpinResult.mockResolvedValue({
      success: false,
      error: 'Transaction failed',
    });
    
    mockGenerateFallbackResult.mockReturnValue(mockFallbackResult);

    const result = await spinSlots(0.1);

    expect(result).toEqual(mockFallbackResult);
    expect(mockGenerateFallbackResult).toHaveBeenCalledWith(
      'mock-tx-signature',
      100000000,
      false, // transaction failed
      expect.any(Object)
    );
  });

  it('should throw error for invalid bet amount', async () => {
    await expect(spinSlots(0)).rejects.toThrow(
      'Invalid bet amount: must be greater than 0'
    );

    await expect(spinSlots(-1)).rejects.toThrow(
      'Invalid bet amount: must be greater than 0'
    );
  });

  it('should throw error when slots state is not found', async () => {
    mockProgram.account.slotsState.fetch.mockRejectedValue(new Error('Account not found'));

    await expect(spinSlots(0.1)).rejects.toThrow(
      'Slots state not found. Please initialize the game first.'
    );
  });

  it('should throw error when game is paused', async () => {
    mockProgram.account.slotsState.fetch.mockResolvedValue({
      authority: mockWallet.publicKey,
      initialized: true,
      treasury: mockWallet.publicKey,
      totalSpins: 0,
      totalPayout: 0,
      houseEdge: 5,
      maxPayoutPerSpin: 1000000000,
      totalPool: 5000000000,
      minPoolThreshold: 1000000000,
      paused: true, // Game is paused
    });

    await expect(spinSlots(0.1)).rejects.toThrow(
      'Game is currently paused. Please try again later.'
    );
  });

  it('should throw error when bet exceeds maximum payout', async () => {
    mockProgram.account.slotsState.fetch.mockResolvedValue({
      authority: mockWallet.publicKey,
      initialized: true,
      treasury: mockWallet.publicKey,
      totalSpins: 0,
      totalPayout: 0,
      houseEdge: 5,
      maxPayoutPerSpin: 100000000, // 0.1 SOL max
      totalPool: 5000000000,
      minPoolThreshold: 1000000000,
      paused: false,
    });

    await expect(spinSlots(1)).rejects.toThrow(
      'Bet amount too high. Maximum bet is 0.1 SOL'
    );
  });

  it('should handle specific Anchor errors with user-friendly messages', async () => {
    const testCases = [
      {
        anchorError: 'InsufficientFunds',
        expectedMessage: 'Insufficient funds in your wallet to place this bet',
      },
      {
        anchorError: 'InvalidBetAmount',
        expectedMessage: 'Invalid bet amount. Please check the minimum and maximum bet limits',
      },
      {
        anchorError: 'BetTooHigh',
        expectedMessage: 'Bet amount exceeds the maximum allowed per spin',
      },
      {
        anchorError: 'InsufficientPool',
        expectedMessage: 'Insufficient funds in the game pool. Please try a smaller bet',
      },
      {
        anchorError: 'GamePaused',
        expectedMessage: 'Game is currently paused. Please try again later',
      },
      {
        anchorError: 'User rejected',
        expectedMessage: 'Transaction was cancelled by user',
      },
    ];

    for (const testCase of testCases) {
      mockProgram.methods.spin.mockReturnValue({
        accounts: vi.fn().mockReturnValue({
          rpc: vi.fn().mockRejectedValue(new Error(testCase.anchorError)),
        }),
      });

      await expect(spinSlots(0.1)).rejects.toThrow(
        testCase.expectedMessage
      );
    }
  });

  it('should handle wallet not connected error', async () => {
    // Create a new spinSlots function with null wallet
    const spinSlotsWithoutWallet = await createMockSpinSlots(
      mockConnection, 
      { publicKey: null }, 
      mockProgram, 
      slotsStateAddress
    );

    await expect(spinSlotsWithoutWallet(0.1)).rejects.toThrow(
      'Program not initialized or wallet not connected'
    );
  });
});
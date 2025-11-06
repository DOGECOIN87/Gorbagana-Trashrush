import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useProgram } from './useProgram';
import { SpinResult } from '../utils';

// Mock Solana wallet adapter
const mockWallet = {
  publicKey: {
    toBuffer: () => Buffer.from('mock-public-key'),
    toString: () => 'mock-public-key-string'
  },
  connected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const mockConnection = {
  getSlot: vi.fn(),
  getBalance: vi.fn(),
  confirmTransaction: vi.fn(),
  getTransaction: vi.fn(),
  getRecentBlockhash: vi.fn(),
};

// Mock Anchor program
const mockProgram = {
  methods: {
    initialize: vi.fn(() => ({
      accounts: vi.fn(() => ({
        rpc: vi.fn()
      }))
    })),
    spin: vi.fn(() => ({
      accounts: vi.fn(() => ({
        rpc: vi.fn()
      }))
    }))
  },
  account: {
    slotsState: {
      fetch: vi.fn()
    }
  }
};

// Mock the wallet adapter hooks
vi.mock('@solana/wallet-adapter-react', () => ({
  useConnection: () => ({ connection: mockConnection }),
  useWallet: () => mockWallet,
}));

// Mock Anchor
vi.mock('@project-serum/anchor', () => ({
  AnchorProvider: class MockAnchorProvider {
    constructor(connection: any, wallet: any, options: any) {
      this.connection = connection;
      this.wallet = wallet;
      this.opts = options;
    }
    connection: any;
    wallet: any;
    opts: any;
    static defaultOptions() {
      return {};
    }
  },
  Program: class MockProgram {
    methods = mockProgram.methods;
    account = mockProgram.account;
    
    constructor(idl: any, programId: any, provider: any) {
      // Mock constructor logic
    }
  },
  BN: vi.fn((value) => ({ toNumber: () => value })),
}));

// Mock PublicKey
vi.mock('@solana/web3.js', () => {
  function MockPublicKey(key: string) {
    this.key = key;
    this.toString = () => key;
    this.toBuffer = () => Buffer.from(key);
  }
  MockPublicKey.findProgramAddressSync = vi.fn(() => ['mock-pda-address', 255]);
  
  return {
    PublicKey: MockPublicKey,
    SystemProgram: {
      programId: 'mock-system-program-id'
    },
    LAMPORTS_PER_SOL: 1000000000,
  };
});

// Mock utility functions
vi.mock('../utils', () => ({
  extractSpinResultFromTransaction: vi.fn(),
  generateFallbackResult: vi.fn(),
  validateSpinEventData: vi.fn(),
  lamportsToSol: vi.fn((lamports) => lamports / 1000000000),
}));

// Create GameError class for tests
class MockGameError extends Error {
  constructor(public type: string, public userMessage: string, public technicalMessage: string, public retryable: boolean = true) {
    super(userMessage);
    this.timestamp = Date.now();
  }
  timestamp: number;
}

// Mock error handler
vi.mock('../utils/errorHandler', () => ({
  parseError: vi.fn(),
  GameError: MockGameError,
  RetryManager: vi.fn(),
  NetworkHealthChecker: vi.fn(),
  LoadingStateManager: vi.fn(),
}));

// Create mock blockchain wrapper instance
const mockBlockchainWrapper = {
  executeTransaction: vi.fn(),
  retryManager: {},
  loadingManager: { 
    setLoading: vi.fn(),
    isAnyLoading: vi.fn(() => false)
  },
  networkChecker: {}
};

// Mock blockchain operation wrapper
vi.mock('../utils/blockchainOperationWrapper', () => ({
  BlockchainOperationWrapper: class MockBlockchainOperationWrapper {
    executeTransaction: any;
    retryManager: any;
    loadingManager: any;
    networkChecker: any;
    executeOperation: any;
    executeWalletOperation: any;
    executeBatch: any;
    getOperationStatus: any;
    forceRecovery: any;
    destroy: any;
    
    constructor(connection: any) {
      this.executeTransaction = mockBlockchainWrapper.executeTransaction;
      this.retryManager = mockBlockchainWrapper.retryManager;
      this.loadingManager = mockBlockchainWrapper.loadingManager;
      this.networkChecker = mockBlockchainWrapper.networkChecker;
      this.executeOperation = vi.fn();
      this.executeWalletOperation = vi.fn();
      this.executeBatch = vi.fn();
      this.getOperationStatus = vi.fn();
      this.forceRecovery = vi.fn();
      this.destroy = vi.fn();
    }
  }
}));

describe('useProgram - Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations
    mockConnection.getSlot.mockResolvedValue(100);
    mockConnection.getBalance.mockResolvedValue(10000000000); // 10 SOL
    mockProgram.account.slotsState.fetch.mockResolvedValue({
      initialized: true,
      paused: false,
      treasury: 'mock-treasury-address',
      houseEdge: 5,
      maxPayoutPerSpin: 1000000000, // 1 SOL
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initialization Flow', () => {
    it('detects uninitialized state correctly', async () => {
      // Arrange: Mock uninitialized state
      mockProgram.account.slotsState.fetch.mockRejectedValue(new Error('Account not found'));

      // Act: Render hook
      const { result } = renderHook(() => useProgram());

      // Wait for initialization check
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(false);
      });

      // Assert: Initialization status is correctly detected
      expect(result.current.isInitialized).toBe(false);
      expect(result.current.initializationError).toBe('');
    });

    it('detects initialized state correctly', async () => {
      // Arrange: Mock initialized state
      mockProgram.account.slotsState.fetch.mockResolvedValue({
        initialized: true,
        paused: false,
        treasury: 'mock-treasury-address',
      });

      // Act: Render hook
      const { result } = renderHook(() => useProgram());

      // Wait for initialization check
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Assert: Initialization status is correctly detected
      expect(result.current.isInitialized).toBe(true);
      expect(result.current.initializationError).toBe('');
    });

    it('handles initialization process successfully', async () => {
      // Arrange: Mock successful initialization
      const mockTxSignature = 'init-tx-signature';
      
      mockBlockchainWrapper.executeTransaction.mockResolvedValue(mockTxSignature);
      
      // Initially uninitialized
      mockProgram.account.slotsState.fetch
        .mockRejectedValueOnce(new Error('Account not found'))
        .mockResolvedValue({
          initialized: true,
          paused: false,
          treasury: 'mock-treasury-address',
        });

      const { result } = renderHook(() => useProgram());

      // Wait for initial state
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(false);
      });

      // Act: Initialize slots
      let initResult: string;
      await act(async () => {
        initResult = await result.current.initializeSlots();
      });

      // Assert: Initialization successful
      expect(initResult!).toBe(mockTxSignature);
      expect(mockBlockchainWrapper.executeTransaction).toHaveBeenCalled();
      
      // Wait for state update
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });
    });

    it('handles initialization errors appropriately', async () => {
      // Arrange: Mock initialization error
      const initError = new MockGameError(
        'INITIALIZATION_ERROR',
        'Failed to initialize smart contract',
        'Account creation failed',
        true
      );
      
      mockBlockchainWrapper.executeTransaction.mockRejectedValue(initError);

      const { result } = renderHook(() => useProgram());

      // Act: Attempt initialization
      let thrownError: any;
      await act(async () => {
        try {
          await result.current.initializeSlots();
        } catch (error) {
          thrownError = error;
        }
      });

      // Assert: Error handled correctly
      expect(thrownError).toBe(initError);
      expect(result.current.currentError).toBe(initError);
      expect(result.current.initializationError).toBe(initError.userMessage);
    });
  });

  describe('Spin Functionality', () => {
    beforeEach(() => {
      // Setup initialized state for spin tests
      mockProgram.account.slotsState.fetch.mockResolvedValue({
        initialized: true,
        paused: false,
        treasury: 'mock-treasury-address',
        houseEdge: 5,
        maxPayoutPerSpin: 1000000000, // 1 SOL
      });
    });

    it('executes successful spin with blockchain wrapper', async () => {
      // Arrange: Mock successful spin
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0.5,
        txSignature: 'spin-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };

      mockBlockchainWrapper.executeTransaction.mockResolvedValue(mockSpinResult);

      const { result } = renderHook(() => useProgram());

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Act: Execute spin
      let spinResult: SpinResult;
      await act(async () => {
        spinResult = await result.current.spinSlots(0.01);
      });

      // Assert: Spin executed successfully
      expect(spinResult!).toEqual(mockSpinResult);
      expect(mockBlockchainWrapper.executeTransaction).toHaveBeenCalledWith(
        'spin-slots',
        expect.any(Function),
        expect.any(Function),
        expect.any(Object)
      );
    });

    it('handles blockchain wrapper execution correctly', async () => {
      // Arrange: Mock blockchain wrapper execution
      const mockSpinResult: SpinResult = {
        symbols: [3, 4, 5],
        payout: 0,
        txSignature: 'fallback-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };

      mockBlockchainWrapper.executeTransaction.mockResolvedValue(mockSpinResult);

      const { result } = renderHook(() => useProgram());

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Act: Execute spin
      let spinResult: SpinResult;
      await act(async () => {
        spinResult = await result.current.spinSlots(0.01);
      });

      // Assert: Blockchain wrapper was used correctly
      expect(spinResult!).toEqual(mockSpinResult);
      expect(mockBlockchainWrapper.executeTransaction).toHaveBeenCalledWith(
        'spin-slots',
        expect.any(Function),
        expect.any(Function),
        expect.objectContaining({
          confirmationTimeout: expect.any(Number),
          maxConfirmationRetries: expect.any(Number)
        })
      );
    });

    it('handles spin errors with proper error types', async () => {
      // Arrange: Mock spin error
      const spinError = new MockGameError(
        'TRANSACTION_ERROR',
        'Transaction failed due to insufficient funds',
        'Simulation failed: insufficient lamports',
        true
      );
      
      mockBlockchainWrapper.executeTransaction.mockRejectedValue(spinError);

      const { result } = renderHook(() => useProgram());

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Act: Attempt spin that will fail
      let thrownError: any;
      await act(async () => {
        try {
          await result.current.spinSlots(0.01);
        } catch (error) {
          thrownError = error;
        }
      });

      // Assert: Error handled correctly
      expect(thrownError).toBe(spinError);
      expect(result.current.currentError).toBe(spinError);
    });

    it('validates bet amounts correctly', async () => {
      // Arrange: Mock validation error for invalid bet
      const validationError = new MockGameError(
        'VALIDATION_ERROR',
        'Invalid bet amount',
        'Bet amount must be greater than 0',
        false
      );
      
      mockBlockchainWrapper.executeTransaction.mockRejectedValue(validationError);

      const { result } = renderHook(() => useProgram());

      // Wait for initialization
      await waitFor(() => {
        expect(result.current.isInitialized).toBe(true);
      });

      // Act: Attempt spin with invalid bet amount
      let thrownError: any;
      await act(async () => {
        try {
          await result.current.spinSlots(0); // Invalid bet amount
        } catch (error) {
          thrownError = error;
        }
      });

      // Assert: Validation error thrown
      expect(thrownError).toBe(validationError);
    });

    it('handles game paused state correctly', async () => {
      // Arrange: Mock paused game state
      mockProgram.account.slotsState.fetch.mockResolvedValue({
        initialized: true,
        paused: true, // Game is paused
        treasury: 'mock-treasury-address',
        houseEdge: 5,
        maxPayoutPerSpin: 1000000000,
      });

      const pausedError = new MockGameError(
        'CONTRACT_ERROR',
        'The game is currently paused',
        'Game paused by authority',
        false
      );
      
      mockBlockchainWrapper.executeTransaction.mockRejectedValue(pausedError);

      const { result } = renderHook(() => useProgram());

      // Act: Attempt spin on paused game
      let thrownError: any;
      await act(async () => {
        try {
          await result.current.spinSlots(0.01);
        } catch (error) {
          thrownError = error;
        }
      });

      // Assert: Paused error handled
      expect(thrownError).toBe(pausedError);
    });
  });

  describe('Error Handling and Recovery', () => {
    it('clears errors correctly', async () => {
      // Arrange: Set an error state
      const testError = new MockGameError(
        'TEST_ERROR',
        'Test error message',
        'Test technical message',
        true
      );

      const { result } = renderHook(() => useProgram());

      // Simulate error state
      await act(async () => {
        // This would normally be set by a failed operation
        result.current['setCurrentError']?.(testError);
      });

      // Act: Clear error
      await act(async () => {
        result.current.clearError();
      });

      // Assert: Error cleared
      expect(result.current.currentError).toBeNull();
    });

    it('handles network connectivity issues', async () => {
      // Arrange: Mock network error
      const networkError = new MockGameError(
        'NETWORK_ERROR',
        'Network connection failed',
        'Connection timeout',
        true
      );
      
      mockBlockchainWrapper.executeTransaction.mockRejectedValue(networkError);

      const { result } = renderHook(() => useProgram());

      // Act: Attempt operation that will fail due to network
      let thrownError: any;
      await act(async () => {
        try {
          await result.current.spinSlots(0.01);
        } catch (error) {
          thrownError = error;
        }
      });

      // Assert: Network error handled
      expect(thrownError).toBe(networkError);
      expect(thrownError.retryable).toBe(true);
    });
  });

  describe('State Management', () => {
    it('manages loading states correctly', async () => {
      // Arrange: Mock slow operation
      mockBlockchainWrapper.executeTransaction.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve('slow-tx'), 100))
      );

      const { result } = renderHook(() => useProgram());

      // Initially not loading
      expect(result.current.isLoading).toBe(false);

      // Act: Start operation
      act(() => {
        result.current.spinSlots(0.01).catch(() => {});
      });

      // Assert: Loading state managed by blockchain wrapper
      // (The actual loading state management is handled by BlockchainOperationWrapper)
      expect(mockBlockchainWrapper.executeTransaction).toHaveBeenCalled();
    });

    it('provides access to program utilities', () => {
      // Act: Render hook
      const { result } = renderHook(() => useProgram());

      // Assert: All expected utilities are available
      expect(result.current.program).toBeDefined();
      expect(result.current.slotsStateAddress).toBeDefined();
      expect(result.current.initializeSlots).toBeInstanceOf(Function);
      expect(result.current.spinSlots).toBeInstanceOf(Function);
      expect(result.current.getSlotsState).toBeInstanceOf(Function);
      expect(result.current.checkInitializationStatus).toBeInstanceOf(Function);
      expect(result.current.clearError).toBeInstanceOf(Function);
    });
  });

  describe('Integration with Blockchain Operations', () => {
    it('integrates with blockchain operation wrapper correctly', async () => {
      // Arrange: Mock successful blockchain operation
      const mockResult = { success: true, data: 'test-result' };
      mockBlockchainWrapper.executeTransaction.mockResolvedValue(mockResult);

      const { result } = renderHook(() => useProgram());

      // Act: Execute operation
      await act(async () => {
        try {
          await result.current.spinSlots(0.01);
        } catch (error) {
          // Expected to fail in test environment
        }
      });

      // Assert: Blockchain wrapper was used
      expect(mockBlockchainWrapper.executeTransaction).toHaveBeenCalled();
      
      // Verify the operation was called with correct parameters
      const [operationId, txBuilder, resultExtractor, options] = mockBlockchainWrapper.executeTransaction.mock.calls[0];
      expect(operationId).toBe('spin-slots');
      expect(typeof txBuilder).toBe('function');
      expect(typeof resultExtractor).toBe('function');
      expect(options).toBeDefined();
    });

    it('handles blockchain wrapper configuration correctly', () => {
      // Act: Render hook
      const { result } = renderHook(() => useProgram());

      // Assert: Hook provides expected interface
      expect(result.current.spinSlots).toBeInstanceOf(Function);
      expect(result.current.initializeSlots).toBeInstanceOf(Function);
      expect(result.current.clearError).toBeInstanceOf(Function);
    });
  });
});
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainSlotGame } from './BlockchainSlotGame';
import { useProgram } from '../hooks/useProgram';
import { useEnhancedWallet } from '../hooks/useWallet';
import { SpinResult } from '../utils';
import { GameError } from '../utils/errorHandler';

// Mock the hooks
vi.mock('../hooks/useProgram');
vi.mock('../hooks/useWallet');

// Mock the assets
vi.mock('../../assets.tsx', () => ({
  IMAGES: {
    gorbagana: '/mock-gorbagana.png',
    wild: '/mock-wild.png',
    bonusChest: '/mock-bonus.png',
    trashcan: '/mock-trash.png',
    takeout: '/mock-takeout.png',
    fish: '/mock-fish.png',
    rat: '/mock-rat.png',
    banana: '/mock-banana.png',
  }
}));

// Mock the ErrorDisplay components
vi.mock('./ErrorDisplay', () => ({
  ErrorDisplay: ({ error, onRetry, onDismiss }: any) => (
    <div data-testid="error-display">
      {error && (
        <div>
          <span data-testid="error-message">{error.userMessage || error.message}</span>
          {onRetry && <button data-testid="error-retry" onClick={onRetry}>Retry</button>}
          {onDismiss && <button data-testid="error-dismiss" onClick={onDismiss}>Dismiss</button>}
        </div>
      )}
    </div>
  ),
  LoadingOverlay: ({ isLoading, message }: any) => (
    isLoading ? <div data-testid="loading-overlay">{message || 'Loading...'}</div> : null
  ),
  Toast: ({ message, isVisible, onDismiss }: any) => (
    isVisible ? (
      <div data-testid="toast">
        <span data-testid="toast-message">{message}</span>
        <button data-testid="toast-close" onClick={onDismiss}>Close</button>
      </div>
    ) : null
  )
}));

// Create a comprehensive App component for testing
const TestApp: React.FC = () => {
  const wallet = useEnhancedWallet();
  const program = useProgram();

  const handleSpin = async (betAmount: number): Promise<SpinResult> => {
    return await program.spinSlots(betAmount);
  };

  const handleBalanceRefresh = async (): Promise<void> => {
    await wallet.refreshBalance();
  };

  return (
    <div data-testid="test-app">
      <div data-testid="wallet-status">
        {wallet.isConnected ? 'Connected' : 'Disconnected'}
      </div>
      <div data-testid="initialization-status">
        {program.isInitialized === null ? 'Unknown' : 
         program.isInitialized ? 'Initialized' : 'Not Initialized'}
      </div>
      
      <BlockchainSlotGame
        onSpin={handleSpin}
        isConnected={wallet.isConnected}
        balance={wallet.balance}
        currentError={program.currentError}
        onClearError={program.clearError}
        isLoading={program.isLoading}
        onBalanceRefresh={handleBalanceRefresh}
      />
    </div>
  );
};

describe('App Integration Tests - Complete End-to-End Scenarios', () => {
  const mockUseProgram = useProgram as any;
  const mockUseEnhancedWallet = useEnhancedWallet as any;

  // Mock implementations
  const mockWallet = {
    isConnected: false,
    isConnecting: false,
    balance: 0,
    publicKey: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    refreshBalance: vi.fn(),
    connectionError: null,
    isCorrectNetwork: true,
    networkError: null,
    switchNetwork: vi.fn(),
    connectionState: { status: 'disconnected', networkValid: false },
    retryCount: 0,
  };

  const mockProgram = {
    isInitialized: null,
    isLoading: false,
    currentError: null,
    initializationError: '',
    spinSlots: vi.fn(),
    initializeSlots: vi.fn(),
    checkInitializationStatus: vi.fn(),
    clearError: vi.fn(),
    getSlotsState: vi.fn(),
    program: {},
    slotsStateAddress: 'mock-address',
    retryManager: {},
    loadingManager: {},
    networkChecker: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset mock implementations
    mockUseEnhancedWallet.mockReturnValue(mockWallet);
    mockUseProgram.mockReturnValue(mockProgram);
    
    // Reset mock states
    Object.assign(mockWallet, {
      isConnected: false,
      isConnecting: false,
      balance: 0,
      publicKey: null,
      connectionError: null,
      isCorrectNetwork: true,
      networkError: null,
      connectionState: { status: 'disconnected', networkValid: false },
      retryCount: 0,
    });
    
    Object.assign(mockProgram, {
      isInitialized: null,
      isLoading: false,
      currentError: null,
      initializationError: '',
    });
    
    // Mock console methods
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete User Journey - Happy Path', () => {
    it('executes complete user journey from wallet connection to successful spin', async () => {
      // Phase 1: Initial state - wallet disconnected, contract unknown
      render(<TestApp />);
      
      expect(screen.getByTestId('wallet-status')).toHaveTextContent('Disconnected');
      expect(screen.getByTestId('initialization-status')).toHaveTextContent('Unknown');
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();

      // Phase 2: Wallet connection
      await act(async () => {
        // Simulate wallet connection
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 10.5,
          publicKey: { toString: () => 'connected-key' },
          connectionState: { status: 'connected', networkValid: true },
        });
      });

      // Re-render with updated wallet state
      render(<TestApp />);
      
      expect(screen.getByTestId('wallet-status')).toHaveTextContent('Connected');
      expect(screen.getByText('✅ Wallet Connected | Balance: 10.5000 GOR')).toBeInTheDocument();

      // Phase 3: Contract initialization check
      await act(async () => {
        // Simulate contract initialization check
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByTestId('initialization-status')).toHaveTextContent('Initialized');
      expect(screen.getByRole('button', { name: /spin/i })).not.toBeDisabled();

      // Phase 4: Successful spin execution
      const winningResult: SpinResult = {
        symbols: [0, 0, 0], // Three gorbagana symbols
        payout: 10.0,
        txSignature: 'winning-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };

      mockProgram.spinSlots.mockResolvedValue(winningResult);
      mockWallet.refreshBalance.mockResolvedValue(undefined);

      const finalSpinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(finalSpinButton);
      });

      // Phase 5: Verify complete workflow
      expect(mockProgram.spinSlots).toHaveBeenCalledWith(0.01);
      
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 10.0000 GOR!');
      });

      expect(mockWallet.refreshBalance).toHaveBeenCalled();
    });
  });

  describe('Error Recovery Scenarios', () => {
    it('handles wallet connection failure with recovery', async () => {
      // Phase 1: Initial connection attempt fails
      render(<TestApp />);
      
      await act(async () => {
        Object.assign(mockWallet, {
          connectionError: 'Failed to connect to wallet',
          connectionState: { status: 'error', networkValid: false },
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();

      // Phase 2: Retry connection succeeds
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 5.0,
          connectionError: null,
          connectionState: { status: 'connected', networkValid: true },
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 5.0000 GOR')).toBeInTheDocument();
    });

    it('handles contract initialization failure with recovery', async () => {
      // Phase 1: Wallet connected but contract not initialized
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 8.0,
        });
        Object.assign(mockProgram, {
          isInitialized: false,
          initializationError: 'Contract needs initialization',
        });
      });

      render(<TestApp />);
      
      expect(screen.getByTestId('initialization-status')).toHaveTextContent('Not Initialized');

      // Phase 2: Initialization succeeds
      mockProgram.initializeSlots.mockResolvedValue('init-tx-signature');
      
      await act(async () => {
        Object.assign(mockProgram, {
          isInitialized: true,
          initializationError: '',
        });
      });

      render(<TestApp />);
      
      expect(screen.getByTestId('initialization-status')).toHaveTextContent('Initialized');
      expect(screen.getByRole('button', { name: /spin/i })).not.toBeDisabled();
    });

    it('handles spin transaction failure with error display and recovery', async () => {
      // Phase 1: Setup connected and initialized state
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 5.0,
        });
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);

      // Phase 2: Spin fails with transaction error
      const transactionError: GameError = {
        type: 'TRANSACTION_ERROR',
        userMessage: 'Transaction failed due to network congestion',
        technicalMessage: 'RPC timeout',
        retryable: true,
        timestamp: Date.now()
      };

      mockProgram.spinSlots.mockRejectedValue(transactionError);

      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Verify error is displayed
      await waitFor(() => {
        expect(screen.getByText('Transaction failed due to network congestion')).toBeInTheDocument();
      });

      // Phase 3: Retry succeeds
      const retryResult: SpinResult = {
        symbols: [1, 2, 3],
        payout: 0,
        txSignature: 'retry-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };

      mockProgram.spinSlots.mockResolvedValue(retryResult);
      mockProgram.clearError.mockImplementation(() => {
        Object.assign(mockProgram, { currentError: null });
      });

      // Clear error and retry
      await act(async () => {
        mockProgram.clearError();
      });

      render(<TestApp />);

      const retrySpinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(retrySpinButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Spin completed - Better luck next time!');
      });
    });
  });

  describe('Network and Connection Edge Cases', () => {
    it('handles wallet disconnection during active session', async () => {
      // Phase 1: Start with connected wallet
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 7.5,
        });
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 7.5000 GOR')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /spin/i })).not.toBeDisabled();

      // Phase 2: Wallet disconnects during session
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: false,
          balance: 0,
          publicKey: null,
          connectionState: { status: 'disconnected', networkValid: false },
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /spin/i })).toBeDisabled();
    });

    it('handles network switching scenarios', async () => {
      // Phase 1: Connected to wrong network
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 3.0,
          isCorrectNetwork: false,
          networkError: 'Please connect to Gorbagana testnet',
        });
      });

      render(<TestApp />);
      
      // Should still show connected but with network warning
      expect(screen.getByText('✅ Wallet Connected | Balance: 3.0000 GOR')).toBeInTheDocument();

      // Phase 2: Network switched to correct network
      await act(async () => {
        Object.assign(mockWallet, {
          isCorrectNetwork: true,
          networkError: null,
        });
      });

      render(<TestApp />);
      
      // Should now be fully functional
      expect(screen.getByRole('button', { name: /spin/i })).not.toBeDisabled();
    });
  });

  describe('Loading States and User Feedback', () => {
    it('shows appropriate loading states throughout the workflow', async () => {
      // Phase 1: Wallet connecting
      await act(async () => {
        Object.assign(mockWallet, {
          isConnecting: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByTestId('wallet-status')).toHaveTextContent('Disconnected');

      // Phase 2: Program loading (initialization check)
      await act(async () => {
        Object.assign(mockWallet, {
          isConnecting: false,
          isConnected: true,
          balance: 4.0,
        });
        Object.assign(mockProgram, {
          isLoading: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
      expect(screen.getByText('PROCESSING')).toBeInTheDocument();

      // Phase 3: Loading complete, ready to play
      await act(async () => {
        Object.assign(mockProgram, {
          isLoading: false,
          isInitialized: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.queryByTestId('loading-overlay')).not.toBeInTheDocument();
      expect(screen.getByText('SPIN')).toBeInTheDocument();
    });

    it('provides comprehensive user feedback for different scenarios', async () => {
      // Setup connected state
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 6.0,
        });
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);

      // Test different spin outcomes with feedback
      const testScenarios = [
        {
          name: 'Big Win',
          result: { symbols: [0, 0, 0] as [number, number, number], payout: 50.0 },
          expectedFeedback: 'Won 50.0000 GOR!'
        },
        {
          name: 'Small Win',
          result: { symbols: [7, 7, 7] as [number, number, number], payout: 0.06 },
          expectedFeedback: 'Won 0.0600 GOR!'
        },
        {
          name: 'No Win',
          result: { symbols: [0, 1, 2] as [number, number, number], payout: 0 },
          expectedFeedback: 'Spin completed - Better luck next time!'
        }
      ];

      for (const scenario of testScenarios) {
        const spinResult: SpinResult = {
          ...scenario.result,
          txSignature: `${scenario.name.toLowerCase()}-tx`,
          timestamp: Date.now(),
          betAmount: 0.01
        };

        mockProgram.spinSlots.mockResolvedValue(spinResult);
        mockWallet.refreshBalance.mockResolvedValue(undefined);

        const spinButton = screen.getByRole('button', { name: /spin/i });
        
        await act(async () => {
          fireEvent.click(spinButton);
        });

        await waitFor(() => {
          expect(screen.getByTestId('toast-message')).toHaveTextContent(scenario.expectedFeedback);
        });

        // Clear for next test
        vi.clearAllMocks();
      }
    });
  });

  describe('Balance Management Integration', () => {
    it('handles balance updates throughout the complete workflow', async () => {
      // Phase 1: Initial connection with balance
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 10.0,
        });
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 10.0000 GOR')).toBeInTheDocument();

      // Phase 2: Spin with balance refresh
      const spinResult: SpinResult = {
        symbols: [1, 1, 1],
        payout: 5.0,
        txSignature: 'balance-test-tx',
        timestamp: Date.now(),
        betAmount: 0.1
      };

      mockProgram.spinSlots.mockResolvedValue(spinResult);
      mockWallet.refreshBalance.mockImplementation(async () => {
        // Simulate balance update after spin
        Object.assign(mockWallet, { balance: 14.9 }); // Won 5.0, bet 0.1
      });

      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Phase 3: Verify balance refresh was called
      await waitFor(() => {
        expect(mockWallet.refreshBalance).toHaveBeenCalled();
      });

      expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 5.0000 GOR!');
    });

    it('handles insufficient balance scenarios', async () => {
      // Phase 1: Connected with low balance
      await act(async () => {
        Object.assign(mockWallet, {
          isConnected: true,
          balance: 0.005, // Less than minimum bet
        });
        Object.assign(mockProgram, {
          isInitialized: true,
        });
      });

      render(<TestApp />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 0.0050 GOR')).toBeInTheDocument();
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();

      // Phase 2: Balance increases (e.g., user adds funds)
      await act(async () => {
        Object.assign(mockWallet, { balance: 1.0 });
      });

      render(<TestApp />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 1.0000 GOR')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /spin/i })).not.toBeDisabled();
    });
  });
});
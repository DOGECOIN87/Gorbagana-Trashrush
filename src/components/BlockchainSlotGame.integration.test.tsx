import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainSlotGame } from './BlockchainSlotGame';
import { SpinResult } from '../utils';
import { GameError } from '../utils/errorHandler';

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

describe('BlockchainSlotGame - End-to-End Integration Tests', () => {
  const mockOnSpin = vi.fn();
  const mockOnClearError = vi.fn();
  const mockOnBalanceRefresh = vi.fn();

  const defaultProps = {
    isConnected: true,
    balance: 10.0,
    currentError: null,
    onClearError: mockOnClearError,
    isLoading: false,
    onSpin: mockOnSpin,
    onBalanceRefresh: mockOnBalanceRefresh,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console methods to reduce test noise
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Complete Spin Workflow - Button Click to Result Display', () => {
    it('executes complete winning spin workflow successfully', async () => {
      // Arrange: Setup winning spin result
      const winningSpinResult: SpinResult = {
        symbols: [0, 0, 0], // Three matching gorbagana symbols
        payout: 10.0,
        txSignature: 'winning-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(winningSpinResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      // Act: Render component and perform spin
      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeInTheDocument();
      expect(spinButton).not.toBeDisabled();

      // Click spin button
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Verify spin workflow
      // 1. Spin function called with correct bet amount
      expect(mockOnSpin).toHaveBeenCalledWith(0.01);
      
      // 2. Button shows spinning state during animation
      expect(screen.getByText('SPINNING')).toBeInTheDocument();
      expect(spinButton).toBeDisabled();

      // 3. Wait for spin animation to complete and results to display
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 3000 });

      // 4. Balance refresh was called
      expect(mockOnBalanceRefresh).toHaveBeenCalled();

      // 5. Success toast is displayed
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 10.0000 GOR!');
      });

      // 6. Win animations and effects are triggered
      await waitFor(() => {
        // Check for win text overlay (may appear briefly)
        const winElements = screen.queryAllByText(/WIN/i);
        expect(winElements.length).toBeGreaterThan(0);
      }, { timeout: 1000 });
    });

    it('executes complete losing spin workflow successfully', async () => {
      // Arrange: Setup losing spin result
      const losingSpinResult: SpinResult = {
        symbols: [0, 1, 2], // Non-matching symbols
        payout: 0,
        txSignature: 'losing-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(losingSpinResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      // Act: Render component and perform spin
      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Verify losing spin workflow
      expect(mockOnSpin).toHaveBeenCalledWith(0.01);
      
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 3000 });

      expect(mockOnBalanceRefresh).toHaveBeenCalled();

      // Info toast for losing spin
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Spin completed - Better luck next time!');
      });
    });

    it('handles spin workflow with different bet amounts', async () => {
      // Arrange: Setup spin result for higher bet
      const spinResult: SpinResult = {
        symbols: [1, 1, 1], // Three wild symbols
        payout: 5.0,
        txSignature: 'high-bet-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.1
      };
      mockOnSpin.mockResolvedValue(spinResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      // Change bet amount
      const betSelect = screen.getByDisplayValue('0.01 GOR');
      fireEvent.change(betSelect, { target: { value: '0.1' } });
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform spin with higher bet
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Verify correct bet amount was used
      expect(mockOnSpin).toHaveBeenCalledWith(0.1);
      
      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 5.0000 GOR!');
      });
    });
  });

  describe('Wallet Connection and Disconnection Scenarios', () => {
    it('prevents spin when wallet is not connected', async () => {
      // Arrange: Wallet not connected
      render(<BlockchainSlotGame {...defaultProps} isConnected={false} />);
      
      // Assert: Connection status displayed
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();
      
      // Spin button should be disabled
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();

      // Act: Try to click spin button
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: No spin function called
      expect(mockOnSpin).not.toHaveBeenCalled();
    });

    it('shows proper connection status when wallet is connected', () => {
      // Arrange & Act: Render with connected wallet
      render(<BlockchainSlotGame {...defaultProps} isConnected={true} balance={5.1234} />);
      
      // Assert: Connection status and balance displayed correctly
      expect(screen.getByText('✅ Wallet Connected | Balance: 5.1234 GOR')).toBeInTheDocument();
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).not.toBeDisabled();
    });

    it('handles wallet disconnection during spin', async () => {
      // Arrange: Setup spin that takes time to complete
      const spinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'disconnect-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(spinResult), 500))
      );

      const { rerender } = render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Start spin, then simulate wallet disconnection
      act(() => {
        fireEvent.click(spinButton);
      });
      
      // Simulate wallet disconnection during spin
      rerender(<BlockchainSlotGame {...defaultProps} isConnected={false} />);
      
      // Assert: Component handles disconnection gracefully
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();
      
      // Wait for spin to complete
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('handles insufficient balance scenarios', async () => {
      // Arrange: Low balance
      render(<BlockchainSlotGame {...defaultProps} balance={0.005} />);
      
      // Assert: Balance displayed correctly
      expect(screen.getByText('✅ Wallet Connected | Balance: 0.0050 GOR')).toBeInTheDocument();
      
      // Spin button should be disabled due to insufficient balance
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();

      // Act: Try to spin
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: No spin function called
      expect(mockOnSpin).not.toHaveBeenCalled();
    });
  });

  describe('Error Conditions and Recovery', () => {
    it('handles network errors with retry capability', async () => {
      // Arrange: Network error
      const networkError: GameError = {
        type: 'NETWORK_ERROR' as any,
        severity: 'MEDIUM' as any,
        userMessage: 'Network connection failed. Please check your internet connection.',
        technicalMessage: 'Connection timeout after 30 seconds',
        retryable: true,
        timestamp: Date.now()
      };

      render(<BlockchainSlotGame {...defaultProps} currentError={networkError} />);
      
      // Assert: Error displayed with retry option
      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Network connection failed. Please check your internet connection.');
      expect(screen.getByTestId('error-retry')).toBeInTheDocument();
      expect(screen.getByTestId('error-dismiss')).toBeInTheDocument();

      // Act: Click retry button
      fireEvent.click(screen.getByTestId('error-retry'));
      
      // Assert: Error retry mechanism triggered (would be handled by parent component)
      // In a real scenario, this would trigger a retry of the failed operation
    });

    it('handles transaction errors gracefully', async () => {
      // Arrange: Transaction error during spin
      const transactionError: GameError = {
        type: 'TRANSACTION_ERROR',
        userMessage: 'Transaction failed. Please try again.',
        technicalMessage: 'Transaction simulation failed: insufficient funds',
        retryable: true,
        timestamp: Date.now()
      };
      
      mockOnSpin.mockRejectedValue(transactionError);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Attempt spin that will fail
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Error is displayed in component
      await waitFor(() => {
        expect(screen.getByText('Transaction failed. Please try again.')).toBeInTheDocument();
      });
      
      // Spin button should be re-enabled after error
      expect(spinButton).not.toBeDisabled();
      expect(screen.getByText('SPIN')).toBeInTheDocument();
    });

    it('handles smart contract errors appropriately', async () => {
      // Arrange: Smart contract error (game paused)
      const contractError: GameError = {
        type: 'CONTRACT_ERROR',
        userMessage: 'The game is currently paused for maintenance.',
        technicalMessage: 'Program error: GamePaused',
        retryable: false,
        timestamp: Date.now()
      };
      
      mockOnSpin.mockRejectedValue(contractError);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Attempt spin that will fail due to contract error
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Contract error is displayed
      await waitFor(() => {
        expect(screen.getByText('The game is currently paused for maintenance.')).toBeInTheDocument();
      });
    });

    it('handles balance refresh errors without affecting spin result', async () => {
      // Arrange: Successful spin but balance refresh fails
      const spinResult: SpinResult = {
        symbols: [2, 2, 2], // Three bonus chest symbols
        payout: 2.5,
        txSignature: 'balance-error-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(spinResult);
      mockOnBalanceRefresh.mockRejectedValue(new Error('Balance refresh failed'));

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform spin
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Spin completes successfully despite balance refresh error
      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 2.5000 GOR!');
      });
      
      // Balance refresh was attempted
      expect(mockOnBalanceRefresh).toHaveBeenCalled();
      
      // Spin result is still displayed correctly - wait for spin to complete
      await waitFor(() => {
        const spinButton = screen.getByRole('button', { name: /spin/i });
        expect(spinButton).not.toBeDisabled();
      }, { timeout: 5000 });
    });

    it('provides error recovery through dismiss functionality', async () => {
      // Arrange: Error state
      const error: GameError = {
        type: 'VALIDATION_ERROR',
        userMessage: 'Invalid bet amount selected.',
        technicalMessage: 'Bet amount exceeds maximum allowed',
        retryable: false,
        timestamp: Date.now()
      };

      render(<BlockchainSlotGame {...defaultProps} currentError={error} />);
      
      // Assert: Error is displayed
      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByTestId('error-message')).toHaveTextContent('Invalid bet amount selected.');
      
      // Act: Dismiss error
      fireEvent.click(screen.getByTestId('error-dismiss'));
      
      // Assert: Clear error function called
      expect(mockOnClearError).toHaveBeenCalled();
    });
  });

  describe('Smart Contract Initialization Flow', () => {
    it('handles uninitialized state with proper error messaging', async () => {
      // Arrange: Initialization error
      const initError: GameError = {
        type: 'INITIALIZATION_ERROR',
        userMessage: 'Smart contract needs to be initialized before playing.',
        technicalMessage: 'SlotsState account not found',
        retryable: true,
        timestamp: Date.now()
      };
      
      mockOnSpin.mockRejectedValue(initError);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Attempt spin on uninitialized contract
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Initialization error is displayed
      await waitFor(() => {
        expect(screen.getByText('Smart contract needs to be initialized before playing.')).toBeInTheDocument();
      });
    });

    it('handles initialization success flow', async () => {
      // Arrange: First spin fails with init error, second succeeds
      const initError: GameError = {
        type: 'INITIALIZATION_ERROR',
        userMessage: 'Smart contract needs to be initialized before playing.',
        technicalMessage: 'SlotsState account not found',
        retryable: true,
        timestamp: Date.now()
      };
      
      const successResult: SpinResult = {
        symbols: [3, 4, 5],
        payout: 0,
        txSignature: 'post-init-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };

      // First call fails, second succeeds (simulating initialization)
      mockOnSpin
        .mockRejectedValueOnce(initError)
        .mockResolvedValueOnce(successResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: First spin attempt (fails)
      await act(async () => {
        fireEvent.click(spinButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Smart contract needs to be initialized before playing.')).toBeInTheDocument();
      });

      // Clear the error (simulating user action or auto-retry)
      mockOnClearError.mockImplementation(() => {
        // Simulate error being cleared
      });

      // Act: Second spin attempt (succeeds after initialization)
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Second spin succeeds
      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Spin completed - Better luck next time!');
      });
    });
  });

  describe('Balance Updates After Successful Spins', () => {
    it('verifies balance refresh is called after winning spin', async () => {
      // Arrange: Winning spin
      const winningResult: SpinResult = {
        symbols: [7, 7, 7], // Three banana symbols (lowest payout)
        payout: 0.06, // 2 * 0.01 * 3
        txSignature: 'balance-update-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(winningResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform winning spin
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Balance refresh called after spin
      await waitFor(() => {
        expect(mockOnBalanceRefresh).toHaveBeenCalled();
      });
      
      // Verify spin completed successfully
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 0.0600 GOR!');
    });

    it('verifies balance refresh is called after losing spin', async () => {
      // Arrange: Losing spin
      const losingResult: SpinResult = {
        symbols: [0, 1, 7], // Non-matching symbols
        payout: 0,
        txSignature: 'losing-balance-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(losingResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform losing spin
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Balance refresh called even for losing spins
      await waitFor(() => {
        expect(mockOnBalanceRefresh).toHaveBeenCalled();
      });
      
      expect(screen.getByTestId('toast-message')).toHaveTextContent('Spin completed - Better luck next time!');
    });

    it('handles balance refresh timing correctly', async () => {
      // Arrange: Track call order
      const callOrder: string[] = [];
      
      const spinResult: SpinResult = {
        symbols: [1, 2, 3],
        payout: 0,
        txSignature: 'timing-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockImplementation(async () => {
        callOrder.push('spin');
        return spinResult;
      });
      
      mockOnBalanceRefresh.mockImplementation(async () => {
        callOrder.push('balance-refresh');
      });

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform spin
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Verify call order (spin first, then balance refresh)
      await waitFor(() => {
        expect(callOrder).toEqual(['spin', 'balance-refresh']);
      });
    });
  });

  describe('Loading States and User Feedback', () => {
    it('shows proper loading states during blockchain operations', async () => {
      // Arrange: Slow spin operation
      const spinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'slow-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(spinResult), 200))
      );

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Start spin
      act(() => {
        fireEvent.click(spinButton);
      });

      // Assert: Loading state is shown immediately
      expect(screen.getByText('SPINNING')).toBeInTheDocument();
      expect(spinButton).toBeDisabled();
      
      // Wait for completion
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
        expect(spinButton).not.toBeDisabled();
      }, { timeout: 3000 });
    });

    it('shows external loading overlay when isLoading prop is true', () => {
      // Arrange & Act: Render with loading state
      render(<BlockchainSlotGame {...defaultProps} isLoading={true} />);
      
      // Assert: Loading overlay is displayed
      expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
      expect(screen.getByText('PROCESSING')).toBeInTheDocument();
      
      const spinButton = screen.getByRole('button', { name: /processing/i });
      expect(spinButton).toBeDisabled();
    });

    it('provides appropriate user feedback for different spin outcomes', async () => {
      // Test big win scenario
      const bigWinResult: SpinResult = {
        symbols: [0, 0, 0],
        payout: 100.0,
        txSignature: 'big-win-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(bigWinResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      const { unmount } = render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 100.0000 GOR!');
      }, { timeout: 3000 });

      unmount();
      vi.clearAllMocks();

      // Test small win scenario
      const smallWinResult: SpinResult = {
        symbols: [7, 7, 7],
        payout: 0.06,
        txSignature: 'small-win-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(smallWinResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      const { unmount: unmount2 } = render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton2 = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton2);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Won 0.0600 GOR!');
      }, { timeout: 3000 });

      unmount2();
      vi.clearAllMocks();

      // Test no win scenario
      const noWinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'no-win-tx-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(noWinResult);
      mockOnBalanceRefresh.mockResolvedValue(undefined);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton3 = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton3);
      });

      await waitFor(() => {
        expect(screen.getByTestId('toast-message')).toHaveTextContent('Spin completed - Better luck next time!');
      }, { timeout: 3000 });
    });
  });

  describe('Fallback Behavior Without onSpin Prop', () => {
    it('works in local simulation mode when onSpin is not provided', async () => {
      // Arrange: Remove onSpin prop to test fallback
      const { onSpin, ...propsWithoutSpin } = defaultProps;
      
      render(<BlockchainSlotGame {...propsWithoutSpin} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      // Act: Perform spin in simulation mode
      await act(async () => {
        fireEvent.click(spinButton);
      });

      // Assert: Spin completes without errors
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 3000 });
      
      // Should show some kind of completion message
      await waitFor(() => {
        const toast = screen.queryByTestId('toast');
        if (toast) {
          expect(toast).toBeInTheDocument();
        }
      });
      
      // onSpin should not have been called since it wasn't provided
      expect(mockOnSpin).not.toHaveBeenCalled();
      
      // Balance refresh should not be called in simulation mode
      expect(mockOnBalanceRefresh).not.toHaveBeenCalled();
    });
  });
});
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
          <span>{error.userMessage || error.message}</span>
          {onRetry && <button onClick={onRetry}>Retry</button>}
          {onDismiss && <button onClick={onDismiss}>Dismiss</button>}
        </div>
      )}
    </div>
  ),
  LoadingOverlay: ({ isLoading, message }: any) => (
    isLoading ? <div data-testid="loading-overlay">{message}</div> : null
  ),
  Toast: ({ message, isVisible, onDismiss }: any) => (
    isVisible ? (
      <div data-testid="toast">
        <span>{message}</span>
        <button onClick={onDismiss}>Close</button>
      </div>
    ) : null
  )
}));

describe('BlockchainSlotGame', () => {
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
    // Mock console methods to avoid noise in tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Component Rendering', () => {
    it('renders the game interface correctly', () => {
      render(<BlockchainSlotGame {...defaultProps} />);
      
      expect(screen.getByText('Gorbagana')).toBeInTheDocument();
      expect(screen.getByText('Trash Rush')).toBeInTheDocument();
      expect(screen.getByText('SPIN')).toBeInTheDocument();
      expect(screen.getByText('✅ Wallet Connected | Balance: 10.0000 GOR')).toBeInTheDocument();
    });

    it('shows wallet not connected when isConnected is false', () => {
      render(<BlockchainSlotGame {...defaultProps} isConnected={false} />);
      
      expect(screen.getByText('⚠️ Wallet Not Connected')).toBeInTheDocument();
    });

    it('displays the current balance correctly', () => {
      render(<BlockchainSlotGame {...defaultProps} balance={5.1234} />);
      
      expect(screen.getByText('✅ Wallet Connected | Balance: 5.1234 GOR')).toBeInTheDocument();
    });
  });

  describe('Spin Button Functionality', () => {
    it('disables spin button when wallet is not connected', () => {
      render(<BlockchainSlotGame {...defaultProps} isConnected={false} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();
    });

    it('disables spin button when balance is insufficient', () => {
      render(<BlockchainSlotGame {...defaultProps} balance={0.005} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).toBeDisabled();
    });

    it('disables spin button when loading', () => {
      render(<BlockchainSlotGame {...defaultProps} isLoading={true} />);
      
      const spinButton = screen.getByRole('button', { name: /processing/i });
      expect(spinButton).toBeDisabled();
    });

    it('enables spin button when conditions are met', () => {
      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      expect(spinButton).not.toBeDisabled();
    });
  });

  describe('Spin Functionality', () => {
    it('prevents spin when wallet is not connected', async () => {
      render(<BlockchainSlotGame {...defaultProps} isConnected={false} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      // Should not call onSpin when wallet is not connected
      expect(mockOnSpin).not.toHaveBeenCalled();
    });

    it('prevents spin when balance is insufficient', async () => {
      render(<BlockchainSlotGame {...defaultProps} balance={0.005} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      // Should not call onSpin when balance is insufficient
      expect(mockOnSpin).not.toHaveBeenCalled();
    });

    it('calls onSpin with correct bet amount when spinning', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0.5,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(mockSpinResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      expect(mockOnSpin).toHaveBeenCalledWith(0.01);
    });

    it('calls onBalanceRefresh after successful spin', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0.5,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(mockSpinResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      await waitFor(() => {
        expect(mockOnBalanceRefresh).toHaveBeenCalled();
      });
    });

    it('shows success toast for winning spins', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 0, 0],
        payout: 1.0,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(mockSpinResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByText('Won 1.0000 GOR!')).toBeInTheDocument();
      });
    });

    it('shows info toast for losing spins', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      mockOnSpin.mockResolvedValue(mockSpinResult);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByText('Spin completed - Better luck next time!')).toBeInTheDocument();
      });
    });
  });

  describe('Loading States', () => {
    it('shows spinning state during spin animation', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      // Delay the resolution to test loading state
      mockOnSpin.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockSpinResult), 100))
      );

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      act(() => {
        fireEvent.click(spinButton);
      });
      
      // Should show spinning state immediately
      expect(screen.getByText('SPINNING')).toBeInTheDocument();
      expect(spinButton).toBeDisabled();
      
      // Wait for spin to complete
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 2000 });
    });

    it('shows processing state when isLoading is true', () => {
      render(<BlockchainSlotGame {...defaultProps} isLoading={true} />);
      
      expect(screen.getByText('PROCESSING')).toBeInTheDocument();
      expect(screen.getByTestId('loading-overlay')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('displays GameError correctly', () => {
      const gameError: GameError = {
        type: 'TRANSACTION_ERROR',
        userMessage: 'Transaction failed',
        technicalMessage: 'Network timeout',
        retryable: true,
        timestamp: Date.now()
      };

      render(<BlockchainSlotGame {...defaultProps} currentError={gameError} />);
      
      expect(screen.getByTestId('error-display')).toBeInTheDocument();
      expect(screen.getByText('Transaction failed')).toBeInTheDocument();
    });

    it('handles spin errors gracefully', async () => {
      const gameError: GameError = {
        type: 'NETWORK_ERROR',
        userMessage: 'Network connection failed',
        technicalMessage: 'Connection timeout',
        retryable: true,
        timestamp: Date.now()
      };
      
      mockOnSpin.mockRejectedValue(gameError);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Network connection failed')).toBeInTheDocument();
      });
    });

    it('handles regular errors as fallback', async () => {
      const regularError = new Error('Something went wrong');
      mockOnSpin.mockRejectedValue(regularError);

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      await waitFor(() => {
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      });
    });

    it('calls onClearError when error is dismissed', () => {
      const gameError: GameError = {
        type: 'TRANSACTION_ERROR',
        userMessage: 'Transaction failed',
        technicalMessage: 'Network timeout',
        retryable: true,
        timestamp: Date.now()
      };

      render(<BlockchainSlotGame {...defaultProps} currentError={gameError} />);
      
      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);
      
      expect(mockOnClearError).toHaveBeenCalled();
    });
  });

  describe('Bet Amount Selection', () => {
    it('allows changing bet amount', () => {
      render(<BlockchainSlotGame {...defaultProps} />);
      
      const betSelect = screen.getByDisplayValue('0.01 GOR');
      fireEvent.change(betSelect, { target: { value: '0.1' } });
      
      expect(betSelect).toHaveValue('0.1');
    });

    it('disables bet selection during spin', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockSpinResult), 100))
      );

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      const betSelect = screen.getByDisplayValue('0.01 GOR');
      
      act(() => {
        fireEvent.click(spinButton);
      });
      
      expect(betSelect).toBeDisabled();
      
      await waitFor(() => {
        expect(betSelect).not.toBeDisabled();
      }, { timeout: 2000 });
    });
  });

  describe('Balance Refresh Error Handling', () => {
    it('continues spin even if balance refresh fails', async () => {
      const mockSpinResult: SpinResult = {
        symbols: [0, 1, 2],
        payout: 0.5,
        txSignature: 'test-signature',
        timestamp: Date.now(),
        betAmount: 0.01
      };
      
      mockOnSpin.mockResolvedValue(mockSpinResult);
      mockOnBalanceRefresh.mockRejectedValue(new Error('Balance refresh failed'));

      render(<BlockchainSlotGame {...defaultProps} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      // Should still show success toast despite balance refresh failure
      await waitFor(() => {
        expect(screen.getByTestId('toast')).toBeInTheDocument();
        expect(screen.getByText('Won 0.5000 GOR!')).toBeInTheDocument();
      });
      
      // Should have attempted balance refresh
      expect(mockOnBalanceRefresh).toHaveBeenCalled();
    });
  });

  describe('Fallback Simulation', () => {
    it('works without onSpin prop (local simulation)', async () => {
      const { onSpin, ...propsWithoutSpin } = defaultProps;
      
      render(<BlockchainSlotGame {...propsWithoutSpin} />);
      
      const spinButton = screen.getByRole('button', { name: /spin/i });
      
      await act(async () => {
        fireEvent.click(spinButton);
      });
      
      // Should complete without errors
      await waitFor(() => {
        expect(screen.getByText('SPIN')).toBeInTheDocument();
      }, { timeout: 2000 });
    });
  });
});
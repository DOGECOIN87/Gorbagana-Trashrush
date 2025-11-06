import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { BlockchainSlotGame } from './BlockchainSlotGame';
import { GameError, ErrorType, ErrorSeverity } from '../utils/errorHandler';

// Mock the blockchain operations
const mockOnSpin = vi.fn();
const mockOnBalanceRefresh = vi.fn();
const mockOnClearError = vi.fn();

// Global state to track failures across component remounts
let globalFailCount = 0;
let globalClickCount = 0;

// Mock component that simulates blockchain slot game with controllable errors
const MockBlockchainSlotGame: React.FC<{
  shouldFailSpin?: boolean;
  failureType?: string;
  failureCount?: number;
}> = ({ shouldFailSpin = false, failureType = 'network error', failureCount = 1 }) => {
  const [shouldThrow, setShouldThrow] = React.useState(false);

  // Reset error state when component remounts (after ErrorBoundary retry)
  React.useEffect(() => {
    setShouldThrow(false);
  }, []);

  const handleSpin = (betAmount: number) => {
    globalClickCount++;
    
    if (shouldFailSpin && globalClickCount <= failureCount) {
      globalFailCount = globalClickCount;
      // Use setTimeout to throw error in next render cycle
      setTimeout(() => setShouldThrow(true), 0);
      return;
    }
    
    // Successful spin - reset any error state
    setShouldThrow(false);
  };

  // This will throw during render, which ErrorBoundary can catch
  if (shouldThrow) {
    throw new Error(failureType);
  }

  return (
    <div>
      <div data-testid="game-status">Game Ready</div>
      <button 
        onClick={() => handleSpin(0.01)} 
        data-testid="spin-button"
      >
        Spin
      </button>
      <div data-testid="fail-count">{globalFailCount}</div>
    </div>
  );
};

describe('Error Recovery Integration', () => {
  let originalUnhandledRejection: any;

  beforeEach(() => {
    vi.clearAllMocks();
    globalFailCount = 0; // Reset global fail count for each test
    globalClickCount = 0; // Reset global click count for each test
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});

    // Capture and suppress unhandled rejections during tests
    originalUnhandledRejection = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason, promise) => {
      // Suppress test-related unhandled rejections
      if (reason instanceof Error && (
        reason.message.includes('network error') ||
        reason.message.includes('wallet not connected') ||
        reason.message.includes('user rejected') ||
        reason.message.includes('insufficient funds') ||
        reason.message.includes('critical system failure')
      )) {
        return; // Suppress these specific test-related rejections
      }
      // Re-throw other unhandled rejections
      throw reason;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    
    // Restore original unhandled rejection handlers
    process.removeAllListeners('unhandledRejection');
    if (originalUnhandledRejection) {
      originalUnhandledRejection.forEach((listener: any) => {
        process.on('unhandledRejection', listener);
      });
    }
  });

  describe('Network Error Recovery', () => {
    it('should recover from transient network errors with manual retry', async () => {
      render(
        <ErrorBoundary maxRetries={3}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      // Initial state should show game ready
      expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');

      // Trigger error
      fireEvent.click(screen.getByTestId('spin-button'));

      // Should show error boundary
      await waitFor(() => {
        expect(screen.getByText('Application Error')).toBeInTheDocument();
        expect(screen.getByText(/Connection issue detected/)).toBeInTheDocument();
      });

      // Should show network-specific guidance
      expect(screen.getByText('Network Issue Detected:')).toBeInTheDocument();
      expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();

      // Retry should work
      fireEvent.click(screen.getByText('Try Again'));

      // Should recover and show game again
      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });

      // Verify the failure count increased (showing retry worked)
      expect(screen.getByTestId('fail-count')).toHaveTextContent('1');
    });

    it('should handle multiple retry attempts', async () => {
      render(
        <ErrorBoundary maxRetries={3}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={2}
          />
        </ErrorBoundary>
      );

      // First failure
      fireEvent.click(screen.getByTestId('spin-button'));
      
      await waitFor(() => {
        expect(screen.getByText('Application Error')).toBeInTheDocument();
      });

      // First retry
      fireEvent.click(screen.getByText('Try Again'));
      
      // Should recover and show game again
      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });

      // Click spin again to trigger second failure
      fireEvent.click(screen.getByTestId('spin-button'));
      
      // Should fail again and show retry count
      await waitFor(() => {
        expect(screen.getByText(/Retry attempt: 1\/3/)).toBeInTheDocument();
      });

      // Second retry should succeed
      fireEvent.click(screen.getByText('Try Again'));
      
      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });
    });
  });

  describe('Wallet Error Recovery', () => {
    it('should provide wallet-specific recovery options', async () => {
      render(
        <ErrorBoundary>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="wallet not connected"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByText(/Please connect your wallet to continue playing/)).toBeInTheDocument();
      });

      // Should show wallet-specific guidance
      expect(screen.getByText('Wallet Connection Issue:')).toBeInTheDocument();
      expect(screen.getByText(/Make sure your wallet extension is unlocked/)).toBeInTheDocument();

      // Should provide reconnect wallet action
      expect(screen.getByText('Reconnect Wallet')).toBeInTheDocument();
    });

    it('should handle user rejection gracefully', async () => {
      render(
        <ErrorBoundary>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="user rejected"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByText(/Transaction was cancelled/)).toBeInTheDocument();
      });

      // User rejection should be retryable but not show auto-retry
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.queryByText('Auto-retry in progress...')).not.toBeInTheDocument();
    });
  });

  describe('Auto-Retry Functionality', () => {
    it('should auto-retry network errors', async () => {
      vi.useFakeTimers();

      render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={2000} maxRetries={2}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      // Should show error first
      await waitFor(() => {
        expect(screen.getByText('Application Error')).toBeInTheDocument();
      });

      // Should show auto-retry indicator
      await waitFor(() => {
        expect(screen.getByText('Auto-retry in progress...')).toBeInTheDocument();
      });

      // Fast-forward time to trigger auto-retry
      act(() => {
        vi.advanceTimersByTime(2000);
      });

      // Should recover automatically
      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });

      vi.useRealTimers();
    });

    it('should disable manual actions during auto-retry', async () => {
      vi.useFakeTimers();

      render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={5000}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByText('Auto-retry in progress...')).toBeInTheDocument();
      });

      // All buttons should be disabled during auto-retry
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeDisabled();
      });

      vi.useRealTimers();
    });
  });

  describe('Critical Error Handling', () => {
    it('should handle critical errors with appropriate severity', async () => {
      render(
        <ErrorBoundary>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="critical system failure"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByText('A critical error has occurred')).toBeInTheDocument();
      });

      // Should show critical error warning
      expect(screen.getByText(/This is a critical error - please report it immediately/)).toBeInTheDocument();
    });
  });

  describe('Error Recovery Flow', () => {
    it('should maintain error history across retries', async () => {
      render(
        <ErrorBoundary maxRetries={3}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={2}
          />
        </ErrorBoundary>
      );

      // First failure
      fireEvent.click(screen.getByTestId('spin-button'));
      
      await waitFor(() => {
        expect(screen.getByText('Application Error')).toBeInTheDocument();
      });

      // First retry
      fireEvent.click(screen.getByText('Try Again'));
      
      await waitFor(() => {
        expect(screen.getByText(/Retry attempt: 1\/3/)).toBeInTheDocument();
      });

      // Should show recovery attempts section
      expect(screen.getByText('Recovery Attempts:')).toBeInTheDocument();
      expect(screen.getByText(/1 attempt made/)).toBeInTheDocument();

      // Second retry should succeed
      fireEvent.click(screen.getByText('Try Again'));
      
      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });
    });

    it('should show max retries reached message', async () => {
      render(
        <ErrorBoundary maxRetries={1}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={3}
          />
        </ErrorBoundary>
      );

      // First failure
      fireEvent.click(screen.getByTestId('spin-button'));
      
      await waitFor(() => {
        expect(screen.getByText('Application Error')).toBeInTheDocument();
      });

      // Retry should fail again
      fireEvent.click(screen.getByText('Try Again'));
      
      await waitFor(() => {
        expect(screen.getByText(/Maximum retries reached - manual intervention required/)).toBeInTheDocument();
      });
    });
  });

  describe('Custom Error Handling', () => {
    const CustomErrorFallback: React.FC<{
      error: GameError;
      retry: () => void;
      retryCount: number;
    }> = ({ error, retry, retryCount }) => (
      <div>
        <div data-testid="custom-error-message">{error.userMessage}</div>
        <div data-testid="custom-retry-count">Retries: {retryCount}</div>
        <button onClick={retry} data-testid="custom-retry-button">
          Custom Retry
        </button>
      </div>
    );

    it('should use custom error fallback', async () => {
      render(
        <ErrorBoundary fallback={CustomErrorFallback}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByTestId('custom-error-message')).toHaveTextContent(
          /Connection issue detected/
        );
      });

      expect(screen.getByTestId('custom-retry-count')).toHaveTextContent('Retries: 0');
      expect(screen.getByTestId('custom-retry-button')).toBeInTheDocument();

      // Custom retry should work
      fireEvent.click(screen.getByTestId('custom-retry-button'));

      await waitFor(() => {
        expect(screen.getByTestId('game-status')).toHaveTextContent('Game Ready');
      });
    });
  });

  describe('Error Callback Integration', () => {
    it('should call error callback with proper context', async () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary onError={onError}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="insufficient funds"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          expect.objectContaining({
            type: ErrorType.INSUFFICIENT_FUNDS,
            userMessage: expect.stringContaining('Not enough SOL'),
            technicalMessage: 'insufficient funds',
            retryable: false
          }),
          expect.any(Object) // React error info
        );
      });
    });
  });

  describe('Performance and Memory', () => {
    it('should clean up timers and prevent memory leaks', async () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

      const { unmount } = render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={5000}>
          <MockBlockchainSlotGame 
            shouldFailSpin={true} 
            failureType="network error"
            failureCount={1}
          />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByTestId('spin-button'));

      await waitFor(() => {
        expect(screen.getByText('Auto-retry in progress...')).toBeInTheDocument();
      });

      // Unmount should clean up timers
      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
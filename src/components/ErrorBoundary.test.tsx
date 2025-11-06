import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';
import { GameError, ErrorType, ErrorSeverity } from '../utils/errorHandler';

// Mock component that throws errors
const ThrowError: React.FC<{ shouldThrow?: boolean; errorMessage?: string }> = ({ 
  shouldThrow = false, 
  errorMessage = 'Test error' 
}) => {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div>No error</div>;
};

// Mock component for testing custom fallback
const CustomFallback: React.FC<{ error: GameError; retry: () => void; retryCount: number }> = ({ 
  error, 
  retry, 
  retryCount 
}) => (
  <div>
    <div data-testid="custom-error">Custom Error: {error.userMessage}</div>
    <div data-testid="retry-count">Retry Count: {retryCount}</div>
    <button onClick={retry} data-testid="custom-retry">Custom Retry</button>
  </div>
);

describe('ErrorBoundary', () => {
  beforeEach(() => {
    // Clear console errors for clean test output
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Basic Error Handling', () => {
    it('should render children when no error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('No error')).toBeInTheDocument();
    });

    it('should catch and display error when child component throws', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="wallet not connected" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Application Error')).toBeInTheDocument();
      expect(screen.getByText(/Please connect your wallet to continue playing/)).toBeInTheDocument();
    });

    it('should show retry count when retries have been attempted', () => {
      const { rerender } = render(
        <ErrorBoundary maxRetries={3}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      // Simulate retry
      fireEvent.click(screen.getByText('Try Again'));
      
      rerender(
        <ErrorBoundary maxRetries={3}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Retry attempt: 1\/3/)).toBeInTheDocument();
    });
  });

  describe('Custom Fallback', () => {
    it('should use custom fallback when provided', () => {
      render(
        <ErrorBoundary fallback={CustomFallback}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('custom-error')).toHaveTextContent(
        'Custom Error: Connection issue detected. Please check your internet and try again'
      );
      expect(screen.getByTestId('retry-count')).toHaveTextContent('Retry Count: 0');
      expect(screen.getByTestId('custom-retry')).toBeInTheDocument();
    });

    it('should pass correct retry count to custom fallback', () => {
      const { rerender } = render(
        <ErrorBoundary fallback={CustomFallback} maxRetries={3}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      // First error
      expect(screen.getByTestId('retry-count')).toHaveTextContent('Retry Count: 0');

      // Simulate retry
      fireEvent.click(screen.getByTestId('custom-retry'));
      
      rerender(
        <ErrorBoundary fallback={CustomFallback} maxRetries={3}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      expect(screen.getByTestId('retry-count')).toHaveTextContent('Retry Count: 1');
    });
  });

  describe('Auto-Retry Functionality', () => {
    it('should show auto-retry indicator when enabled', async () => {
      render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={1000} maxRetries={2}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      await waitFor(() => {
        expect(screen.getByText('Auto-retry in progress...')).toBeInTheDocument();
      });
    });

    it('should not auto-retry for non-retryable errors', () => {
      render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={100}>
          <ThrowError shouldThrow={true} errorMessage="user rejected" />
        </ErrorBoundary>
      );

      // Should not show auto-retry for user rejection
      expect(screen.queryByText('Auto-retry in progress...')).not.toBeInTheDocument();
    });

    it('should stop auto-retry after max retries reached', async () => {
      const { rerender } = render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={100} maxRetries={1}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      // Wait for auto-retry
      await waitFor(() => {
        expect(screen.getByText('Auto-retry in progress...')).toBeInTheDocument();
      });

      // Simulate continued failure
      await waitFor(() => {
        rerender(
          <ErrorBoundary enableAutoRetry={true} autoRetryDelay={100} maxRetries={1}>
            <ThrowError shouldThrow={true} errorMessage="network error" />
          </ErrorBoundary>
        );
      });

      // Should show max retries reached
      await waitFor(() => {
        expect(screen.getByText(/Maximum retries reached/)).toBeInTheDocument();
      });
    });
  });

  describe('Error Type Specific Handling', () => {
    it('should show wallet-specific guidance for wallet errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="wallet not connected" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Wallet Connection Issue:')).toBeInTheDocument();
      expect(screen.getByText(/Make sure your wallet extension is unlocked/)).toBeInTheDocument();
    });

    it('should show network-specific guidance for network errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Network Issue Detected:')).toBeInTheDocument();
      expect(screen.getByText(/Check your internet connection/)).toBeInTheDocument();
    });

    it('should provide appropriate recovery actions for different error types', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="wallet not connected" />
        </ErrorBoundary>
      );

      expect(screen.getByText('🔗 Reconnect Wallet')).toBeInTheDocument();
      expect(screen.getByText('🔄 Reload Page')).toBeInTheDocument();
    });
  });

  describe('Critical Error Handling', () => {
    it('should highlight critical errors appropriately', () => {
      // Mock a critical error by throwing a specific error that gets parsed as critical
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="critical system failure" />
        </ErrorBoundary>
      );

      expect(screen.getByText(/This is a critical error/)).toBeInTheDocument();
    });

    it('should call onError callback when provided', () => {
      const onErrorMock = vi.fn();
      
      render(
        <ErrorBoundary onError={onErrorMock}>
          <ThrowError shouldThrow={true} errorMessage="test error" />
        </ErrorBoundary>
      );

      expect(onErrorMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: expect.any(String),
          userMessage: expect.any(String),
          technicalMessage: expect.any(String)
        }),
        expect.any(Object)
      );
    });
  });

  describe('Recovery Actions', () => {
    it('should provide Try Again button for retryable errors', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      const tryAgainButton = screen.getByText('🔄 Try Again');
      expect(tryAgainButton).toBeInTheDocument();
      expect(tryAgainButton).not.toBeDisabled();
    });

    it('should disable actions during auto-retry', async () => {
      render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={1000}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        buttons.forEach(button => {
          expect(button).toBeDisabled();
        });
      });
    });

    it('should handle reload page action', () => {
      // Mock window.location.reload
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true
      });

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      fireEvent.click(screen.getByText('🔄 Reload Page'));
      expect(reloadMock).toHaveBeenCalled();
    });
  });

  describe('Technical Details', () => {
    it('should show technical details when expanded', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="test error" />
        </ErrorBoundary>
      );

      const detailsToggle = screen.getByText('Technical Details (for developers)');
      fireEvent.click(detailsToggle);

      expect(screen.getByText('Error Type:')).toBeInTheDocument();
      expect(screen.getByText('Severity:')).toBeInTheDocument();
      expect(screen.getByText('Technical Message:')).toBeInTheDocument();
    });

    it('should show retry history when retries have been attempted', () => {
      const { rerender } = render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      // Simulate retry
      fireEvent.click(screen.getByText('Try Again'));
      
      rerender(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      expect(screen.getByText('Recovery Attempts:')).toBeInTheDocument();
      expect(screen.getByText(/1 attempt made/)).toBeInTheDocument();
    });
  });

  describe('Cleanup', () => {
    it('should clear timers on unmount', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      const { unmount } = render(
        <ErrorBoundary enableAutoRetry={true} autoRetryDelay={5000}>
          <ThrowError shouldThrow={true} errorMessage="network error" />
        </ErrorBoundary>
      );

      unmount();
      
      expect(clearTimeoutSpy).toHaveBeenCalled();
      clearTimeoutSpy.mockRestore();
    });
  });
});
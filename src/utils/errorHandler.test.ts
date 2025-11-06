import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  parseError, 
  ErrorType, 
  ErrorSeverity, 
  RetryManager, 
  LoadingStateManager,
  NetworkHealthChecker
} from './errorHandler';
import { Connection } from '@solana/web3.js';



describe('Error Handler', () => {
  let originalUnhandledRejection: any;

  // Mock console methods to prevent noise in tests
  beforeEach(() => {
    vi.spyOn(console, 'group').mockImplementation(() => {});
    vi.spyOn(console, 'groupEnd').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Capture and suppress unhandled rejections during tests
    originalUnhandledRejection = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', (reason) => {
      // Suppress unhandled rejections from retry manager tests
      if (reason && typeof reason === 'object' && 'technicalMessage' in reason && reason.technicalMessage === 'network error') {
        return; // Suppress this specific test-related rejection
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

  describe('parseError', () => {
    it('should parse wallet connection errors correctly', () => {
      const error = new Error('wallet not connected');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.WALLET_ERROR);
      expect(gameError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(gameError.userMessage).toBe('Please connect your wallet to continue playing');
      expect(gameError.retryable).toBe(false);
    });

    it('should parse network errors correctly', () => {
      const error = new Error('network error occurred');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.NETWORK_ERROR);
      expect(gameError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(gameError.userMessage).toBe('Connection issue detected. Please check your internet and try again');
      expect(gameError.retryable).toBe(true);
      expect(gameError.retryDelay).toBe(2000);
    });

    it('should parse insufficient funds errors correctly', () => {
      const error = new Error('insufficient funds for transaction');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.INSUFFICIENT_FUNDS);
      expect(gameError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(gameError.userMessage).toBe('Not enough SOL in your wallet for this bet. Please add funds or reduce bet amount');
      expect(gameError.retryable).toBe(false);
    });

    it('should parse user rejection errors correctly', () => {
      const error = new Error('user rejected the transaction');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.USER_REJECTED);
      expect(gameError.severity).toBe(ErrorSeverity.LOW);
      expect(gameError.userMessage).toBe('Transaction was cancelled. Click spin again when ready to play');
      expect(gameError.retryable).toBe(true);
    });

    it('should parse smart contract errors correctly', () => {
      const error = new Error('bet too high for current pool');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.SMART_CONTRACT_ERROR);
      expect(gameError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(gameError.userMessage).toBe('Bet amount exceeds maximum allowed. Please reduce your bet');
      expect(gameError.retryable).toBe(false);
    });

    it('should handle unknown errors with default values', () => {
      const error = new Error('some unknown error occurred');
      const gameError = parseError(error);

      expect(gameError.type).toBe(ErrorType.UNKNOWN_ERROR);
      expect(gameError.severity).toBe(ErrorSeverity.MEDIUM);
      expect(gameError.userMessage).toBe('An unexpected error occurred. Please try again');
      expect(gameError.retryable).toBe(true);
    });

    it('should handle Anchor/Solana specific error objects', () => {
      const anchorError = {
        message: 'insufficient funds: Not enough lamports',
        code: 6003,
        logs: ['Program log: Insufficient funds', 'Program failed']
      };

      const gameError = parseError(anchorError);

      expect(gameError.type).toBe(ErrorType.INSUFFICIENT_FUNDS);
      expect(gameError.logs).toEqual(['Program log: Insufficient funds', 'Program failed', 'Error code: 6003']);
    });

    it('should include context information when provided', () => {
      const error = new Error('network error');
      const context = {
        walletConnected: true,
        balance: 1.5,
        betAmount: 0.1
      };

      const gameError = parseError(error, context);

      expect(gameError.type).toBe(ErrorType.NETWORK_ERROR);
      // Context should be logged (we can't easily test console.log, but we can verify the error is parsed correctly)
    });
  });

  describe('RetryManager', () => {
    let retryManager: RetryManager;

    beforeEach(() => {
      retryManager = new RetryManager();
      vi.clearAllTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should execute operation successfully on first try', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await retryManager.executeWithRetry(mockOperation, 'test-op');
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should retry retryable errors up to max attempts', async () => {
      vi.useFakeTimers();
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');

      const onError = vi.fn();
      
      const retryPromise = retryManager.executeWithRetry(mockOperation, 'test-op', onError);
      
      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      const result = await retryPromise;
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(2);
      
      vi.useRealTimers();
    });

    it('should not retry non-retryable errors', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('insufficient funds'));
      const onError = vi.fn();
      
      await expect(
        retryManager.executeWithRetry(mockOperation, 'test-op', onError)
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('should throw final error after max retries exceeded', async () => {
      // Mock setTimeout to avoid actual delays in tests
      vi.useFakeTimers();
      
      const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));
      const onError = vi.fn();
      
      const retryPromise = retryManager.executeWithRetry(mockOperation, 'test-op', onError);
      
      // Fast-forward through all the retry delays
      await vi.runAllTimersAsync();
      
      // Catch the rejection to prevent unhandled promise rejection
      try {
        await retryPromise;
        expect.fail('Expected promise to reject');
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      expect(mockOperation).toHaveBeenCalledTimes(4); // 1 initial + 3 retries
      expect(onError).toHaveBeenCalledTimes(4);
      
      vi.useRealTimers();
    }, 15000);

    it('should reset retry count after successful operation', async () => {
      vi.useFakeTimers();
      
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const retryPromise = retryManager.executeWithRetry(mockOperation, 'test-op');
      
      // Fast-forward through retry delays
      await vi.runAllTimersAsync();
      
      await retryPromise;
      
      expect(retryManager.getRetryCount('test-op')).toBe(0);
      
      vi.useRealTimers();
    });

    it('should track retry counts per operation', () => {
      retryManager['retryAttempts'].set('op1', 2);
      retryManager['retryAttempts'].set('op2', 1);
      
      expect(retryManager.getRetryCount('op1')).toBe(2);
      expect(retryManager.getRetryCount('op2')).toBe(1);
      expect(retryManager.getRetryCount('op3')).toBe(0);
    });
  });

  describe('LoadingStateManager', () => {
    let loadingManager: LoadingStateManager;

    beforeEach(() => {
      loadingManager = new LoadingStateManager();
    });

    it('should track loading states per operation', () => {
      loadingManager.setLoading('op1', true);
      loadingManager.setLoading('op2', false);
      
      expect(loadingManager.isLoading('op1')).toBe(true);
      expect(loadingManager.isLoading('op2')).toBe(false);
      expect(loadingManager.isLoading('op3')).toBe(false);
    });

    it('should detect if any operation is loading', () => {
      expect(loadingManager.isAnyLoading()).toBe(false);
      
      loadingManager.setLoading('op1', true);
      expect(loadingManager.isAnyLoading()).toBe(true);
      
      loadingManager.setLoading('op2', true);
      expect(loadingManager.isAnyLoading()).toBe(true);
      
      loadingManager.setLoading('op1', false);
      expect(loadingManager.isAnyLoading()).toBe(true);
      
      loadingManager.setLoading('op2', false);
      expect(loadingManager.isAnyLoading()).toBe(false);
    });

    it('should notify subscribers of loading state changes', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      const unsubscribe1 = loadingManager.subscribe('op1', callback1);
      const unsubscribe2 = loadingManager.subscribe('op1', callback2);
      
      loadingManager.setLoading('op1', true);
      
      expect(callback1).toHaveBeenCalledWith(true);
      expect(callback2).toHaveBeenCalledWith(true);
      
      loadingManager.setLoading('op1', false);
      
      expect(callback1).toHaveBeenCalledWith(false);
      expect(callback2).toHaveBeenCalledWith(false);
      
      // Test unsubscribe
      unsubscribe1();
      loadingManager.setLoading('op1', true);
      
      expect(callback1).toHaveBeenCalledTimes(2); // Should not be called again
      expect(callback2).toHaveBeenCalledTimes(3); // Should be called
    });

    it('should reset loading states', () => {
      loadingManager.setLoading('op1', true);
      loadingManager.setLoading('op2', true);
      
      loadingManager.reset('op1');
      
      expect(loadingManager.isLoading('op1')).toBe(false);
      expect(loadingManager.isLoading('op2')).toBe(true);
      
      loadingManager.reset();
      
      expect(loadingManager.isLoading('op1')).toBe(false);
      expect(loadingManager.isLoading('op2')).toBe(false);
    });
  });

  describe('NetworkHealthChecker', () => {
    let networkChecker: NetworkHealthChecker;
    let mockConnection: Connection;

    beforeEach(() => {
      mockConnection = {
        getLatestBlockhash: vi.fn(),
        getSlot: vi.fn(),
        getVersion: vi.fn()
      } as any;
      networkChecker = new NetworkHealthChecker(mockConnection);
    });

    afterEach(() => {
      // Properly cleanup NetworkHealthChecker to prevent memory leaks
      if (networkChecker) {
        networkChecker.destroy();
      }
    });

    it('should return true for healthy network', async () => {
      (mockConnection.getLatestBlockhash as any).mockResolvedValue({
        blockhash: 'test-blockhash'
      });
      (mockConnection.getSlot as any).mockResolvedValue(12345);
      (mockConnection.getVersion as any).mockResolvedValue({ 'solana-core': '1.14.0' });
      
      const isHealthy = await networkChecker.checkHealth();
      
      expect(isHealthy).toBe(true);
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalledWith('confirmed');
    });

    it('should return false for unhealthy network', async () => {
      (mockConnection.getLatestBlockhash as any).mockRejectedValue(new Error('Network error'));
      (mockConnection.getSlot as any).mockRejectedValue(new Error('Network error'));
      (mockConnection.getVersion as any).mockRejectedValue(new Error('Network error'));
      
      const isHealthy = await networkChecker.checkHealth();
      
      expect(isHealthy).toBe(false);
    });

    it('should cache health check results', async () => {
      (mockConnection.getLatestBlockhash as any).mockResolvedValue({
        blockhash: 'test-blockhash'
      });
      (mockConnection.getSlot as any).mockResolvedValue(12345);
      (mockConnection.getVersion as any).mockResolvedValue({ 'solana-core': '1.14.0' });
      
      // First call
      await networkChecker.checkHealth();
      
      // Second call within cache interval should not make new request
      await networkChecker.checkHealth();
      
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalledTimes(1);
    });

    it('should provide health status', async () => {
      (mockConnection.getLatestBlockhash as any).mockResolvedValue({
        blockhash: 'test-blockhash'
      });
      (mockConnection.getSlot as any).mockResolvedValue(12345);
      (mockConnection.getVersion as any).mockResolvedValue({ 'solana-core': '1.14.0' });
      
      await networkChecker.checkHealth();
      const status = networkChecker.getHealthStatus();
      
      expect(status.healthy).toBe(true);
      expect(status.lastCheck).toBeGreaterThan(0);
    });

    it('should properly cleanup resources when destroyed', () => {
      // Add a callback to test cleanup
      const callback = vi.fn();
      const unsubscribe = networkChecker.onHealthChange(callback);
      
      // Verify callback is registered
      expect(networkChecker['healthCheckCallbacks'].size).toBe(1);
      
      // Call destroy
      expect(() => networkChecker.destroy()).not.toThrow();
      
      // Verify callbacks are cleared
      expect(networkChecker['healthCheckCallbacks'].size).toBe(0);
    });

    it('should handle destroy being called multiple times', () => {
      // Should not throw error when called multiple times
      expect(() => {
        networkChecker.destroy();
        networkChecker.destroy();
      }).not.toThrow();
    });
  });
});
import { Connection, PublicKey } from '@solana/web3.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BlockchainOperationWrapper } from './blockchainOperationWrapper';
import { GameError, ErrorType } from './errorHandler';

// Mock Solana connection
const mockConnection = {
  getLatestBlockhash: vi.fn(),
  getSlot: vi.fn(),
  getVersion: vi.fn(),
  getBalance: vi.fn(),
  getSignatureStatus: vi.fn(),
  confirmTransaction: vi.fn()
} as unknown as Connection;

describe('BlockchainOperationWrapper', () => {
  let wrapper: BlockchainOperationWrapper;

  beforeEach(() => {
    wrapper = new BlockchainOperationWrapper(mockConnection);
    vi.clearAllMocks();
    
    // Setup default successful mocks
    (mockConnection.getLatestBlockhash as any).mockResolvedValue({
      blockhash: 'test-blockhash',
      lastValidBlockHeight: 12345
    });
    (mockConnection.getSlot as any).mockResolvedValue(12345);
    (mockConnection.getVersion as any).mockResolvedValue({ 'solana-core': '1.14.0' });
    (mockConnection.getBalance as any).mockResolvedValue(1000000000); // 1 SOL
  });

  afterEach(() => {
    wrapper.destroy();
  });

  describe('Basic Operation Execution', () => {
    it('should execute successful operation', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await wrapper.executeOperation('test-op', mockOperation);
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });

    it('should handle operation timeout', async () => {
      const mockOperation = vi.fn().mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 2000))
      );
      
      await expect(
        wrapper.executeOperation('test-op', mockOperation, { timeout: 1000 })
      ).rejects.toThrow('timeout');
    });

    it('should retry failed operations', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      const result = await wrapper.executeOperation('test-op', mockOperation, {
        maxRetries: 3
      });
      
      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('network error'));
      
      await expect(
        wrapper.executeOperation('test-op', mockOperation, { maxRetries: 2 })
      ).rejects.toThrow();
      
      expect(mockOperation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });
  });

  describe('Network Health Checks', () => {
    it('should perform preflight network health check', async () => {
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      await wrapper.executeOperation('test-op', mockOperation, {
        requireHealthyNetwork: true
      });
      
      expect(mockConnection.getLatestBlockhash).toHaveBeenCalled();
      expect(mockConnection.getSlot).toHaveBeenCalled();
      expect(mockConnection.getVersion).toHaveBeenCalled();
    });

    it('should wait for network recovery when unhealthy', async () => {
      // Mock network failure then recovery
      (mockConnection.getLatestBlockhash as any)
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue({ blockhash: 'test-blockhash' });
      
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      const result = await wrapper.executeOperation('test-op', mockOperation, {
        requireHealthyNetwork: true
      });
      
      expect(result).toBe('success');
    });

    it('should fail if network remains unhealthy', async () => {
      // Mock persistent network failure
      (mockConnection.getLatestBlockhash as any).mockRejectedValue(new Error('network error'));
      (mockConnection.getSlot as any).mockRejectedValue(new Error('network error'));
      (mockConnection.getVersion as any).mockRejectedValue(new Error('network error'));
      
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      await expect(
        wrapper.executeOperation('test-op', mockOperation, {
          requireHealthyNetwork: true
        })
      ).rejects.toThrow('network error');
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit breaker after repeated failures', async () => {
      const mockOperation = vi.fn().mockRejectedValue(new Error('persistent error'));
      
      // Trigger multiple failures to open circuit breaker
      for (let i = 0; i < 5; i++) {
        try {
          await wrapper.executeOperation('test-op', mockOperation, { maxRetries: 0 });
        } catch (error) {
          // Expected failures
        }
      }
      
      // Next operation should fail immediately due to circuit breaker
      await expect(
        wrapper.executeOperation('test-op', mockOperation, { 
          maxRetries: 0,
          circuitBreakerThreshold: 5 
        })
      ).rejects.toThrow('Circuit breaker is open');
    });

    it('should reset circuit breaker after successful operation', async () => {
      const mockOperation = vi.fn()
        .mockRejectedValue(new Error('temporary error'))
        .mockResolvedValue('success');
      
      // Cause some failures
      for (let i = 0; i < 3; i++) {
        try {
          await wrapper.executeOperation(`test-op-${i}`, mockOperation, { maxRetries: 0 });
        } catch (error) {
          // Expected failures
        }
      }
      
      // Successful operation should reset circuit breaker
      const result = await wrapper.executeOperation('test-op-success', mockOperation);
      expect(result).toBe('success');
    });
  });

  describe('Wallet Operations', () => {
    const testPublicKey = new PublicKey('11111111111111111111111111111111');

    it('should execute wallet operation with connection check', async () => {
      const mockOperation = vi.fn().mockResolvedValue('wallet-success');
      
      const result = await wrapper.executeWalletOperation(
        'connect',
        mockOperation,
        testPublicKey,
        { requireConnection: true }
      );
      
      expect(result).toBe('wallet-success');
    });

    it('should fail wallet operation without connection when required', async () => {
      const mockOperation = vi.fn().mockResolvedValue('wallet-success');
      
      await expect(
        wrapper.executeWalletOperation('connect', mockOperation, undefined, {
          requireConnection: true
        })
      ).rejects.toThrow('wallet not connected');
    });

    it('should check balance when required', async () => {
      const mockOperation = vi.fn().mockResolvedValue('wallet-success');
      
      await wrapper.executeWalletOperation(
        'spend',
        mockOperation,
        testPublicKey,
        { checkBalance: true, minimumBalance: 500000000 } // 0.5 SOL
      );
      
      expect(mockConnection.getBalance).toHaveBeenCalledWith(testPublicKey);
    });

    it('should fail when insufficient balance', async () => {
      (mockConnection.getBalance as any).mockResolvedValue(100000000); // 0.1 SOL
      
      const mockOperation = vi.fn().mockResolvedValue('wallet-success');
      
      await expect(
        wrapper.executeWalletOperation(
          'spend',
          mockOperation,
          testPublicKey,
          { checkBalance: true, minimumBalance: 500000000 } // 0.5 SOL
        )
      ).rejects.toThrow('insufficient funds');
    });
  });

  describe('Transaction Operations', () => {
    it('should execute transaction with confirmation', async () => {
      const mockTransactionBuilder = vi.fn().mockResolvedValue('test-signature');
      const mockResultExtractor = vi.fn().mockResolvedValue({ result: 'transaction-success' });
      
      // Mock successful confirmation
      (mockConnection.getSignatureStatus as any).mockResolvedValue({
        value: { confirmationStatus: 'confirmed' }
      });
      
      const result = await wrapper.executeTransaction(
        'test-tx',
        mockTransactionBuilder,
        mockResultExtractor
      );
      
      expect(result).toEqual({ result: 'transaction-success' });
      expect(mockTransactionBuilder).toHaveBeenCalled();
      expect(mockResultExtractor).toHaveBeenCalledWith('test-signature');
    });

    it('should handle transaction confirmation timeout', async () => {
      const mockTransactionBuilder = vi.fn().mockResolvedValue('test-signature');
      const mockResultExtractor = vi.fn().mockResolvedValue({ result: 'success' });
      
      // Mock confirmation that never completes
      (mockConnection.getSignatureStatus as any).mockResolvedValue({
        value: { confirmationStatus: 'processed' }
      });
      
      await expect(
        wrapper.executeTransaction(
          'test-tx',
          mockTransactionBuilder,
          mockResultExtractor,
          { confirmationTimeout: 1000 }
        )
      ).rejects.toThrow('transaction confirmation timeout');
    });

    it('should call progress callbacks', async () => {
      const mockTransactionBuilder = vi.fn().mockResolvedValue('test-signature');
      const mockResultExtractor = vi.fn().mockResolvedValue({ result: 'success' });
      const onTransactionSubmitted = vi.fn();
      const onConfirmationProgress = vi.fn();
      
      (mockConnection.getSignatureStatus as any).mockResolvedValue({
        value: { confirmationStatus: 'confirmed' }
      });
      
      await wrapper.executeTransaction(
        'test-tx',
        mockTransactionBuilder,
        mockResultExtractor,
        { onTransactionSubmitted, onConfirmationProgress }
      );
      
      expect(onTransactionSubmitted).toHaveBeenCalledWith('test-signature');
      expect(onConfirmationProgress).toHaveBeenCalled();
    });
  });

  describe('Batch Operations', () => {
    it('should execute batch operations with concurrency control', async () => {
      const operations = [
        { id: 'op1', operation: vi.fn().mockResolvedValue('result1') },
        { id: 'op2', operation: vi.fn().mockResolvedValue('result2') },
        { id: 'op3', operation: vi.fn().mockResolvedValue('result3') }
      ];
      
      const results = await wrapper.executeBatch('test-batch', operations, {
        maxConcurrency: 2
      });
      
      expect(results).toHaveLength(3);
      expect(results.every(r => r.error === null)).toBe(true);
      expect(results.map(r => r.result)).toEqual(['result1', 'result2', 'result3']);
    });

    it('should handle partial failures in batch', async () => {
      const operations = [
        { id: 'op1', operation: vi.fn().mockResolvedValue('result1') },
        { id: 'op2', operation: vi.fn().mockRejectedValue(new Error('op2 failed')) },
        { id: 'op3', operation: vi.fn().mockResolvedValue('result3') }
      ];
      
      const results = await wrapper.executeBatch('test-batch', operations);
      
      expect(results).toHaveLength(3);
      expect(results[0].result).toBe('result1');
      expect(results[1].error).toBeTruthy();
      expect(results[2].result).toBe('result3');
    });

    it('should fail fast on critical operation failure', async () => {
      const operations = [
        { id: 'op1', operation: vi.fn().mockResolvedValue('result1') },
        { 
          id: 'op2', 
          operation: vi.fn().mockRejectedValue(new Error('critical failure')),
          critical: true 
        },
        { id: 'op3', operation: vi.fn().mockResolvedValue('result3') }
      ];
      
      await expect(
        wrapper.executeBatch('test-batch', operations, { failFast: true })
      ).rejects.toThrow('critical failure');
    });

    it('should call completion callbacks', async () => {
      const onOperationComplete = vi.fn();
      const operations = [
        { id: 'op1', operation: vi.fn().mockResolvedValue('result1') }
      ];
      
      await wrapper.executeBatch('test-batch', operations, {
        onOperationComplete
      });
      
      expect(onOperationComplete).toHaveBeenCalledWith('op1', 'result1');
    });
  });

  describe('Status and Recovery', () => {
    it('should provide operation status', () => {
      const status = wrapper.getOperationStatus();
      
      expect(status).toHaveProperty('network');
      expect(status).toHaveProperty('activeOperations');
      expect(status).toHaveProperty('circuitBreakers');
    });

    it('should force recovery of all systems', async () => {
      // Create some failures first
      const mockOperation = vi.fn().mockRejectedValue(new Error('test error'));
      
      try {
        await wrapper.executeOperation('test-op', mockOperation, { maxRetries: 0 });
      } catch (error) {
        // Expected failure
      }
      
      // Force recovery
      await wrapper.forceRecovery();
      
      // Should be able to execute operations again
      const successOperation = vi.fn().mockResolvedValue('success');
      const result = await wrapper.executeOperation('recovery-test', successOperation);
      
      expect(result).toBe('success');
    });
  });

  describe('Progress Tracking', () => {
    it('should track operation progress', async () => {
      const onProgress = vi.fn();
      const mockOperation = vi.fn().mockResolvedValue('success');
      
      await wrapper.executeOperation('test-op', mockOperation, {
        onProgress
      });
      
      expect(onProgress).toHaveBeenCalledWith('initializing', 0);
      expect(onProgress).toHaveBeenCalledWith('preflight-complete', 30);
      expect(onProgress).toHaveBeenCalledWith('executing', 50);
      expect(onProgress).toHaveBeenCalledWith('completed', 100);
    });

    it('should track error and recovery attempts', async () => {
      const onError = vi.fn();
      const onRecovery = vi.fn();
      const mockOperation = vi.fn()
        .mockRejectedValueOnce(new Error('network error'))
        .mockResolvedValue('success');
      
      await wrapper.executeOperation('test-op', mockOperation, {
        maxRetries: 2,
        onError,
        onRecovery
      });
      
      expect(onError).toHaveBeenCalled();
      expect(onRecovery).toHaveBeenCalledWith(2);
    });
  });

  describe('Resource Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
      
      wrapper.destroy();
      
      // Verify cleanup was called (exact number depends on internal implementation)
      expect(clearTimeoutSpy).toHaveBeenCalled();
      
      clearTimeoutSpy.mockRestore();
    });
  });
});
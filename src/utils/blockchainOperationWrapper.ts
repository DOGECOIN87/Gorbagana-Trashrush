import { Connection, PublicKey } from '@solana/web3.js';
import { 
  GameError, 
  ErrorType, 
  ErrorSeverity, 
  RetryManager, 
  NetworkHealthChecker, 
  LoadingStateManager,
  parseError 
} from './errorHandler';

/**
 * Comprehensive blockchain operation wrapper with error boundaries and recovery
 */
export class BlockchainOperationWrapper {
  private retryManager: RetryManager;
  private networkChecker: NetworkHealthChecker;
  private loadingManager: LoadingStateManager;
  private connection: Connection;
  private operationTimeouts = new Map<string, NodeJS.Timeout>();
  private circuitBreakers = new Map<string, { isOpen: boolean; lastFailure: number; failureCount: number }>();

  constructor(connection: Connection) {
    this.connection = connection;
    this.retryManager = new RetryManager();
    this.networkChecker = new NetworkHealthChecker(connection);
    this.loadingManager = new LoadingStateManager();

    // Set up network health monitoring
    this.networkChecker.onHealthChange((healthy) => {
      if (healthy) {
        console.log('🌐 Network recovered - resetting circuit breakers');
        this.resetAllCircuitBreakers();
      } else {
        console.warn('🌐 Network unhealthy - operations may be affected');
      }
    });
  }

  /**
   * Execute a blockchain operation with comprehensive error handling and recovery
   */
  async executeOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    options?: {
      timeout?: number;
      maxRetries?: number;
      requireHealthyNetwork?: boolean;
      circuitBreakerThreshold?: number;
      onProgress?: (stage: string, progress: number) => void;
      onError?: (error: GameError, attempt: number) => void;
      onRecovery?: (attempt: number) => void;
    }
  ): Promise<T> {
    const {
      timeout = 30000,
      maxRetries = 3,
      requireHealthyNetwork = true,
      circuitBreakerThreshold = 5,
      onProgress,
      onError,
      onRecovery
    } = options || {};

    // Check circuit breaker
    if (this.isCircuitBreakerOpen(operationId, circuitBreakerThreshold)) {
      throw parseError(new Error('Circuit breaker is open - too many recent failures'));
    }

    // Set loading state
    this.loadingManager.setLoading(operationId, true);
    onProgress?.('initializing', 0);

    try {
      // Pre-flight checks
      await this.performPreflightChecks(requireHealthyNetwork, onProgress);

      // Execute with timeout and retry
      const result = await this.executeWithTimeoutAndRetry(
        operationId,
        operation,
        timeout,
        maxRetries,
        onProgress,
        onError,
        onRecovery
      );

      // Success - reset circuit breaker
      this.resetCircuitBreaker(operationId);
      onProgress?.('completed', 100);

      return result;

    } catch (error) {
      // Record failure for circuit breaker
      this.recordCircuitBreakerFailure(operationId);
      
      // Enhanced error logging
      this.logOperationFailure(operationId, error, {
        timeout,
        maxRetries,
        networkHealth: this.networkChecker.getHealthStatus(),
        circuitBreakerStatus: this.getCircuitBreakerStatus(operationId)
      });

      throw error;
    } finally {
      // Clear loading state and cleanup
      this.loadingManager.setLoading(operationId, false);
      this.clearOperationTimeout(operationId);
    }
  }

  /**
   * Execute wallet connection with enhanced error handling
   */
  async executeWalletOperation<T>(
    operationId: string,
    operation: () => Promise<T>,
    walletPublicKey?: PublicKey,
    options?: {
      requireConnection?: boolean;
      checkBalance?: boolean;
      minimumBalance?: number;
    }
  ): Promise<T> {
    const { requireConnection = true, checkBalance = false, minimumBalance = 0 } = options || {};

    return this.executeOperation(
      `wallet-${operationId}`,
      async () => {
        // Wallet-specific pre-checks
        if (requireConnection && !walletPublicKey) {
          throw new Error('wallet not connected');
        }

        if (checkBalance && walletPublicKey) {
          const balance = await this.connection.getBalance(walletPublicKey);
          if (balance < minimumBalance) {
            throw new Error('insufficient funds');
          }
        }

        return await operation();
      },
      {
        maxRetries: 2, // Fewer retries for wallet operations
        requireHealthyNetwork: true,
        onError: (error, attempt) => {
          console.warn(`🔗 Wallet operation ${operationId} failed (attempt ${attempt}):`, error.userMessage);
        }
      }
    );
  }

  /**
   * Execute transaction with enhanced monitoring and recovery
   */
  async executeTransaction<T>(
    operationId: string,
    transactionBuilder: () => Promise<string>, // Returns transaction signature
    resultExtractor: (signature: string) => Promise<T>,
    options?: {
      confirmationTimeout?: number;
      maxConfirmationRetries?: number;
      onTransactionSubmitted?: (signature: string) => void;
      onConfirmationProgress?: (confirmations: number, required: number) => void;
    }
  ): Promise<T> {
    const {
      confirmationTimeout = 60000,
      maxConfirmationRetries = 3,
      onTransactionSubmitted,
      onConfirmationProgress
    } = options || {};

    return this.executeOperation(
      `transaction-${operationId}`,
      async () => {
        // Step 1: Build and submit transaction
        const signature = await transactionBuilder();
        onTransactionSubmitted?.(signature);
        console.log(`📝 Transaction submitted: ${signature}`);

        // Step 2: Wait for confirmation with progress tracking
        await this.waitForTransactionConfirmation(
          signature,
          confirmationTimeout,
          maxConfirmationRetries,
          onConfirmationProgress
        );

        // Step 3: Extract results
        const result = await resultExtractor(signature);
        console.log(`✅ Transaction completed successfully: ${signature}`);

        return result;
      },
      {
        timeout: confirmationTimeout + 10000, // Extra buffer for processing
        maxRetries: 2,
        requireHealthyNetwork: true,
        onProgress: (stage, progress) => {
          console.log(`🔄 Transaction ${operationId} - ${stage}: ${progress}%`);
        }
      }
    );
  }

  /**
   * Batch execute multiple operations with coordinated error handling
   */
  async executeBatch<T>(
    batchId: string,
    operations: Array<{
      id: string;
      operation: () => Promise<T>;
      critical?: boolean; // If true, batch fails if this operation fails
    }>,
    options?: {
      maxConcurrency?: number;
      failFast?: boolean;
      onOperationComplete?: (id: string, result: T | Error) => void;
    }
  ): Promise<Array<{ id: string; result: T | null; error: GameError | null }>> {
    const { maxConcurrency = 3, failFast = false, onOperationComplete } = options || {};

    this.loadingManager.setLoading(`batch-${batchId}`, true);

    try {
      const results: Array<{ id: string; result: T | null; error: GameError | null }> = [];
      const semaphore = new Semaphore(maxConcurrency);

      const executeOperation = async (op: typeof operations[0]) => {
        await semaphore.acquire();
        try {
          const result = await this.executeOperation(
            `batch-${batchId}-${op.id}`,
            op.operation,
            { maxRetries: 1 } // Reduced retries for batch operations
          );
          
          const opResult = { id: op.id, result, error: null };
          results.push(opResult);
          onOperationComplete?.(op.id, result);
          
          return opResult;
        } catch (error) {
          const gameError = error instanceof Error ? parseError(error) : error as GameError;
          const opResult = { id: op.id, result: null, error: gameError };
          results.push(opResult);
          onOperationComplete?.(op.id, gameError);
          
          // Fail fast if this is a critical operation
          if (op.critical && failFast) {
            throw gameError;
          }
          
          return opResult;
        } finally {
          semaphore.release();
        }
      };

      // Execute all operations
      await Promise.all(operations.map(executeOperation));

      // Check for critical failures
      const criticalFailures = results.filter(r => 
        r.error && operations.find(op => op.id === r.id)?.critical
      );

      if (criticalFailures.length > 0) {
        throw criticalFailures[0].error;
      }

      return results;

    } finally {
      this.loadingManager.setLoading(`batch-${batchId}`, false);
    }
  }

  /**
   * Get comprehensive operation status and health metrics
   */
  getOperationStatus() {
    const networkStatus = this.networkChecker.getHealthStatus();
    const loadingOperations = Array.from(this.loadingManager['loadingStates'].entries())
      .filter(([_, loading]) => loading)
      .map(([id]) => id);

    const circuitBreakerStatus = Array.from(this.circuitBreakers.entries())
      .map(([id, status]) => ({ id, ...status }));

    return {
      network: networkStatus,
      activeOperations: loadingOperations,
      circuitBreakers: circuitBreakerStatus,
      retryStats: {
        // Add retry statistics if needed
      }
    };
  }

  /**
   * Force recovery of all systems
   */
  async forceRecovery(): Promise<void> {
    console.log('🔧 Forcing system recovery...');
    
    // Reset all circuit breakers
    this.resetAllCircuitBreakers();
    
    // Clear all retry attempts
    this.retryManager.resetRetries();
    
    // Clear loading states
    this.loadingManager.reset();
    
    // Force network health check
    await this.networkChecker.checkHealth(true);
    
    console.log('✅ System recovery completed');
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.networkChecker.destroy();
    this.loadingManager.reset();
    this.operationTimeouts.forEach(timeout => clearTimeout(timeout));
    this.operationTimeouts.clear();
    this.circuitBreakers.clear();
  }

  // Private helper methods

  private async performPreflightChecks(
    requireHealthyNetwork: boolean,
    onProgress?: (stage: string, progress: number) => void
  ) {
    onProgress?.('preflight-checks', 10);

    if (requireHealthyNetwork) {
      const isHealthy = await this.networkChecker.checkHealth();
      if (!isHealthy) {
        // Try to wait for network recovery
        onProgress?.('waiting-for-network', 20);
        const recovered = await this.networkChecker.waitForHealthy(10000);
        if (!recovered) {
          throw new Error('network error');
        }
      }
    }

    onProgress?.('preflight-complete', 30);
  }

  private async executeWithTimeoutAndRetry<T>(
    operationId: string,
    operation: () => Promise<T>,
    timeout: number,
    maxRetries: number,
    onProgress?: (stage: string, progress: number) => void,
    onError?: (error: GameError, attempt: number) => void,
    onRecovery?: (attempt: number) => void
  ): Promise<T> {
    return this.retryManager.executeWithRetry(
      async () => {
        onProgress?.('executing', 50);
        
        // Set operation timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('timeout'));
          }, timeout);
          this.operationTimeouts.set(operationId, timeoutId);
        });

        try {
          const result = await Promise.race([operation(), timeoutPromise]);
          onProgress?.('processing', 80);
          return result;
        } finally {
          this.clearOperationTimeout(operationId);
        }
      },
      operationId,
      (error, attempt) => {
        onError?.(error, attempt);
        if (attempt > 1) {
          onRecovery?.(attempt);
        }
      },
      { maxRetries }
    );
  }

  private async waitForTransactionConfirmation(
    signature: string,
    timeout: number,
    maxRetries: number,
    onProgress?: (confirmations: number, required: number) => void
  ) {
    const requiredConfirmations = 1;
    let confirmations = 0;

    const checkConfirmation = async () => {
      const status = await this.connection.getSignatureStatus(signature);
      if (status.value?.confirmationStatus === 'confirmed' || status.value?.confirmationStatus === 'finalized') {
        confirmations = 1;
        onProgress?.(confirmations, requiredConfirmations);
        return true;
      }
      return false;
    };

    // Wait for confirmation with timeout
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (await checkConfirmation()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('transaction confirmation timeout');
  }

  private clearOperationTimeout(operationId: string) {
    const timeoutId = this.operationTimeouts.get(operationId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      this.operationTimeouts.delete(operationId);
    }
  }

  private isCircuitBreakerOpen(operationId: string, threshold: number): boolean {
    const breaker = this.circuitBreakers.get(operationId);
    if (!breaker) return false;

    // Circuit breaker is open if failure count exceeds threshold and last failure was recent
    const isOpen = breaker.failureCount >= threshold && 
                   (Date.now() - breaker.lastFailure) < 60000; // 1 minute cooldown

    return isOpen;
  }

  private recordCircuitBreakerFailure(operationId: string) {
    const breaker = this.circuitBreakers.get(operationId) || { 
      isOpen: false, 
      lastFailure: 0, 
      failureCount: 0 
    };
    
    breaker.failureCount++;
    breaker.lastFailure = Date.now();
    breaker.isOpen = breaker.failureCount >= 5; // Default threshold
    
    this.circuitBreakers.set(operationId, breaker);
  }

  private resetCircuitBreaker(operationId: string) {
    this.circuitBreakers.delete(operationId);
  }

  private resetAllCircuitBreakers() {
    this.circuitBreakers.clear();
  }

  private getCircuitBreakerStatus(operationId: string) {
    return this.circuitBreakers.get(operationId) || { 
      isOpen: false, 
      lastFailure: 0, 
      failureCount: 0 
    };
  }

  private logOperationFailure(operationId: string, error: unknown, context: any) {
    console.group(`🚨 Blockchain Operation Failed: ${operationId}`);
    console.error('Error:', error);
    console.error('Context:', context);
    console.error('Timestamp:', new Date().toISOString());
    console.groupEnd();
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waitQueue: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waitQueue.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    const next = this.waitQueue.shift();
    if (next) {
      this.permits--;
      next();
    }
  }
}
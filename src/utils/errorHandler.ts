import { Connection } from '@solana/web3.js';

// Error types for categorization
export enum ErrorType {
  WALLET_ERROR = 'WALLET_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  SMART_CONTRACT_ERROR = 'SMART_CONTRACT_ERROR',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  USER_REJECTED = 'USER_REJECTED',
  INITIALIZATION_ERROR = 'INITIALIZATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Error severity levels
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

// Structured error interface
export interface GameError {
  type: ErrorType;
  severity: ErrorSeverity;
  userMessage: string;
  technicalMessage: string;
  code?: string;
  retryable: boolean;
  retryDelay?: number;
  logs?: string[];
  timestamp: number;
}

// Error logging interface
export interface ErrorLog {
  error: GameError;
  context: {
    userAgent: string;
    url: string;
    walletConnected: boolean;
    balance?: number;
    betAmount?: number;
    txSignature?: string;
  };
}

// User-friendly error messages mapping
const ERROR_MESSAGES: Record<string, { userMessage: string; type: ErrorType; severity: ErrorSeverity; retryable: boolean }> = {
  // Wallet errors
  'wallet not connected': {
    userMessage: 'Please connect your wallet to continue playing',
    type: ErrorType.WALLET_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'user rejected': {
    userMessage: 'Transaction was cancelled. Click spin again when ready to play',
    type: ErrorType.USER_REJECTED,
    severity: ErrorSeverity.LOW,
    retryable: true
  },
  'wallet disconnected': {
    userMessage: 'Your wallet was disconnected. Please reconnect to continue',
    type: ErrorType.WALLET_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },

  // Network errors
  'network error': {
    userMessage: 'Connection issue detected. Please check your internet and try again',
    type: ErrorType.NETWORK_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: true
  },
  'rpc error': {
    userMessage: 'Network is busy. Please wait a moment and try again',
    type: ErrorType.NETWORK_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: true
  },
  'timeout': {
    userMessage: 'Request timed out. The network may be slow, please try again',
    type: ErrorType.NETWORK_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: true
  },
  'failed to fetch': {
    userMessage: 'Unable to connect to the game network. Please check your connection',
    type: ErrorType.NETWORK_ERROR,
    severity: ErrorSeverity.HIGH,
    retryable: true
  },

  // Transaction errors
  'insufficient funds': {
    userMessage: 'Not enough SOL in your wallet for this bet. Please add funds or reduce bet amount',
    type: ErrorType.INSUFFICIENT_FUNDS,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'transaction failed': {
    userMessage: 'Transaction failed to process. Please try again',
    type: ErrorType.TRANSACTION_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: true
  },
  'blockhash not found': {
    userMessage: 'Network is congested. Please wait a moment and try again',
    type: ErrorType.NETWORK_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: true
  },

  // Smart contract errors
  'invalid bet amount': {
    userMessage: 'Bet amount is invalid. Please check the minimum and maximum limits',
    type: ErrorType.SMART_CONTRACT_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'bet too high': {
    userMessage: 'Bet amount exceeds maximum allowed. Please reduce your bet',
    type: ErrorType.SMART_CONTRACT_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'insufficient pool': {
    userMessage: 'Game pool has insufficient funds for this bet. Please try a smaller amount',
    type: ErrorType.SMART_CONTRACT_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'game paused': {
    userMessage: 'Game is temporarily paused for maintenance. Please try again later',
    type: ErrorType.SMART_CONTRACT_ERROR,
    severity: ErrorSeverity.HIGH,
    retryable: true
  },
  'unauthorized': {
    userMessage: 'Access denied. Please reconnect your wallet and try again',
    type: ErrorType.SMART_CONTRACT_ERROR,
    severity: ErrorSeverity.HIGH,
    retryable: false
  },

  // Initialization errors
  'not initialized': {
    userMessage: 'Game needs to be set up. Click "Initialize Game" to get started',
    type: ErrorType.INITIALIZATION_ERROR,
    severity: ErrorSeverity.MEDIUM,
    retryable: false
  },
  'initialization failed': {
    userMessage: 'Failed to set up game. Please try again or contact support',
    type: ErrorType.INITIALIZATION_ERROR,
    severity: ErrorSeverity.HIGH,
    retryable: true
  }
};

/**
 * Parse and categorize errors into user-friendly format
 */
export function parseError(error: unknown, context?: Partial<ErrorLog['context']>): GameError {
  const timestamp = Date.now();
  let errorMessage = '';
  let logs: string[] = [];

  // Extract error message and logs
  if (error instanceof Error) {
    errorMessage = error.message.toLowerCase();
    logs.push(error.stack || error.message);
  } else if (typeof error === 'string') {
    errorMessage = error.toLowerCase();
  } else if (error && typeof error === 'object') {
    // Handle Anchor/Solana specific errors
    const errorObj = error as any;
    if (errorObj.message) {
      errorMessage = errorObj.message.toLowerCase();
    }
    if (errorObj.logs) {
      logs = Array.isArray(errorObj.logs) ? errorObj.logs : [errorObj.logs];
    }
    if (errorObj.code) {
      logs.push(`Error code: ${errorObj.code}`);
    }
  }

  // Find matching error pattern
  let matchedError = null;
  for (const [pattern, errorInfo] of Object.entries(ERROR_MESSAGES)) {
    if (errorMessage.includes(pattern)) {
      matchedError = errorInfo;
      break;
    }
  }

  // Default to unknown error if no match found
  if (!matchedError) {
    matchedError = {
      userMessage: 'An unexpected error occurred. Please try again',
      type: ErrorType.UNKNOWN_ERROR,
      severity: ErrorSeverity.MEDIUM,
      retryable: true
    };
  }

  const gameError: GameError = {
    type: matchedError.type,
    severity: matchedError.severity,
    userMessage: matchedError.userMessage,
    technicalMessage: errorMessage,
    retryable: matchedError.retryable,
    retryDelay: matchedError.retryable ? getRetryDelay(matchedError.type) : undefined,
    logs,
    timestamp
  };

  // Log error for debugging
  logError(gameError, context);

  return gameError;
}

/**
 * Get appropriate retry delay based on error type
 */
function getRetryDelay(errorType: ErrorType): number {
  switch (errorType) {
    case ErrorType.NETWORK_ERROR:
      return 2000; // 2 seconds for network errors
    case ErrorType.TRANSACTION_ERROR:
      return 3000; // 3 seconds for transaction errors
    case ErrorType.SMART_CONTRACT_ERROR:
      return 5000; // 5 seconds for contract errors
    default:
      return 1000; // 1 second default
  }
}

/**
 * Log error for debugging and monitoring
 */
function logError(error: GameError, context?: Partial<ErrorLog['context']>) {
  const errorLog: ErrorLog = {
    error,
    context: {
      userAgent: navigator.userAgent,
      url: window.location.href,
      walletConnected: false,
      ...context
    }
  };

  // Console logging with structured format
  console.group(`🚨 Game Error [${error.severity}]`);
  console.error('User Message:', error.userMessage);
  console.error('Technical Message:', error.technicalMessage);
  console.error('Type:', error.type);
  console.error('Retryable:', error.retryable);
  if (error.retryDelay) {
    console.error('Retry Delay:', error.retryDelay + 'ms');
  }
  if (error.logs && error.logs.length > 0) {
    console.error('Logs:', error.logs);
  }
  console.error('Context:', errorLog.context);
  console.error('Timestamp:', new Date(error.timestamp).toISOString());
  console.groupEnd();

  // In production, you might want to send this to an error tracking service
  // Example: sendToErrorTracking(errorLog);
}

/**
 * Enhanced retry mechanism for recoverable errors with exponential backoff
 */
export class RetryManager {
  private retryAttempts = new Map<string, number>();
  private retryHistory = new Map<string, Array<{ timestamp: number; error: string; success: boolean }>>();
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second base delay
  private maxDelay = 30000; // 30 seconds max delay
  private backoffMultiplier = 2;

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    onError?: (error: GameError, attempt: number) => void,
    options?: {
      maxRetries?: number;
      baseDelay?: number;
      exponentialBackoff?: boolean;
      jitter?: boolean;
    }
  ): Promise<T> {
    const maxRetries = options?.maxRetries || this.maxRetries;
    const baseDelay = options?.baseDelay || this.baseDelay;
    const useExponentialBackoff = options?.exponentialBackoff !== false;
    const useJitter = options?.jitter !== false;
    
    const attempts = this.retryAttempts.get(operationId) || 0;

    try {
      const result = await operation();
      
      // Record successful attempt
      this.recordAttempt(operationId, null, true);
      
      // Reset retry count on success
      this.retryAttempts.delete(operationId);
      return result;
    } catch (error) {
      const gameError = parseError(error);
      
      // Record failed attempt
      this.recordAttempt(operationId, gameError.technicalMessage, false);
      
      if (onError) {
        onError(gameError, attempts + 1);
      }

      // Check if we should retry
      if (gameError.retryable && attempts < maxRetries) {
        this.retryAttempts.set(operationId, attempts + 1);
        
        // Calculate delay with exponential backoff and jitter
        let delay = baseDelay;
        if (useExponentialBackoff) {
          delay = Math.min(baseDelay * Math.pow(this.backoffMultiplier, attempts), this.maxDelay);
        }
        
        // Add jitter to prevent thundering herd
        if (useJitter) {
          delay = delay + (Math.random() * delay * 0.1); // Add up to 10% jitter
        }
        
        console.log(`🔄 Retrying operation ${operationId} (attempt ${attempts + 1}/${maxRetries}) in ${Math.round(delay)}ms`);
        console.log(`📊 Retry history for ${operationId}:`, this.getRetryHistory(operationId));
        
        // Wait for calculated delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Recursive retry
        return this.executeWithRetry(operation, operationId, onError, options);
      } else {
        // Max retries reached or not retryable
        this.retryAttempts.delete(operationId);
        console.error(`❌ Operation ${operationId} failed after ${attempts + 1} attempts`);
        throw gameError;
      }
    }
  }

  private recordAttempt(operationId: string, error: string | null, success: boolean) {
    if (!this.retryHistory.has(operationId)) {
      this.retryHistory.set(operationId, []);
    }
    
    const history = this.retryHistory.get(operationId)!;
    history.push({
      timestamp: Date.now(),
      error: error || 'Success',
      success
    });
    
    // Keep only last 10 attempts
    if (history.length > 10) {
      history.shift();
    }
  }

  resetRetries(operationId?: string) {
    if (operationId) {
      this.retryAttempts.delete(operationId);
      this.retryHistory.delete(operationId);
    } else {
      this.retryAttempts.clear();
      this.retryHistory.clear();
    }
  }

  getRetryCount(operationId: string): number {
    return this.retryAttempts.get(operationId) || 0;
  }

  getRetryHistory(operationId: string): Array<{ timestamp: number; error: string; success: boolean }> {
    return this.retryHistory.get(operationId) || [];
  }

  getSuccessRate(operationId: string): number {
    const history = this.getRetryHistory(operationId);
    if (history.length === 0) return 0;
    
    const successCount = history.filter(attempt => attempt.success).length;
    return successCount / history.length;
  }

  // Circuit breaker pattern - temporarily stop retries if too many failures
  shouldCircuitBreak(operationId: string): boolean {
    const history = this.getRetryHistory(operationId);
    if (history.length < 5) return false; // Need at least 5 attempts
    
    const recentAttempts = history.slice(-5); // Last 5 attempts
    const recentFailures = recentAttempts.filter(attempt => !attempt.success).length;
    
    // Circuit break if 80% or more of recent attempts failed
    return recentFailures >= 4;
  }
}

/**
 * Enhanced network health checker with comprehensive monitoring
 */
export class NetworkHealthChecker {
  private connection: Connection;
  private lastHealthCheck = 0;
  private healthCheckInterval = 30000; // 30 seconds
  private isHealthy = true;
  private healthHistory: Array<{ timestamp: number; healthy: boolean; latency: number; error?: string }> = [];
  private consecutiveFailures = 0;
  private maxConsecutiveFailures = 3;
  private healthCheckCallbacks = new Set<(healthy: boolean) => void>();
  private autoHealthCheckTimer?: NodeJS.Timeout;

  constructor(connection: Connection) {
    this.connection = connection;
    this.startAutoHealthCheck();
  }

  private startAutoHealthCheck() {
    // Periodic health checks
    this.autoHealthCheckTimer = setInterval(async () => {
      await this.checkHealth();
    }, this.healthCheckInterval);
  }

  async checkHealth(force: boolean = false): Promise<boolean> {
    const now = Date.now();
    
    // Skip if recently checked and not forced
    if (!force && now - this.lastHealthCheck < this.healthCheckInterval) {
      return this.isHealthy;
    }

    const startTime = Date.now();
    let latency = 0;
    let error: string | undefined;

    try {
      // Comprehensive health check
      const healthPromise = this.performHealthChecks();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Health check timeout')), 10000);
      });

      await Promise.race([healthPromise, timeoutPromise]);
      
      latency = Date.now() - startTime;
      this.isHealthy = true;
      this.consecutiveFailures = 0;
      
      console.log(`✅ Network health check passed (${latency}ms)`);
      
    } catch (err) {
      latency = Date.now() - startTime;
      error = err instanceof Error ? err.message : 'Unknown error';
      this.isHealthy = false;
      this.consecutiveFailures++;
      
      console.warn(`❌ Network health check failed (${latency}ms):`, error);
      
      // Log critical network issues
      if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
        console.error(`🚨 Network critically unhealthy: ${this.consecutiveFailures} consecutive failures`);
      }
    }

    // Record health check result
    this.recordHealthCheck(this.isHealthy, latency, error);
    this.lastHealthCheck = now;

    // Notify callbacks
    this.notifyHealthCallbacks(this.isHealthy);

    return this.isHealthy;
  }

  private async performHealthChecks(): Promise<void> {
    // Multiple health checks for comprehensive monitoring
    const checks = await Promise.allSettled([
      // Check 1: Get latest blockhash
      this.connection.getLatestBlockhash('confirmed'),
      
      // Check 2: Get slot
      this.connection.getSlot('confirmed'),
      
      // Check 3: Get version (lightweight check)
      this.connection.getVersion(),
    ]);

    // Require at least 2 out of 3 checks to pass
    const passedChecks = checks.filter(result => result.status === 'fulfilled').length;
    if (passedChecks < 2) {
      const errors = checks
        .filter(result => result.status === 'rejected')
        .map(result => (result as PromiseRejectedResult).reason.message);
      throw new Error(`Health checks failed: ${errors.join(', ')}`);
    }
  }

  private recordHealthCheck(healthy: boolean, latency: number, error?: string) {
    this.healthHistory.push({
      timestamp: Date.now(),
      healthy,
      latency,
      error
    });

    // Keep only last 50 health checks
    if (this.healthHistory.length > 50) {
      this.healthHistory.shift();
    }
  }

  private notifyHealthCallbacks(healthy: boolean) {
    this.healthCheckCallbacks.forEach(callback => {
      try {
        callback(healthy);
      } catch (error) {
        console.error('Health callback error:', error);
      }
    });
  }

  getHealthStatus(): { 
    healthy: boolean; 
    lastCheck: number; 
    consecutiveFailures: number;
    averageLatency: number;
    successRate: number;
  } {
    const recentHistory = this.healthHistory.slice(-10); // Last 10 checks
    const averageLatency = recentHistory.length > 0 
      ? recentHistory.reduce((sum, check) => sum + check.latency, 0) / recentHistory.length 
      : 0;
    
    const successRate = this.healthHistory.length > 0
      ? this.healthHistory.filter(check => check.healthy).length / this.healthHistory.length
      : 0;

    return {
      healthy: this.isHealthy,
      lastCheck: this.lastHealthCheck,
      consecutiveFailures: this.consecutiveFailures,
      averageLatency: Math.round(averageLatency),
      successRate: Math.round(successRate * 100) / 100
    };
  }

  getHealthHistory(): Array<{ timestamp: number; healthy: boolean; latency: number; error?: string }> {
    return [...this.healthHistory];
  }

  isCriticallyUnhealthy(): boolean {
    return this.consecutiveFailures >= this.maxConsecutiveFailures;
  }

  onHealthChange(callback: (healthy: boolean) => void): () => void {
    this.healthCheckCallbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.healthCheckCallbacks.delete(callback);
    };
  }

  async waitForHealthy(timeout: number = 30000): Promise<boolean> {
    if (this.isHealthy) return true;

    return new Promise((resolve) => {
      const startTime = Date.now();
      
      const checkHealth = async () => {
        if (Date.now() - startTime > timeout) {
          resolve(false);
          return;
        }

        const healthy = await this.checkHealth(true);
        if (healthy) {
          resolve(true);
        } else {
          setTimeout(checkHealth, 2000); // Check every 2 seconds
        }
      };

      checkHealth();
    });
  }

  destroy() {
    if (this.autoHealthCheckTimer) {
      clearInterval(this.autoHealthCheckTimer);
      this.autoHealthCheckTimer = undefined;
    }
    
    // Add null check before calling cleanup methods
    if (this.healthCheckCallbacks) {
      this.healthCheckCallbacks.clear();
    }
  }
}

/**
 * User-friendly error display component props
 */
export interface ErrorDisplayProps {
  error: GameError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  showTechnicalDetails?: boolean;
}

/**
 * Loading state manager
 */
export class LoadingStateManager {
  private loadingStates = new Map<string, boolean>();
  private callbacks = new Map<string, Set<(loading: boolean) => void>>();

  setLoading(operationId: string, loading: boolean) {
    this.loadingStates.set(operationId, loading);
    
    // Notify callbacks
    const operationCallbacks = this.callbacks.get(operationId);
    if (operationCallbacks) {
      operationCallbacks.forEach(callback => callback(loading));
    }
  }

  isLoading(operationId: string): boolean {
    return this.loadingStates.get(operationId) || false;
  }

  isAnyLoading(): boolean {
    return Array.from(this.loadingStates.values()).some(loading => loading);
  }

  subscribe(operationId: string, callback: (loading: boolean) => void) {
    if (!this.callbacks.has(operationId)) {
      this.callbacks.set(operationId, new Set());
    }
    this.callbacks.get(operationId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const operationCallbacks = this.callbacks.get(operationId);
      if (operationCallbacks) {
        operationCallbacks.delete(callback);
        if (operationCallbacks.size === 0) {
          this.callbacks.delete(operationId);
        }
      }
    };
  }

  reset(operationId?: string) {
    if (operationId) {
      this.loadingStates.delete(operationId);
      this.callbacks.delete(operationId);
    } else {
      this.loadingStates.clear();
      this.callbacks.clear();
    }
  }
}
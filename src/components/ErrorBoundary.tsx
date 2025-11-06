import React from 'react';
import { parseError, GameError, ErrorSeverity, RetryManager } from '../utils/errorHandler';

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  gameError?: GameError;
  retryCount: number;
  isRetrying: boolean;
}

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: (error: GameError, retry: () => void, retryCount: number) => React.ReactNode;
  maxRetries?: number;
  onError?: (error: GameError, errorInfo: React.ErrorInfo) => void;
  enableAutoRetry?: boolean;
  autoRetryDelay?: number;
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  private retryManager: RetryManager;
  private autoRetryTimer?: NodeJS.Timeout;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { 
      hasError: false, 
      retryCount: 0, 
      isRetrying: false 
    };
    this.retryManager = new RetryManager();
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Parse the error using our enhanced error handling
    const gameError = parseError(error, {
      userAgent: navigator.userAgent,
      url: window.location.href,
      walletConnected: false, // We don't have wallet context here
    });

    return { 
      hasError: true, 
      error,
      gameError
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error Boundary caught an error:', error, errorInfo);
    
    // Call custom error handler if provided
    if (this.props.onError && this.state.gameError) {
      this.props.onError(this.state.gameError, errorInfo);
    }
    
    // Enhanced logging with context
    const errorContext = {
      error: this.state.gameError,
      errorInfo,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      retryCount: this.state.retryCount,
      props: this.props
    };

    // Log based on severity
    if (this.state.gameError?.severity === ErrorSeverity.CRITICAL) {
      console.error('🚨 CRITICAL ERROR - Application may be unstable:', errorContext);
      
      // Send to error tracking service in production
      this.sendErrorToTracking(errorContext);
    } else {
      console.warn('⚠️ Error Boundary caught error:', errorContext);
    }

    // Auto-retry for retryable errors
    if (this.props.enableAutoRetry && 
        this.state.gameError?.retryable && 
        this.state.retryCount < (this.props.maxRetries || 3)) {
      this.scheduleAutoRetry();
    }
  }

  componentWillUnmount() {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }
  }

  private sendErrorToTracking = (errorContext: any) => {
    // In production, send to error tracking service
    // Example: Sentry, LogRocket, etc.
    console.log('📊 Error tracking data:', errorContext);
  };

  private scheduleAutoRetry = () => {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }

    const delay = this.props.autoRetryDelay || this.state.gameError?.retryDelay || 3000;
    
    this.setState({ isRetrying: true });
    
    console.log(`🔄 Auto-retry scheduled in ${delay}ms (attempt ${this.state.retryCount + 1})`);
    
    this.autoRetryTimer = setTimeout(() => {
      this.handleRetry(true);
    }, delay);
  };

  handleRetry = (isAutoRetry: boolean = false) => {
    if (this.autoRetryTimer) {
      clearTimeout(this.autoRetryTimer);
    }

    const newRetryCount = this.state.retryCount + 1;
    
    console.log(`🔄 ${isAutoRetry ? 'Auto-retry' : 'Manual retry'} attempt ${newRetryCount}`);
    
    this.setState({ 
      hasError: false, 
      error: undefined, 
      gameError: undefined,
      retryCount: newRetryCount,
      isRetrying: false
    });
  };

  private getRecoveryActions = () => {
    if (!this.state.gameError) return [];

    const actions = [];

    // Always allow manual retry
    if (this.state.gameError.retryable) {
      actions.push({
        label: 'Try Again',
        action: () => this.handleRetry(),
        primary: true,
        icon: '🔄'
      });
    }

    // Specific recovery actions based on error type
    switch (this.state.gameError.type) {
      case 'WALLET_ERROR':
        actions.push({
          label: 'Reconnect Wallet',
          action: () => {
            // Trigger wallet reconnection
            window.location.hash = '#reconnect-wallet';
            this.handleRetry();
          },
          icon: '🔗'
        });
        break;
      
      case 'NETWORK_ERROR':
        actions.push({
          label: 'Check Network',
          action: () => {
            // Open network status or refresh
            window.open('https://status.solana.com', '_blank');
          },
          icon: '🌐'
        });
        break;
      
      case 'INITIALIZATION_ERROR':
        actions.push({
          label: 'Initialize Game',
          action: () => {
            window.location.hash = '#initialize';
            this.handleRetry();
          },
          icon: '🎮'
        });
        break;
    }

    // Always allow page reload as last resort
    actions.push({
      label: 'Reload Page',
      action: () => window.location.reload(),
      icon: '🔄'
    });

    return actions;
  };

  render() {
    if (this.state.hasError && this.state.gameError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.gameError, this.handleRetry, this.state.retryCount);
      }

      const recoveryActions = this.getRecoveryActions();

      // Default error boundary UI with enhanced styling
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-900 via-red-800 to-red-900 text-white flex items-center justify-center p-8">
          <div className="max-w-lg w-full">
            <div className="bg-red-800/50 backdrop-blur-sm border border-red-600 rounded-2xl p-8 shadow-2xl">
              {/* Error Icon and Title */}
              <div className="text-center mb-6">
                <div className="text-6xl mb-4">🚨</div>
                <h1 className="text-3xl font-bold mb-2">Application Error</h1>
                <p className="text-red-200 text-lg">
                  {this.state.gameError.severity === ErrorSeverity.CRITICAL 
                    ? 'A critical error has occurred'
                    : 'Something unexpected happened'
                  }
                </p>
                {this.state.retryCount > 0 && (
                  <p className="text-red-300 text-sm mt-2">
                    Retry attempt: {this.state.retryCount}/{this.props.maxRetries || 3}
                  </p>
                )}
              </div>

              {/* Auto-retry indicator */}
              {this.state.isRetrying && (
                <div className="bg-blue-900/50 rounded-lg p-4 mb-6 text-center">
                  <div className="flex items-center justify-center gap-3 mb-2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-400"></div>
                    <span className="text-blue-200 font-medium">Auto-retry in progress...</span>
                  </div>
                  <p className="text-blue-300 text-sm">
                    Attempting to recover automatically
                  </p>
                </div>
              )}

              {/* User-friendly error message */}
              <div className="bg-red-900/50 rounded-lg p-4 mb-6">
                <h3 className="font-bold text-lg mb-2">What happened:</h3>
                <p className="text-red-100 mb-3">{this.state.gameError.userMessage}</p>
                
                {/* Error-specific guidance */}
                {this.state.gameError.type === 'NETWORK_ERROR' && (
                  <div className="text-red-200 text-sm bg-red-800/30 rounded p-3">
                    <p className="font-medium mb-1">Network Issue Detected:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Check your internet connection</li>
                      <li>Solana network may be experiencing high traffic</li>
                      <li>Try again in a few moments</li>
                    </ul>
                  </div>
                )}
                
                {this.state.gameError.type === 'WALLET_ERROR' && (
                  <div className="text-red-200 text-sm bg-red-800/30 rounded p-3">
                    <p className="font-medium mb-1">Wallet Connection Issue:</p>
                    <ul className="list-disc list-inside space-y-1 text-xs">
                      <li>Make sure your wallet extension is unlocked</li>
                      <li>Try refreshing the page</li>
                      <li>Check if your wallet is connected to the correct network</li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Enhanced action buttons */}
              <div className="space-y-3 mb-6">
                {recoveryActions.map((action, index) => (
                  <button
                    key={index}
                    onClick={action.action}
                    disabled={this.state.isRetrying}
                    className={`w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-bold transition-all duration-200 ${
                      action.primary 
                        ? 'bg-green-600 hover:bg-green-700 text-white' 
                        : 'bg-slate-600 hover:bg-slate-700 text-white'
                    } ${this.state.isRetrying ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105 active:scale-95'}`}
                  >
                    <span className="text-lg">{action.icon}</span>
                    <span>{action.label}</span>
                  </button>
                ))}
              </div>

              {/* Retry history */}
              {this.state.retryCount > 0 && (
                <div className="bg-black/30 rounded-lg p-4 mb-4">
                  <h4 className="font-bold text-sm text-red-200 mb-2">Recovery Attempts:</h4>
                  <div className="text-xs text-red-100">
                    <p>• {this.state.retryCount} attempt{this.state.retryCount > 1 ? 's' : ''} made</p>
                    {this.state.retryCount >= (this.props.maxRetries || 3) && (
                      <p className="text-yellow-300 mt-1">• Maximum retries reached - manual intervention required</p>
                    )}
                  </div>
                </div>
              )}

              {/* Technical details (collapsible) */}
              <details className="bg-black/30 rounded-lg p-4">
                <summary className="cursor-pointer font-bold text-sm text-red-200 hover:text-white transition-colors">
                  Technical Details (for developers)
                </summary>
                <div className="mt-4 space-y-3">
                  <div>
                    <span className="font-bold text-red-300">Error Type:</span>
                    <span className="ml-2 text-red-100">{this.state.gameError.type}</span>
                  </div>
                  <div>
                    <span className="font-bold text-red-300">Severity:</span>
                    <span className="ml-2 text-red-100">{this.state.gameError.severity}</span>
                  </div>
                  <div>
                    <span className="font-bold text-red-300">Retryable:</span>
                    <span className="ml-2 text-red-100">{this.state.gameError.retryable ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="font-bold text-red-300">Technical Message:</span>
                    <span className="ml-2 text-red-100">{this.state.gameError.technicalMessage}</span>
                  </div>
                  <div>
                    <span className="font-bold text-red-300">Timestamp:</span>
                    <span className="ml-2 text-red-100">
                      {new Date(this.state.gameError.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="font-bold text-red-300">Retry Count:</span>
                    <span className="ml-2 text-red-100">{this.state.retryCount}</span>
                  </div>
                  {this.state.gameError.logs && this.state.gameError.logs.length > 0 && (
                    <div>
                      <span className="font-bold text-red-300">Stack Trace:</span>
                      <pre className="mt-2 text-xs bg-black/50 p-3 rounded overflow-auto max-h-40 text-red-100">
                        {this.state.gameError.logs.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              </details>

              {/* Help text */}
              <div className="mt-6 text-center text-sm text-red-200">
                <p>If this problem persists, please contact support with the technical details above.</p>
                {this.state.gameError.severity === ErrorSeverity.CRITICAL && (
                  <p className="mt-2 text-yellow-300 font-medium">
                    ⚠️ This is a critical error - please report it immediately
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
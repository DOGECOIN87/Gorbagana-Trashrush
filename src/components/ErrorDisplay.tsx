import React, { useState, useEffect } from 'react';
import { GameError, ErrorSeverity, ErrorType } from '../utils/errorHandler';

interface ErrorDisplayProps {
  error: GameError | null;
  onRetry?: () => void;
  onDismiss?: () => void;
  showTechnicalDetails?: boolean;
  autoHideDelay?: number;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({
  error,
  onRetry,
  onDismiss,
  showTechnicalDetails = false,
  autoHideDelay = 5000
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (error) {
      setIsVisible(true);
      
      // Auto-hide for low severity errors
      if (error.severity === ErrorSeverity.LOW && autoHideDelay > 0) {
        const timer = setTimeout(() => {
          handleDismiss();
        }, autoHideDelay);
        
        return () => clearTimeout(timer);
      }
    } else {
      setIsVisible(false);
    }
  }, [error, autoHideDelay]);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(() => {
      if (onDismiss) {
        onDismiss();
      }
    }, 300); // Wait for fade out animation
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
    }
    handleDismiss();
  };

  if (!error || !isVisible) {
    return null;
  }

  // Get styling based on error severity
  const getSeverityStyles = () => {
    switch (error.severity) {
      case ErrorSeverity.CRITICAL:
        return {
          container: 'bg-red-900/90 border-red-500',
          icon: '🚨',
          iconColor: 'text-red-400',
          textColor: 'text-red-100'
        };
      case ErrorSeverity.HIGH:
        return {
          container: 'bg-orange-900/90 border-orange-500',
          icon: '⚠️',
          iconColor: 'text-orange-400',
          textColor: 'text-orange-100'
        };
      case ErrorSeverity.MEDIUM:
        return {
          container: 'bg-yellow-900/90 border-yellow-500',
          icon: '⚡',
          iconColor: 'text-yellow-400',
          textColor: 'text-yellow-100'
        };
      case ErrorSeverity.LOW:
        return {
          container: 'bg-blue-900/90 border-blue-500',
          icon: 'ℹ️',
          iconColor: 'text-blue-400',
          textColor: 'text-blue-100'
        };
      default:
        return {
          container: 'bg-gray-900/90 border-gray-500',
          icon: '❓',
          iconColor: 'text-gray-400',
          textColor: 'text-gray-100'
        };
    }
  };

  const styles = getSeverityStyles();

  // Get error type specific suggestions
  const getErrorSuggestions = () => {
    switch (error.type) {
      case ErrorType.WALLET_ERROR:
        return [
          'Make sure your wallet is connected',
          'Try refreshing the page',
          'Check if your wallet extension is working'
        ];
      case ErrorType.NETWORK_ERROR:
        return [
          'Check your internet connection',
          'Try again in a few moments',
          'The network may be experiencing high traffic'
        ];
      case ErrorType.INSUFFICIENT_FUNDS:
        return [
          'Add more SOL to your wallet',
          'Reduce your bet amount',
          'Check your wallet balance'
        ];
      case ErrorType.TRANSACTION_ERROR:
        return [
          'Try the transaction again',
          'Make sure you have enough SOL for fees',
          'Wait for network congestion to clear'
        ];
      case ErrorType.SMART_CONTRACT_ERROR:
        return [
          'Check the game rules and limits',
          'Make sure the game is not paused',
          'Try a different bet amount'
        ];
      case ErrorType.INITIALIZATION_ERROR:
        return [
          'Click "Initialize Game" to set up',
          'Make sure you have SOL for setup fees',
          'Try reconnecting your wallet'
        ];
      default:
        return [
          'Try refreshing the page',
          'Check your wallet connection',
          'Contact support if the problem persists'
        ];
    }
  };

  return (
    <div className={`fixed top-4 left-4 right-4 z-50 transition-all duration-300 ${
      isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'
    }`}>
      <div className={`${styles.container} border-2 rounded-xl p-4 shadow-2xl backdrop-blur-sm max-w-md mx-auto`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl ${styles.iconColor}`}>{styles.icon}</span>
            <div>
              <h3 className={`font-bold text-lg ${styles.textColor}`}>
                {error.severity === ErrorSeverity.CRITICAL ? 'Critical Error' :
                 error.severity === ErrorSeverity.HIGH ? 'Error' :
                 error.severity === ErrorSeverity.MEDIUM ? 'Warning' : 'Notice'}
              </h3>
              <p className={`text-sm ${styles.textColor} opacity-80`}>
                {new Date(error.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className={`${styles.textColor} hover:opacity-80 transition-opacity text-xl leading-none`}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>

        {/* Error Message */}
        <div className={`${styles.textColor} mb-4`}>
          <p className="text-base font-medium mb-2">{error.userMessage}</p>
          
          {/* Suggestions */}
          <div className="text-sm opacity-90">
            <p className="font-medium mb-1">What you can try:</p>
            <ul className="list-disc list-inside space-y-1">
              {getErrorSuggestions().map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Technical Details Toggle */}
        {showTechnicalDetails && (
          <div className="mb-4">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className={`text-sm ${styles.textColor} opacity-70 hover:opacity-100 transition-opacity underline`}
            >
              {showDetails ? 'Hide' : 'Show'} Technical Details
            </button>
            
            {showDetails && (
              <div className="mt-2 p-3 bg-black/30 rounded-lg">
                <div className="text-xs font-mono space-y-2">
                  <div>
                    <span className="font-bold">Type:</span> {error.type}
                  </div>
                  <div>
                    <span className="font-bold">Message:</span> {error.technicalMessage}
                  </div>
                  {error.code && (
                    <div>
                      <span className="font-bold">Code:</span> {error.code}
                    </div>
                  )}
                  {error.logs && error.logs.length > 0 && (
                    <div>
                      <span className="font-bold">Logs:</span>
                      <pre className="mt-1 text-xs overflow-auto max-h-32 bg-black/50 p-2 rounded">
                        {error.logs.join('\n')}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 justify-end">
          {error.retryable && onRetry && (
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors text-sm"
            >
              Try Again
            </button>
          )}
          <button
            onClick={handleDismiss}
            className={`px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors text-sm`}
          >
            Dismiss
          </button>
        </div>

        {/* Retry countdown for automatic retries */}
        {error.retryable && error.retryDelay && (
          <div className={`mt-2 text-xs ${styles.textColor} opacity-70 text-center`}>
            Automatic retry available in {Math.ceil(error.retryDelay / 1000)} seconds
          </div>
        )}
      </div>
    </div>
  );
};

// Loading overlay component
interface LoadingOverlayProps {
  isLoading: boolean;
  message?: string;
  progress?: number;
  onCancel?: () => void;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isLoading,
  message = 'Processing...',
  progress,
  onCancel
}) => {
  if (!isLoading) return null;

  return (
    <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm flex items-center justify-center">
      <div className="bg-slate-800 rounded-xl p-6 max-w-sm w-full mx-4 border border-slate-600 shadow-2xl">
        <div className="text-center">
          {/* Spinner */}
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 border-4 border-slate-600 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-transparent border-t-blue-500 rounded-full animate-spin"></div>
          </div>

          {/* Message */}
          <h3 className="text-lg font-bold text-white mb-2">{message}</h3>

          {/* Progress bar */}
          {progress !== undefined && (
            <div className="w-full bg-slate-700 rounded-full h-2 mb-4">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              ></div>
            </div>
          )}

          {/* Status text */}
          <p className="text-sm text-gray-300 mb-4">
            Please wait while we process your request...
          </p>

          {/* Cancel button */}
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// Toast notification component for quick messages
interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  isVisible: boolean;
  onDismiss: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  isVisible,
  onDismiss,
  duration = 3000
}) => {
  useEffect(() => {
    if (isVisible && duration > 0) {
      const timer = setTimeout(onDismiss, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onDismiss]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-600 border-green-500 text-green-100';
      case 'error':
        return 'bg-red-600 border-red-500 text-red-100';
      case 'warning':
        return 'bg-yellow-600 border-yellow-500 text-yellow-100';
      case 'info':
        return 'bg-blue-600 border-blue-500 text-blue-100';
      default:
        return 'bg-gray-600 border-gray-500 text-gray-100';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success': return '✅';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      case 'info': return 'ℹ️';
      default: return '📢';
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
      isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-full'
    }`}>
      <div className={`${getTypeStyles()} border rounded-lg p-4 shadow-lg max-w-sm flex items-center gap-3`}>
        <span className="text-xl">{getIcon()}</span>
        <p className="flex-1 font-medium">{message}</p>
        <button
          onClick={onDismiss}
          className="text-xl leading-none hover:opacity-80 transition-opacity"
        >
          ×
        </button>
      </div>
    </div>
  );
};
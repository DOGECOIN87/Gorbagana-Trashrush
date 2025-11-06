import React, { useState } from 'react';

interface InitializationPromptProps {
  isVisible: boolean;
  isLoading: boolean;
  error: string;
  onInitialize: () => Promise<void>;
  onCancel?: () => void;
}

export const InitializationPrompt: React.FC<InitializationPromptProps> = ({
  isVisible,
  isLoading,
  error,
  onInitialize,
  onCancel
}) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 rounded-2xl p-6 max-w-md w-full mx-4 border border-purple-500/30 shadow-[0_0_20px_rgba(139,92,246,0.3)]">
        
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🎰</div>
          <h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400">
            Game Setup Required
          </h2>
          <p className="text-gray-300 text-sm mt-2">
            Your game state needs to be initialized before you can start playing
          </p>
        </div>

        {/* Main Content */}
        <div className="space-y-4">
          
          {/* What happens section */}
          <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-600/30">
            <h3 className="text-lg font-semibold text-cyan-400 mb-2">What happens next?</h3>
            <ul className="text-sm text-gray-300 space-y-1">
              <li>• Creates your personal game account on Gorbagana</li>
              <li>• Sets up initial game parameters</li>
              <li>• Enables slot machine functionality</li>
              <li>• One-time setup (small SOL fee for account creation)</li>
            </ul>
          </div>

          {/* Details toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-purple-400 hover:text-purple-300 transition-colors"
          >
            {showDetails ? '▼' : '▶'} Technical Details
          </button>

          {showDetails && (
            <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-600/20 text-xs text-gray-400">
              <p className="mb-2">
                <strong>Account Address:</strong> Program-derived address (PDA) based on your wallet
              </p>
              <p className="mb-2">
                <strong>Cost:</strong> ~0.002 SOL for account rent (refundable if closed)
              </p>
              <p>
                <strong>Security:</strong> Only you can control this account with your wallet
              </p>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-lg">⚠️</span>
                <div>
                  <div className="text-red-300 font-medium text-sm">Initialization Failed</div>
                  <div className="text-red-200 text-xs mt-1">{error}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onInitialize}
              disabled={isLoading}
              className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 ${
                isLoading
                  ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-xl active:scale-95'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
                  <span>Initializing...</span>
                </div>
              ) : (
                '🚀 Initialize Game'
              )}
            </button>

            {onCancel && (
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="px-4 py-3 rounded-lg font-bold text-sm bg-slate-700 hover:bg-slate-600 text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
            )}
          </div>

          {/* Help Text */}
          <div className="text-center text-xs text-gray-400 pt-2">
            Need help? This is a one-time setup to enable blockchain gameplay
          </div>
        </div>
      </div>
    </div>
  );
};
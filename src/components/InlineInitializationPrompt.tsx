import React from 'react';

interface InlineInitializationPromptProps {
  isLoading: boolean;
  error: string;
  onInitialize: () => Promise<void>;
  balance: number;
}

export const InlineInitializationPrompt: React.FC<InlineInitializationPromptProps> = ({
  isLoading,
  error,
  onInitialize,
  balance
}) => {
  return (
    <div className="flex items-center justify-center min-h-[600px] p-6">
      <div className="bg-gradient-to-br from-slate-800/90 via-purple-900/30 to-slate-800/90 rounded-2xl p-8 max-w-md w-full border border-purple-500/50 shadow-[0_0_30px_rgba(139,92,246,0.4)] backdrop-blur-sm">
        
        {/* Icon and Title */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-4 animate-bounce">🎰</div>
          <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 mb-2">
            Ready to Play?
          </h2>
          <p className="text-gray-300 text-sm">
            Initialize your game account to start spinning!
          </p>
        </div>

        {/* Status Cards */}
        <div className="space-y-3 mb-6">
          <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-3 flex items-center gap-3">
            <span className="text-green-400 text-xl">✅</span>
            <div>
              <div className="text-green-300 font-medium text-sm">Wallet Connected</div>
              <div className="text-green-200 text-xs">Balance: {balance.toFixed(4)} GOR</div>
            </div>
          </div>
          
          <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg p-3 flex items-center gap-3">
            <span className="text-orange-400 text-xl">⏳</span>
            <div>
              <div className="text-orange-300 font-medium text-sm">Game Setup Required</div>
              <div className="text-orange-200 text-xs">One-time initialization needed</div>
            </div>
          </div>
        </div>

        {/* What happens section */}
        <div className="bg-slate-800/50 rounded-lg p-4 mb-6 border border-slate-600/30">
          <h3 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
            <span>🚀</span> What happens next?
          </h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">•</span>
              <span>Creates your personal game account</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">•</span>
              <span>Sets up blockchain game state</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">•</span>
              <span>Enables slot machine functionality</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-cyan-400 mt-0.5">•</span>
              <span>Small fee for account creation (~0.002 GOR)</span>
            </li>
          </ul>
        </div>

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <span className="text-red-400 text-xl">⚠️</span>
              <div>
                <div className="text-red-300 font-medium text-sm">Setup Failed</div>
                <div className="text-red-200 text-xs mt-1">{error}</div>
              </div>
            </div>
          </div>
        )}

        {/* Initialize Button */}
        <button
          onClick={onInitialize}
          disabled={isLoading}
          className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all duration-300 transform ${
            isLoading
              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
              : 'bg-gradient-to-r from-green-500 via-emerald-500 to-green-600 hover:from-green-400 hover:via-emerald-400 hover:to-green-500 text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95'
          }`}
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-3">
              <div className="w-5 h-5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin"></div>
              <span>Setting up your game...</span>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2">
              <span>🎮</span>
              <span>Initialize Game Account</span>
            </div>
          )}
        </button>

        {/* Help Text */}
        <div className="text-center text-xs text-gray-400 mt-4">
          This is a one-time setup to enable blockchain gameplay on Gorbagana
        </div>
      </div>
    </div>
  );
};
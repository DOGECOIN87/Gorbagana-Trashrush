/*
  Gorbagana Trash Rush - Blockchain Slots Game
*/
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { DesktopSlotGame } from './src/components/DesktopSlotGame.tsx';
import { BlockchainSlotGame } from './src/components/BlockchainSlotGame.tsx';
import { InitializationPrompt } from './src/components/InitializationPrompt.tsx';
import { WalletContextProvider } from './src/hooks/useWallet.tsx';
import { useProgram } from './src/hooks/useProgram.tsx';
import { ErrorBoundary } from './src/components/ErrorBoundary.tsx';

// Real Application Component with Wallet Integration
const AppContent: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState(0);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const { 
    spinSlots, 
    getSlotsState, 
    initializeSlots,
    checkInitializationStatus,
    isLoading, 
    isInitialized, 
    initializationError 
  } = useProgram();
  const [showInitPrompt, setShowInitPrompt] = useState(false);

  // Handle screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Get wallet balance
  useEffect(() => {
    const getBalance = async () => {
      if (publicKey && connection) {
        try {
          const balanceLamports = await connection.getBalance(publicKey);
          setBalance(balanceLamports / LAMPORTS_PER_SOL);
        } catch (error) {
          console.error('Error getting balance:', error);
          setBalance(0);
        }
      } else {
        setBalance(0);
      }
    };

    getBalance();
  }, [publicKey, connection]);

  // Handle initialization status changes
  useEffect(() => {
    // Only show modal prompt if we're on desktop or if inline prompt is not available
    // The inline prompt is now the primary initialization method
    if (connected && isInitialized === false && window.innerWidth < 1024) {
      // Show modal initialization prompt only on mobile where inline might not be as visible
      setShowInitPrompt(true);
    } else if (isInitialized === true) {
      // Hide prompt when initialization is complete
      setShowInitPrompt(false);
    } else {
      // Hide modal on desktop since we have inline prompt
      setShowInitPrompt(false);
    }
  }, [connected, isInitialized]);

  // Handle initialization
  const handleInitialize = async () => {
    try {
      const result = await initializeSlots(true); // Enable auto-retry
      if (result === 'already_initialized' || result) {
        setShowInitPrompt(false);
        // Refresh balance after initialization
        if (publicKey && connection) {
          const newBalanceLamports = await connection.getBalance(publicKey);
          setBalance(newBalanceLamports / LAMPORTS_PER_SOL);
        }
      }
    } catch (error) {
      console.error('Initialization failed:', error);
      // Error is already handled in the useProgram hook and displayed in the prompt
    }
  };

  // Real spin function that interacts with blockchain
  const handleSpin = async (betAmount: number): Promise<{ symbols: [number, number, number], payout: number }> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    // Check if game is initialized before spinning
    if (isInitialized === false) {
      throw new Error('Game not initialized. Please initialize the game first.');
    }

    try {
      const result = await spinSlots(betAmount);

      if (!result) {
        throw new Error('Spin failed - no result returned');
      }

      // Update balance after spin
      const newBalanceLamports = await connection.getBalance(publicKey);
      setBalance(newBalanceLamports / LAMPORTS_PER_SOL);

      // Return the spin result - the SpinResult interface has symbols and payout directly
      return {
        symbols: result.symbols,
        payout: result.payout / LAMPORTS_PER_SOL
      };
    } catch (error) {
      console.error('Spin error:', error);
      throw error;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a021d]">
      {/* Wallet Connection UI */}
      <div className="fixed top-4 right-4 z-50">
        <WalletMultiButton className="!bg-blue-600 hover:!bg-blue-700 !text-white !px-4 !py-2 !rounded-lg !text-sm !transition-colors" />
      </div>

      {/* Connection Status */}
      {connected && (
        <div className="fixed top-4 left-4 z-50 bg-green-600/90 text-white px-4 py-2 rounded-lg text-sm max-w-xs">
          <div className="font-bold">✅ Connected to Gorbagana</div>
          <div className="text-xs mt-1">
            Balance: {balance.toFixed(4)} GOR
          </div>
        </div>
      )}

      {/* Debug indicator */}
      <div className="fixed bottom-4 left-4 z-50 bg-black/80 text-white px-3 py-1 rounded text-xs">
        {isDesktop ? '🖥️ Desktop Mode' : '📱 Mobile Mode'} | Width: {window.innerWidth}px
      </div>

      {/* Initialization Prompt */}
      <InitializationPrompt
        isVisible={showInitPrompt}
        isLoading={isLoading}
        error={initializationError}
        onInitialize={handleInitialize}
        onCancel={() => setShowInitPrompt(false)}
      />

      {/* Main Game Component */}
      <DesktopSlotGame
        isConnected={connected}
        balance={balance}
        onConnect={() => {}} // Handled by WalletMultiButton
        onDisconnect={() => {}} // Handled by WalletMultiButton
      >
        <BlockchainSlotGame
          onSpin={handleSpin}
          isConnected={connected}
          balance={balance}
          isInitialized={isInitialized}
          onInitialize={handleInitialize}
          initializationError={initializationError}
        />
      </DesktopSlotGame>
    </div>
  );
};

// Main App Component with Wallet Provider
const App: React.FC = () => {
  return (
    <WalletContextProvider>
      <AppContent />
    </WalletContextProvider>
  );
};

// React App Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}

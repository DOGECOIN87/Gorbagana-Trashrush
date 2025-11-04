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
import { WalletContextProvider } from './src/hooks/useWallet.tsx';
import { useProgram } from './src/hooks/useProgram.tsx';

// Real Application Component with Wallet Integration
const AppContent: React.FC = () => {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [balance, setBalance] = useState(0);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);
  const { spinSlots, getSlotsState, isLoading } = useProgram();

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

  // Real spin function that interacts with blockchain
  const handleSpin = async (betAmount: number): Promise<{ symbols: [number, number, number], payout: number }> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected');
    }

    try {
      const result = await spinSlots(betAmount);

      if (!result) {
        throw new Error('Spin failed - no result returned');
      }

      // Update balance after spin
      const newBalanceLamports = await connection.getBalance(publicKey);
      setBalance(newBalanceLamports / LAMPORTS_PER_SOL);

      // Return the spin result
      return {
        symbols: result.state.symbols,
        payout: result.state.payout / LAMPORTS_PER_SOL
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
      <App />
    </React.StrictMode>
  );
}

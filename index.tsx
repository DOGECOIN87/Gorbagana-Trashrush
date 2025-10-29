/*
  Gorbagana Trash Rush - Blockchain Slots Game

  Instructions for setup:
  1. This file contains the complete React application with blockchain integration.
  2. Ensure you have all Solana dependencies installed.
  3. This project uses Tailwind CSS for styling.
  4. Image assets are imported from assets.tsx.
*/
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BlockchainSlotGame } from './src/components/BlockchainSlotGame.tsx';
import { DesktopSlotGame } from './src/components/DesktopSlotGame.tsx';

// Demo Application Component
const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [balance, setBalance] = useState(5.0); // Demo balance in GOR
  const [wallet, setWallet] = useState<any>(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  // Handle screen size changes
  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Demo wallet connection simulation
  const connectWallet = () => {
    setIsConnected(true);
    setWallet({ publicKey: { toString: () => 'Demo Wallet Address' } });
  };

  const disconnectWallet = () => {
    setIsConnected(false);
    setWallet(null);
  };

  // Demo spin function that simulates blockchain interaction
  const handleSpin = async (betAmount: number): Promise<{ symbols: [number, number, number], payout: number }> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Deduct bet amount from balance
    setBalance(prevBalance => Math.max(0, prevBalance - betAmount));

    // Generate random symbols (0-7 corresponding to smart contract)
    const symbols: [number, number, number] = [
      Math.floor(Math.random() * 8),
      Math.floor(Math.random() * 8),
      Math.floor(Math.random() * 8)
    ];

    // Calculate payout - only pay out on three matching symbols
    let payout = 0;
    if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
      // Three of a kind only - different multipliers based on symbol
      const payoutMultipliers = [100, 50, 25, 20, 15, 10, 5, 2]; // gorbagana, wild, bonusChest, trash, takeout, fish, rat, banana
      payout = betAmount * payoutMultipliers[symbols[0]];
    }
    // No payout for partial matches (2 of a kind)

    // Add payout to balance
    if (payout > 0) {
      setBalance(prevBalance => prevBalance + payout);
    }

    return { symbols, payout };
  };

  return (
    <div className="min-h-screen bg-[#0a021d]">
      {/* Only show overlays for mobile version */}
      {!isDesktop && (
        <>
          {/* Wallet Connection UI */}
          <div className="fixed top-4 right-4 z-50">
            {isConnected ? (
              <div className="flex flex-col gap-2">
                <div className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm">
                  ✅ Connected: Demo Wallet
                </div>
                <button
                  onClick={disconnectWallet}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Connect Demo Wallet
              </button>
            )}
          </div>

          {/* Demo Notice */}
          <div className="fixed top-4 left-4 z-50 bg-yellow-600/90 text-white px-4 py-2 rounded-lg text-sm max-w-xs">
            <div className="font-bold">🚧 Demo Mode</div>
            <div className="text-xs mt-1">
              This is a demo version. Connect wallet to simulate blockchain interactions.
            </div>
          </div>
        </>
      )}

      {/* Debug indicator */}
      <div className="fixed bottom-4 left-4 z-50 bg-black/80 text-white px-3 py-1 rounded text-xs">
        {isDesktop ? '🖥️ Desktop Mode' : '📱 Mobile Mode'} | Width: {window.innerWidth}px
      </div>

      {/* Main Game Component */}
      {isDesktop ? (
        <DesktopSlotGame
          wallet={wallet}
          onSpin={handleSpin}
          isConnected={isConnected}
          balance={balance}
          onConnect={connectWallet}
          onDisconnect={disconnectWallet}
        >
          <BlockchainSlotGame
            wallet={wallet}
            onSpin={handleSpin}
            isConnected={isConnected}
            balance={balance}
          />
        </DesktopSlotGame>
      ) : (
        <BlockchainSlotGame
          wallet={wallet}
          onSpin={handleSpin}
          isConnected={isConnected}
          balance={balance}
        />
      )}
    </div>
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

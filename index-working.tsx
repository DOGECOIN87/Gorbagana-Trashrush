import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Simple mock wallet for demo
const mockWallet = {
  connected: false,
  balance: 5.2341,
  connect: () => console.log('Mock wallet connected'),
  disconnect: () => console.log('Mock wallet disconnected')
};

// Simplified slot game component
const SimpleSlotGame: React.FC = () => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [symbols, setSymbols] = useState(['🦍', '🗑️', '🥡']);
  const [lastWin, setLastWin] = useState(0);
  const [betAmount, setBetAmount] = useState(0.01);

  const symbolList = ['🦍', '🗑️', '🥡', '🐟', '🐀', '🍌', '💎', '⭐'];
  
  const spin = async () => {
    if (isSpinning) return;
    
    setIsSpinning(true);
    setLastWin(0);
    
    // Animate spinning
    const spinDuration = 2000;
    const interval = setInterval(() => {
      setSymbols([
        symbolList[Math.floor(Math.random() * symbolList.length)],
        symbolList[Math.floor(Math.random() * symbolList.length)],
        symbolList[Math.floor(Math.random() * symbolList.length)]
      ]);
    }, 100);
    
    setTimeout(() => {
      clearInterval(interval);
      
      // Final result
      const finalSymbols = [
        symbolList[Math.floor(Math.random() * symbolList.length)],
        symbolList[Math.floor(Math.random() * symbolList.length)],
        symbolList[Math.floor(Math.random() * symbolList.length)]
      ];
      
      setSymbols(finalSymbols);
      
      // Check for win
      if (finalSymbols[0] === finalSymbols[1] && finalSymbols[1] === finalSymbols[2]) {
        const multiplier = finalSymbols[0] === '🦍' ? 100 : 
                          finalSymbols[0] === '💎' ? 50 : 
                          finalSymbols[0] === '⭐' ? 25 : 10;
        setLastWin(betAmount * multiplier);
      }
      
      setIsSpinning(false);
    }, spinDuration);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white p-4">
      <div className="bg-black/50 backdrop-blur-lg rounded-3xl p-8 max-w-md w-full border border-purple-500/30 shadow-2xl">
        
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-4xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent mb-2">
            GORBAGANA
          </h1>
          <h2 className="text-3xl font-black bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
            TRASH RUSH
          </h2>
        </div>

        {/* Wallet Status */}
        <div className="text-center mb-6 p-3 bg-green-500/20 rounded-lg border border-green-500/30">
          <div className="text-green-400 font-bold">✅ Demo Mode Active</div>
          <div className="text-sm">Balance: {mockWallet.balance.toFixed(4)} GOR</div>
        </div>

        {/* Slot Machine */}
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 mb-6 border-2 border-purple-500/50">
          <div className="grid grid-cols-3 gap-4 mb-4">
            {symbols.map((symbol, index) => (
              <div 
                key={index}
                className={`aspect-square bg-black/50 rounded-xl flex items-center justify-center text-6xl border-2 ${
                  isSpinning ? 'border-yellow-400 animate-pulse' : 'border-gray-600'
                }`}
              >
                {symbol}
              </div>
            ))}
          </div>
          
          {/* Payline indicator */}
          <div className="h-1 bg-gradient-to-r from-transparent via-yellow-400 to-transparent rounded mb-4"></div>
          
          {lastWin > 0 && (
            <div className="text-center mb-4 p-3 bg-yellow-500/20 rounded-lg border border-yellow-500/30">
              <div className="text-yellow-400 font-bold text-xl">🎉 WIN! 🎉</div>
              <div className="text-2xl font-black">{lastWin.toFixed(4)} GOR</div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Bet Amount:</label>
            <select 
              value={betAmount} 
              onChange={(e) => setBetAmount(Number(e.target.value))}
              className="bg-gray-700 border border-gray-600 rounded px-3 py-1 text-white"
            >
              <option value={0.001}>0.001 GOR</option>
              <option value={0.01}>0.01 GOR</option>
              <option value={0.1}>0.1 GOR</option>
              <option value={1}>1 GOR</option>
            </select>
          </div>
          
          <button
            onClick={spin}
            disabled={isSpinning}
            className={`w-full py-4 rounded-xl font-black text-xl transition-all duration-200 ${
              isSpinning 
                ? 'bg-gray-600 cursor-not-allowed' 
                : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 active:scale-95'
            }`}
          >
            {isSpinning ? '🎰 SPINNING...' : '🎰 SPIN'}
          </button>
        </div>

        {/* Paytable */}
        <div className="mt-6 p-4 bg-black/30 rounded-xl">
          <h3 className="text-center font-bold mb-3">💰 PAYTABLE</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex justify-between"><span>🦍 Gorbagana</span><span className="text-yellow-400">100x</span></div>
            <div className="flex justify-between"><span>💎 Diamond</span><span className="text-blue-400">50x</span></div>
            <div className="flex justify-between"><span>⭐ Star</span><span className="text-purple-400">25x</span></div>
            <div className="flex justify-between"><span>🗑️ Trash</span><span className="text-green-400">10x</span></div>
          </div>
          <div className="text-center text-xs text-gray-400 mt-2">
            Match 3 symbols on the payline to win!
          </div>
        </div>
      </div>
    </div>
  );
};

// Navigation Component
const NavigationSidebar: React.FC<{
  activeSection: string;
  onSectionChange: (section: string) => void;
}> = ({ activeSection, onSectionChange }) => {
  const navItems = [
    { id: 'game', label: 'Game', icon: '🎰' },
    { id: 'paytable', label: 'Paytable', icon: '💰' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'help', label: 'Help', icon: '❓' },
  ];

  return (
    <div className="w-64 bg-black/80 backdrop-blur-xl border-r border-gray-600/20 h-screen flex flex-col">
      <div className="p-6">
        <h1 className="text-2xl font-black bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">
          GORBAGANA
        </h1>
        <h2 className="text-xl font-black bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">
          TRASH RUSH
        </h2>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              activeSection === item.id
                ? 'bg-gradient-to-r from-emerald-400 to-lime-400 text-black font-semibold'
                : 'text-emerald-100/70 hover:bg-emerald-400/10 hover:text-emerald-100'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
};

// Main Desktop Layout
const DesktopLayout: React.FC = () => {
  const [activeSection, setActiveSection] = useState('game');
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

  useEffect(() => {
    const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderContent = () => {
    switch (activeSection) {
      case 'game':
        return <SimpleSlotGame />;
      case 'paytable':
        return (
          <div className="p-8 text-white">
            <h2 className="text-4xl font-black text-center mb-8 bg-gradient-to-r from-green-400 to-emerald-400 bg-clip-text text-transparent">
              PAYTABLE
            </h2>
            <div className="max-w-2xl mx-auto space-y-4">
              {[
                { symbol: '🦍', name: 'Gorbagana', payout: '100x', rarity: 'Legendary' },
                { symbol: '💎', name: 'Diamond', payout: '50x', rarity: 'Epic' },
                { symbol: '⭐', name: 'Star', payout: '25x', rarity: 'Rare' },
                { symbol: '🗑️', name: 'Trash Bag', payout: '20x', rarity: 'Common' },
                { symbol: '🥡', name: 'Takeout', payout: '15x', rarity: 'Common' },
                { symbol: '🐟', name: 'Fish Bone', payout: '10x', rarity: 'Common' },
                { symbol: '🐀', name: 'Rat', payout: '5x', rarity: 'Common' },
                { symbol: '🍌', name: 'Banana Peel', payout: '2x', rarity: 'Common' }
              ].map((item, index) => (
                <div key={index} className="bg-black/40 rounded-xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-4xl">{item.symbol}</span>
                    <div>
                      <div className="font-bold">{item.name}</div>
                      <div className="text-sm text-gray-400">{item.rarity}</div>
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-yellow-400">{item.payout}</div>
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return (
          <div className="p-8 text-white text-center">
            <h2 className="text-3xl font-bold mb-4">{activeSection.toUpperCase()}</h2>
            <p>This section is coming soon!</p>
          </div>
        );
    }
  };

  if (!isDesktop) {
    return <SimpleSlotGame />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex">
      <NavigationSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
      <div className="flex-1">
        {renderContent()}
      </div>
    </div>
  );
};

// React App Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<DesktopLayout />);
} else {
  console.error('Root element not found!');
}
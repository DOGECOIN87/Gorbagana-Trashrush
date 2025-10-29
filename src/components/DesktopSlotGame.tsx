import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { IMAGES } from '../../assets.tsx';
import { TrashCanBackground } from './TrashCanBackground.tsx';

// Symbol configuration matching smart contract
const SYMBOLS = {
  gorbagana: { id: 0, name: 'gorbagana', payout: 100, weight: 1, img: IMAGES.gorbagana },
  wild: { id: 1, name: 'wild', payout: 50, weight: 2, img: IMAGES.wild },
  bonusChest: { id: 2, name: 'bonusChest', payout: 25, weight: 3, img: IMAGES.bonusChest },
  trash: { id: 3, name: 'trash', payout: 20, weight: 4, img: IMAGES.trashcan },
  takeout: { id: 4, name: 'takeout', payout: 15, weight: 5, img: IMAGES.takeout },
  fish: { id: 5, name: 'fish', payout: 10, weight: 6, img: IMAGES.fish },
  rat: { id: 6, name: 'rat', payout: 5, weight: 7, img: IMAGES.rat },
  banana: { id: 7, name: 'banana', payout: 2, weight: 8, img: IMAGES.banana },
};

type SymbolName = keyof typeof SYMBOLS;
type SymbolId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

interface DesktopSlotGameProps {
  wallet?: any;
  onSpin?: (betAmount: number) => Promise<{ symbols: [number, number, number], payout: number }>;
  isConnected?: boolean;
  balance?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  children: React.ReactNode;
}

// Navigation Sidebar Component
const NavigationSidebar: React.FC<{
  activeSection: string;
  onSectionChange: (section: string) => void;
}> = ({ activeSection, onSectionChange }) => {
  
  const navItems = [
    { id: 'game', label: 'Game', icon: '🎰' },
    { id: 'paytable', label: 'Paytable', icon: '💰' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
    { id: 'profile', label: 'Profile', icon: '👤' },
    { id: 'help', label: 'Help', icon: '❓' },
  ];

  return (
    <div className="w-64 bg-black/80 backdrop-blur-xl border-r border-gray-600/20 h-screen flex flex-col shadow-[0_0_60px_-15px_rgba(0,0,0,0.55)]">
      {/* Spacer for top title */}
      <div className="h-32"></div>
      {/* Navigation Items */}
      <nav className="flex-1 p-4 space-y-2">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onSectionChange(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
              activeSection === item.id
                ? 'bg-gradient-to-r from-emerald-400 via-lime-400 to-emerald-600 text-black font-semibold shadow-[0_0_14px_rgba(16,185,129,0.75)]'
                : 'text-emerald-100/70 hover:bg-emerald-400/10 hover:text-emerald-100 border border-emerald-300/10'
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

// Wallet Component with User Avatar
const WalletComponent: React.FC<{
  isConnected: boolean;
  balance: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  userAvatar?: string | null;
  username?: string;
}> = ({ isConnected, balance, onConnect, onDisconnect, userAvatar, username = 'Player' }) => {
  return (
    <div className="w-80 bg-black/80 backdrop-blur-xl border-l border-gray-600/20 border-b border-gray-600/20 p-4 shadow-[0_0_60px_-15px_rgba(0,0,0,0.55)]">
      {isConnected ? (
        <div className="space-y-3">
          {/* User Profile Section */}
          <div className="flex items-center gap-3 p-3 bg-emerald-900/20 rounded-lg border border-emerald-300/20">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-emerald-400 to-lime-400 flex items-center justify-center overflow-hidden border-2 border-emerald-400/50 flex-shrink-0">
              {userAvatar ? (
                <img 
                  src={userAvatar} 
                  alt="Profile" 
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-lg">👤</span>
              )}
            </div>
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="text-white font-medium text-sm truncate">{username}</div>
              <div className="text-green-400 text-xs font-bold">{balance.toFixed(4)} GOR</div>
            </div>
          </div>
          
          {/* Disconnect Button */}
          <button
            onClick={onDisconnect}
            className="w-full bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Disconnect Wallet
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-center">
            <h4 className="text-sm font-medium text-gray-300 mb-3">Connect Your Wallet</h4>
          </div>
          <button
            onClick={onConnect}
            className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-4 py-3 rounded-lg font-medium transition-all duration-200 transform hover:scale-105"
          >
            Connect Wallet
          </button>
        </div>
      )}
    </div>
  );
};

// Profile Section Component
const ProfileSection: React.FC<{
  userProfile: { username: string; avatar: string | null };
  onProfileUpdate: (profile: { username: string; avatar: string | null }) => void;
}> = ({ userProfile, onProfileUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempUsername, setTempUsername] = useState(userProfile.username);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        onProfileUpdate({ ...userProfile, avatar: result });
      };
      reader.readAsDataURL(file);
    }
  };

  const saveProfile = () => {
    onProfileUpdate({ ...userProfile, username: tempUsername });
    setIsEditing(false);
  };

  const cancelEdit = () => {
    setTempUsername(userProfile.username);
    setIsEditing(false);
  };

  return (
    <div className="flex-1 p-8">
      <h2 className="text-4xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-purple-400">
        PROFILE
      </h2>
      <div className="max-w-2xl mx-auto">
        <div className="bg-black/40 rounded-xl p-8 border border-pink-500/50">
          
          {/* Profile Image Section */}
          <div className="text-center mb-8">
            <div className="relative inline-block">
              <div className="w-32 h-32 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center mx-auto mb-4 overflow-hidden border-4 border-pink-500/50">
                {userProfile.avatar ? (
                  <img 
                    src={userProfile.avatar} 
                    alt="Profile" 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl">👤</span>
                )}
              </div>
              
              {/* Upload Button */}
              <label className="absolute bottom-0 right-0 bg-purple-600 hover:bg-purple-700 text-white p-2 rounded-full cursor-pointer transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
                <span className="text-sm">📷</span>
              </label>
            </div>
            
            {/* Username Section */}
            <div className="space-y-4">
              {isEditing ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2 text-white text-center text-xl font-bold"
                    placeholder="Enter username"
                    maxLength={20}
                  />
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={saveProfile}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                      Save
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <h3 className="text-2xl font-bold text-white">{userProfile.username}</h3>
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      setTempUsername(userProfile.username);
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Edit Username
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Profile Stats */}
          <div className="grid grid-cols-2 gap-6 mt-8">
            <div className="bg-black/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-green-400 mb-1">0</div>
              <div className="text-sm text-gray-400">Games Played</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400 mb-1">0.000</div>
              <div className="text-sm text-gray-400">Total Winnings (GOR)</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-blue-400 mb-1">0x</div>
              <div className="text-sm text-gray-400">Best Multiplier</div>
            </div>
            <div className="bg-black/30 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-purple-400 mb-1">Beginner</div>
              <div className="text-sm text-gray-400">Player Level</div>
            </div>
          </div>

          {/* Profile Actions */}
          <div className="mt-8 space-y-3">
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition-colors">
              🏆 View Achievements
            </button>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition-colors">
              📊 Game Statistics
            </button>
            <button className="w-full bg-slate-700 hover:bg-slate-600 text-white px-4 py-3 rounded-lg font-medium transition-colors">
              🎨 Customize Theme
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Chat Sidebar Component
const ChatSidebar: React.FC = () => {
  const [messages, setMessages] = useState([
    { id: 1, user: 'GamerPro', message: 'Just hit a big win! 🎉', timestamp: new Date(Date.now() - 300000) },
    { id: 2, user: 'SlotMaster', message: 'Nice! What symbol combo?', timestamp: new Date(Date.now() - 240000) },
    { id: 3, user: 'GamerPro', message: 'Triple Gorbagana! 100x multiplier', timestamp: new Date(Date.now() - 180000) },
    { id: 4, user: 'LuckyPlayer', message: 'Wow! That\'s amazing luck', timestamp: new Date(Date.now() - 120000) },
    { id: 5, user: 'CryptoKing', message: 'Anyone else getting good RNG today?', timestamp: new Date(Date.now() - 60000) },
    { id: 6, user: 'SlotFan', message: 'Been spinning for an hour, no luck yet 😅', timestamp: new Date(Date.now() - 30000) },
    { id: 7, user: 'WinnerCircle', message: 'Just got bonus chest! So excited!', timestamp: new Date(Date.now() - 15000) },
    { id: 8, user: 'GamerPro', message: 'Nice! Bonus rounds are the best', timestamp: new Date(Date.now() - 5000) },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [onlineUsers] = useState([
    { username: 'GamerPro', status: 'online' },
    { username: 'SlotMaster', status: 'online' },
    { username: 'LuckyPlayer', status: 'away' },
    { username: 'CryptoGambler', status: 'online' },
    { username: 'CryptoKing', status: 'online' },
    { username: 'SlotFan', status: 'online' },
    { username: 'WinnerCircle', status: 'online' },
  ]);

  const sendMessage = () => {
    if (newMessage.trim()) {
      const message = {
        id: messages.length + 1,
        user: 'You',
        message: newMessage.trim(),
        timestamp: new Date()
      };
      setMessages([...messages, message]);
      setNewMessage('');
    }
  };

  return (
    <div className="w-80 bg-black/80 backdrop-blur-xl border-l border-gray-600/20 flex flex-col flex-1 shadow-[0_0_60px_-15px_rgba(0,0,0,0.55)]">
      {/* Chat Header */}
      <div className="p-4 border-b border-fuchsia-500/30 flex-shrink-0">
        <h3 className="text-lg font-bold text-white text-center">Global Chat</h3>
      </div>

      {/* Messages - Scrollable Area */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3 min-h-0">
        {messages.map((msg) => (
          <div key={msg.id} className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center flex-shrink-0">
              <span className="text-xs">👤</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-white">{msg.user}</span>
                <span className="text-xs text-gray-400">
                  {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="text-sm text-gray-300 break-words">{msg.message}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Message Input - Always Visible at Bottom */}
      <div className="p-4 border-t border-fuchsia-500/30 flex-shrink-0 bg-black/80">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Type a message..."
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-400 focus:outline-none focus:border-purple-500"
            maxLength={200}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim()}
            className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors text-sm font-medium"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

const REEL_ROWS = 3;
const REEL_COLS = 3;
const DEFAULT_BET_AMOUNT = 0.01;

// Convert symbol ID to symbol name
const getSymbolNameById = (id: SymbolId): SymbolName => {
  const symbolEntries = Object.entries(SYMBOLS) as [SymbolName, typeof SYMBOLS[SymbolName]][];
  const found = symbolEntries.find(([_, symbol]) => symbol.id === id);
  return found ? found[0] : 'banana';
};

// Convert symbols array to grid format
const symbolsToGrid = (symbols: [number, number, number]): SymbolName[][] => {
  const symbolNames = Object.keys(SYMBOLS) as SymbolName[];
  const getRandomSymbol = () => symbolNames[Math.floor(Math.random() * symbolNames.length)];
  const paylineSymbols = symbols.map(id => getSymbolNameById(id as SymbolId));

  return [
    [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()],
    [paylineSymbols[0], paylineSymbols[1], paylineSymbols[2]],
    [getRandomSymbol(), getRandomSymbol(), getRandomSymbol()]
  ];
};

// Create initial random grid
const createInitialGrid = (): SymbolName[][] => {
  const symbolNames = Object.keys(SYMBOLS) as SymbolName[];
  const getRandomSymbol = () => symbolNames[Math.floor(Math.random() * symbolNames.length)];
  return Array(REEL_ROWS).fill(null).map(() =>
    Array(REEL_COLS).fill(null).map(getRandomSymbol)
  );
};

export const DesktopSlotGame: React.FC<DesktopSlotGameProps> = ({
  isConnected = false,
  balance = 0,
  onConnect,
  onDisconnect,
  children
}) => {
  const [activeSection, setActiveSection] = useState('game');
  const [userProfile, setUserProfile] = useState({ username: 'Player', avatar: null as string | null });

  const renderMainContent = () => {
    switch (activeSection) {
      case 'game':
        return (
          <div className="flex-1">
            {children}
          </div>
        );

      case 'paytable':
        return (
          <div className="flex-1 p-8">
            <h2 className="text-4xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-emerald-400">
              PAYTABLE
            </h2>
            <div className="grid grid-cols-2 gap-6 max-w-4xl mx-auto">
              {Object.entries(SYMBOLS)
                .sort((a, b) => b[1].payout - a[1].payout)
                .map(([symbolName, symbol]) => (
                  <div key={symbolName} className="bg-black/40 rounded-xl p-6 border border-green-500/50 flex items-center gap-4">
                    <img src={symbol.img} alt={symbolName} className="w-20 h-20 object-contain" />
                    <div>
                      <h3 className="text-xl font-bold capitalize text-white mb-1">{symbolName}</h3>
                      <div className="text-yellow-400 text-lg font-bold">{symbol.payout}x Multiplier</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        );

      case 'settings':
        return (
          <div className="flex-1 p-8">
            <h2 className="text-4xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">
              SETTINGS
            </h2>
            <div className="max-w-2xl mx-auto">
              <div className="bg-black/40 rounded-xl p-6 border border-cyan-500/50">
                <h3 className="text-xl font-bold mb-4 text-cyan-400">Game Settings</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-white">Sound Effects</span>
                    <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">ON</button>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-white">Animations</span>
                    <button className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold">ON</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'profile':
        return (
          <ProfileSection 
            userProfile={userProfile}
            onProfileUpdate={setUserProfile}
          />
        );

      case 'help':
        return (
          <div className="flex-1 p-8">
            <h2 className="text-4xl font-black text-center mb-8 text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-400">
              HELP & FAQ
            </h2>
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="bg-black/40 rounded-xl p-6 border border-yellow-500/50">
                <h3 className="text-xl font-bold mb-4 text-yellow-400">How to Play</h3>
                <div className="space-y-2 text-gray-300">
                  <p><strong>1. Connect Wallet:</strong> Click connect in the sidebar</p>
                  <p><strong>2. Set Bet:</strong> Choose your bet amount</p>
                  <p><strong>3. Spin:</strong> Click the SPIN button</p>
                  <p><strong>4. Win:</strong> Match 3 symbols on the middle row!</p>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="flex-1">
            {children}
          </div>
        );
    }
  };

  const titleShadowStyle = (color: string) => ({
    textShadow: `0 0 15px ${color}, 0 2px 2px rgba(0,0,0,0.7)`
  });

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#0b0b0c] text-white flex flex-col" style={{ fontFamily: "'Exo 2', sans-serif" }}>
      
      {/* Animated Background Orbs */}
      <div className="pointer-events-none absolute -top-48 -left-40 h-[40rem] w-[40rem] rounded-full blur-3xl opacity-30 bg-gradient-to-br from-green-500/70 via-emerald-800/40 to-lime-400/60 animate-[pulse_10s_ease-in-out_infinite]"></div>
      <div className="pointer-events-none absolute -bottom-64 -right-40 h-[42rem] w-[42rem] rounded-full blur-3xl opacity-25 bg-gradient-to-br from-emerald-400/70 via-green-600/40 to-lime-500/60 animate-[pulse_12s_ease-in-out_infinite]"></div>
      
      {/* Scattered Trash Can Background */}
      <TrashCanBackground />
      
      {/* Grid Pattern Overlay */}
      <div className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(0deg,_rgba(255,255,255,0.04)_0px,_rgba(255,255,255,0.04)_1px,_transparent_1px,_transparent_3px)] opacity-20"></div>
      
      {/* Top Left Title - Above everything */}
      <div className="absolute top-4 left-4 z-50 select-none bg-black/60 backdrop-blur-sm border-2 border-emerald-400/50 rounded-lg p-3 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
        <h1 className="text-2xl md:text-3xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-cyan-300 to-blue-600 drop-shadow-lg" style={titleShadowStyle('rgba(0,255,255,0.5)')}>
          Gorbagana
        </h1>
        <h2 className="text-2xl md:text-3xl font-black uppercase text-transparent bg-clip-text bg-gradient-to-b from-orange-400 to-amber-600 -mt-1 drop-shadow-lg" style={titleShadowStyle('rgba(255,165,0,0.5)')}>
          Trash Rush
        </h2>
      </div>
      
      {/* Main Layout Container */}
      <div className="flex flex-1">
        {/* Left Navigation Sidebar */}
        <NavigationSidebar
          activeSection={activeSection}
          onSectionChange={setActiveSection}
        />

        {/* Main Content Area */}
        <div className="flex-1 relative z-10">
          {renderMainContent()}
        </div>

        {/* Right Side - Wallet and Chat */}
        <div className="flex flex-col h-screen relative z-10">
          <WalletComponent
            isConnected={isConnected}
            balance={balance}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            userAvatar={userProfile.avatar}
            username={userProfile.username}
          />
          <ChatSidebar />
        </div>
      </div>
    </div>
  );
};
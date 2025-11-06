import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import { ConnectionProvider, WalletProvider, useWallet as useSolanaWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork, WalletError } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { BackpackWalletAdapter } from '@solana/wallet-adapter-backpack';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
// Import wallet adapter CSS - using import instead of require
import '@solana/wallet-adapter-react-ui/styles.css';

// Gorbagana network configuration
const GORBAGANA_RPC_ENDPOINT = 'https://rpc.gorbagana.wtf/';
const MAX_RETRY_ATTEMPTS = 3;
const BALANCE_UPDATE_INTERVAL = 10000; // 10 seconds
const LOCAL_STORAGE_KEY = 'gorbagana-wallet-state';

// Connection state types
interface ConnectionState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error?: {
    code: string;
    message: string;
    recoverable: boolean;
  };
  networkValid: boolean;
  lastConnected?: Date;
}

// Enhanced wallet context state
interface EnhancedWalletContextState {
  // Connection state
  isConnecting: boolean;
  isConnected: boolean;
  connectionError: string | null;
  
  // Network state
  isCorrectNetwork: boolean;
  networkError: string | null;
  
  // Wallet info
  publicKey: PublicKey | null;
  balance: number;
  
  // Actions
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchNetwork: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  
  // Internal state
  connectionState: ConnectionState;
  retryCount: number;
}

// Create enhanced wallet context
const EnhancedWalletContext = createContext<EnhancedWalletContextState | null>(null);

// Enhanced wallet provider component
const EnhancedWalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const solanaWallet = useSolanaWallet();
  const { connection } = useConnection();
  
  // State management
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
    networkValid: false,
  });
  const [balance, setBalance] = useState<number>(0);
  const [retryCount, setRetryCount] = useState<number>(0);
  const [balanceUpdateTimer, setBalanceUpdateTimer] = useState<NodeJS.Timeout | null>(null);

  // Validate network connection
  const validateNetwork = useCallback(async (): Promise<boolean> => {
    try {
      // For Gorbagana testnet, we'll check if we can connect to the RPC
      const slot = await connection.getSlot();
      return slot >= 0; // Basic validation that we can connect
    } catch (error) {
      console.error('Network validation failed:', error);
      return false;
    }
  }, [connection]);

  // Update balance
  const updateBalance = useCallback(async () => {
    if (!solanaWallet.publicKey || !connection) {
      setBalance(0);
      return;
    }

    try {
      const balanceLamports = await connection.getBalance(solanaWallet.publicKey);
      const balanceGOR = balanceLamports / LAMPORTS_PER_SOL;
      setBalance(balanceGOR);
    } catch (error) {
      console.error('Failed to update balance:', error);
    }
  }, [solanaWallet.publicKey, connection]);

  // Save connection state to localStorage
  const saveConnectionState = useCallback((state: ConnectionState) => {
    try {
      const stateToSave = {
        ...state,
        lastConnected: state.status === 'connected' ? new Date() : state.lastConnected,
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save connection state:', error);
    }
  }, []);

  // Load connection state from localStorage
  const loadConnectionState = useCallback((): ConnectionState | null => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          lastConnected: parsed.lastConnected ? new Date(parsed.lastConnected) : undefined,
        };
      }
    } catch (error) {
      console.error('Failed to load connection state:', error);
    }
    return null;
  }, []);

  // Handle connection errors
  const handleConnectionError = useCallback((error: any) => {
    let errorCode = 'UNKNOWN_ERROR';
    let errorMessage = 'An unknown error occurred';
    let recoverable = true;

    if (error instanceof WalletError) {
      errorCode = error.error?.code || 'WALLET_ERROR';
      errorMessage = error.message;
      recoverable = error.error?.code !== 'WALLET_NOT_FOUND';
    } else if (error?.code) {
      errorCode = error.code;
      errorMessage = error.message || 'Connection failed';
    } else if (error?.message) {
      errorMessage = error.message;
    }

    const newState: ConnectionState = {
      status: 'error',
      error: {
        code: errorCode,
        message: errorMessage,
        recoverable,
      },
      networkValid: false,
    };

    setConnectionState(newState);
    saveConnectionState(newState);
  }, [saveConnectionState]);

  // Connect wallet with retry logic
  const connect = useCallback(async () => {
    if (retryCount >= MAX_RETRY_ATTEMPTS) {
      handleConnectionError(new Error('Maximum retry attempts reached'));
      return;
    }

    setConnectionState(prev => ({ ...prev, status: 'connecting' }));

    try {
      // Connect to wallet
      await solanaWallet.connect();
      
      // Validate network
      const networkValid = await validateNetwork();
      
      if (!networkValid) {
        throw new Error('Invalid network. Please ensure you are connected to the Gorbagana testnet.');
      }

      // Update connection state
      const newState: ConnectionState = {
        status: 'connected',
        networkValid: true,
        lastConnected: new Date(),
      };
      
      setConnectionState(newState);
      saveConnectionState(newState);
      setRetryCount(0);
      
      // Start balance updates
      await updateBalance();
      
    } catch (error) {
      console.error('Connection failed:', error);
      setRetryCount(prev => prev + 1);
      handleConnectionError(error);
    }
  }, [solanaWallet, validateNetwork, updateBalance, retryCount, handleConnectionError, saveConnectionState]);

  // Disconnect wallet
  const disconnect = useCallback(async () => {
    try {
      await solanaWallet.disconnect();
      
      // Clear balance update timer
      if (balanceUpdateTimer) {
        clearInterval(balanceUpdateTimer);
        setBalanceUpdateTimer(null);
      }
      
      const newState: ConnectionState = {
        status: 'disconnected',
        networkValid: false,
      };
      
      setConnectionState(newState);
      saveConnectionState(newState);
      setBalance(0);
      setRetryCount(0);
      
    } catch (error) {
      console.error('Disconnect failed:', error);
      handleConnectionError(error);
    }
  }, [solanaWallet, balanceUpdateTimer, saveConnectionState, handleConnectionError]);

  // Switch network (placeholder - Backpack handles this)
  const switchNetwork = useCallback(async () => {
    try {
      // For Backpack wallet, we can't programmatically switch networks
      // We'll show a user-friendly message
      alert('Please manually switch to the Gorbagana testnet in your Backpack wallet settings.');
      
      // Re-validate network after user action
      setTimeout(async () => {
        const networkValid = await validateNetwork();
        setConnectionState(prev => ({
          ...prev,
          networkValid,
          error: networkValid ? undefined : {
            code: 'WRONG_NETWORK',
            message: 'Please switch to Gorbagana testnet in your wallet',
            recoverable: true,
          },
        }));
      }, 2000);
      
    } catch (error) {
      console.error('Network switch failed:', error);
      handleConnectionError(error);
    }
  }, [validateNetwork, handleConnectionError]);

  // Auto-reconnection logic
  useEffect(() => {
    const attemptAutoReconnect = async () => {
      const savedState = loadConnectionState();
      
      if (savedState?.lastConnected && savedState.status === 'connected') {
        const timeSinceLastConnection = Date.now() - savedState.lastConnected.getTime();
        
        // Auto-reconnect if last connection was within 24 hours
        if (timeSinceLastConnection < 24 * 60 * 60 * 1000) {
          console.log('Attempting auto-reconnection...');
          await connect();
        }
      }
    };

    // Only attempt auto-reconnect if not already connected
    if (!solanaWallet.connected && connectionState.status === 'disconnected') {
      attemptAutoReconnect();
    }
  }, [loadConnectionState, connect, solanaWallet.connected, connectionState.status]);

  // Monitor wallet connection changes
  useEffect(() => {
    if (solanaWallet.connected && solanaWallet.publicKey) {
      if (connectionState.status !== 'connected') {
        // Wallet connected externally, update our state
        validateNetwork().then(networkValid => {
          const newState: ConnectionState = {
            status: 'connected',
            networkValid,
            lastConnected: new Date(),
          };
          setConnectionState(newState);
          saveConnectionState(newState);
        });
      }
    } else if (!solanaWallet.connected && connectionState.status === 'connected') {
      // Wallet disconnected externally, update our state
      const newState: ConnectionState = {
        status: 'disconnected',
        networkValid: false,
      };
      setConnectionState(newState);
      saveConnectionState(newState);
      setBalance(0);
    }
  }, [solanaWallet.connected, solanaWallet.publicKey, connectionState.status, validateNetwork, saveConnectionState]);

  // Set up balance update timer
  useEffect(() => {
    if (solanaWallet.connected && solanaWallet.publicKey && connectionState.status === 'connected') {
      // Initial balance update
      updateBalance();
      
      // Set up periodic balance updates
      const timer = setInterval(updateBalance, BALANCE_UPDATE_INTERVAL);
      setBalanceUpdateTimer(timer);
      
      return () => {
        clearInterval(timer);
        setBalanceUpdateTimer(null);
      };
    }
  }, [solanaWallet.connected, solanaWallet.publicKey, connectionState.status, updateBalance]);

  // Context value
  const contextValue: EnhancedWalletContextState = {
    // Connection state
    isConnecting: connectionState.status === 'connecting',
    isConnected: connectionState.status === 'connected' && solanaWallet.connected,
    connectionError: connectionState.error?.message || null,
    
    // Network state
    isCorrectNetwork: connectionState.networkValid,
    networkError: connectionState.networkValid ? null : 'Please connect to Gorbagana testnet',
    
    // Wallet info
    publicKey: solanaWallet.publicKey,
    balance,
    
    // Actions
    connect,
    disconnect,
    switchNetwork,
    refreshBalance: updateBalance,
    
    // Internal state
    connectionState,
    retryCount,
  };

  return (
    <EnhancedWalletContext.Provider value={contextValue}>
      {children}
    </EnhancedWalletContext.Provider>
  );
};

// Hook to use enhanced wallet context
export const useEnhancedWallet = (): EnhancedWalletContextState => {
  const context = useContext(EnhancedWalletContext);
  if (!context) {
    throw new Error('useEnhancedWallet must be used within an EnhancedWalletProvider');
  }
  return context;
};

// Main wallet context provider props
interface WalletContextProviderProps {
    children: React.ReactNode;
}

// Main wallet context provider component
export const WalletContextProvider: React.FC<WalletContextProviderProps> = ({ children }) => {
    // Use Gorbagana network configuration
    const network = WalletAdapterNetwork.Devnet; // Will be overridden by endpoint
    const endpoint = GORBAGANA_RPC_ENDPOINT;

    const wallets = useMemo(
        () => [
            new BackpackWalletAdapter(),
        ],
        [network]
    );

    // Enhanced error handling
    const onError = useCallback((error: WalletError) => {
        console.error('Wallet adapter error:', error);
        // Error will be handled by EnhancedWalletProvider
    }, []);

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider 
              wallets={wallets} 
              autoConnect={false} // We handle auto-connect in EnhancedWalletProvider
              onError={onError}
            >
                <WalletModalProvider>
                    <EnhancedWalletProvider>
                        {children}
                    </EnhancedWalletProvider>
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

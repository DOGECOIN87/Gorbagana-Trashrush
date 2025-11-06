import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useEnhancedWallet, WalletContextProvider } from './useWallet';

// Mock Solana wallet adapter
const mockSolanaWallet = {
  publicKey: {
    toString: () => 'mock-public-key-string',
    toBuffer: () => Buffer.from('mock-public-key')
  },
  connected: false,
  connecting: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const mockConnection = {
  getSlot: vi.fn(),
  getBalance: vi.fn(),
  getRecentBlockhash: vi.fn(),
};

// Mock wallet adapter hooks
vi.mock('@solana/wallet-adapter-react', () => ({
  ConnectionProvider: ({ children }: any) => children,
  WalletProvider: ({ children }: any) => children,
  useWallet: () => mockSolanaWallet,
  useConnection: () => ({ connection: mockConnection }),
}));

// Mock wallet adapter UI
vi.mock('@solana/wallet-adapter-react-ui', () => ({
  WalletModalProvider: ({ children }: any) => children,
}));

// Mock wallet adapters
vi.mock('@solana/wallet-adapter-backpack', () => ({
  BackpackWalletAdapter: class MockBackpackWalletAdapter {
    name = 'Backpack';
    url = 'https://backpack.app';
    icon = 'backpack-icon';
    publicKey = null;
    connected = false;
    connecting = false;
    readyState = 'Installed';
    supportedTransactionVersions = new Set(['legacy', 0]);
    
    connect = vi.fn();
    disconnect = vi.fn();
    on = vi.fn();
    off = vi.fn();
    emit = vi.fn();
    
    constructor() {
      // Mock constructor logic
    }
  },
}));

// Mock Solana web3
vi.mock('@solana/web3.js', () => ({
  PublicKey: vi.fn(),
  LAMPORTS_PER_SOL: 1000000000,
}));

// Mock wallet adapter base
vi.mock('@solana/wallet-adapter-base', () => ({
  WalletAdapterNetwork: {
    Devnet: 'devnet',
  },
  WalletError: class WalletError extends Error {
    constructor(message: string, public error?: any) {
      super(message);
    }
  },
}));

// Mock CSS import
vi.mock('@solana/wallet-adapter-react-ui/styles.css', () => ({}));

describe('useWallet - Integration Tests', () => {
  // Mock localStorage
  const mockLocalStorage = {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup localStorage mock
    Object.defineProperty(window, 'localStorage', {
      value: mockLocalStorage,
      writable: true,
    });
    
    // Setup default mock implementations
    mockConnection.getSlot.mockResolvedValue(100);
    mockConnection.getBalance.mockResolvedValue(5000000000); // 5 SOL
    mockLocalStorage.getItem.mockReturnValue(null);
    
    // Reset wallet state
    mockSolanaWallet.connected = false;
    mockSolanaWallet.connecting = false;
    mockSolanaWallet.publicKey = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderWithProvider = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <WalletContextProvider>{children}</WalletContextProvider>
    );
    
    return renderHook(() => useEnhancedWallet(), { wrapper });
  };

  describe('Wallet Connection Flow', () => {
    it('starts in disconnected state', () => {
      // Act: Render hook
      const { result } = renderWithProvider();

      // Assert: Initial state is disconnected
      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.publicKey).toBeNull();
      expect(result.current.balance).toBe(0);
      expect(result.current.connectionError).toBeNull();
    });

    it('handles successful wallet connection', async () => {
      // Arrange: Mock successful connection
      mockSolanaWallet.connect.mockResolvedValue(undefined);
      mockSolanaWallet.publicKey = {
        toString: () => 'connected-public-key',
        toBuffer: () => Buffer.from('connected-public-key')
      };

      const { result } = renderWithProvider();

      // Act: Connect wallet
      await act(async () => {
        await result.current.connect();
      });

      // Simulate wallet state change
      await act(async () => {
        mockSolanaWallet.connected = true;
      });

      // Assert: Connection successful
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
      
      expect(result.current.isConnecting).toBe(false);
      expect(result.current.publicKey).toBeTruthy();
      expect(result.current.connectionError).toBeNull();
      expect(mockSolanaWallet.connect).toHaveBeenCalled();
    });

    it('handles wallet connection errors', async () => {
      // Arrange: Mock connection error
      const connectionError = new Error('User rejected connection');
      mockSolanaWallet.connect.mockRejectedValue(connectionError);

      const { result } = renderWithProvider();

      // Act: Attempt connection
      await act(async () => {
        try {
          await result.current.connect();
        } catch (error) {
          // Expected to fail
        }
      });

      // Assert: Error state set
      await waitFor(() => {
        expect(result.current.connectionError).toBeTruthy();
      });
      
      expect(result.current.isConnected).toBe(false);
      expect(result.current.connectionState.status).toBe('error');
    });

    it('handles wallet disconnection', async () => {
      // Arrange: Start with connected wallet
      mockSolanaWallet.connected = true;
      mockSolanaWallet.publicKey = {
        toString: () => 'connected-public-key',
        toBuffer: () => Buffer.from('connected-public-key')
      };

      const { result } = renderWithProvider();

      // Wait for initial connection state
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Act: Disconnect wallet
      await act(async () => {
        await result.current.disconnect();
      });

      // Simulate wallet state change
      await act(async () => {
        mockSolanaWallet.connected = false;
        mockSolanaWallet.publicKey = null;
      });

      // Assert: Disconnection successful
      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });
      
      expect(result.current.publicKey).toBeNull();
      expect(result.current.balance).toBe(0);
      expect(mockSolanaWallet.disconnect).toHaveBeenCalled();
    });
  });

  describe('Network Validation', () => {
    it('validates network connection successfully', async () => {
      // Arrange: Mock successful network validation
      mockConnection.getSlot.mockResolvedValue(150);
      mockSolanaWallet.connect.mockResolvedValue(undefined);
      mockSolanaWallet.publicKey = {
        toString: () => 'network-test-key',
        toBuffer: () => Buffer.from('network-test-key')
      };

      const { result } = renderWithProvider();

      // Act: Connect with network validation
      await act(async () => {
        await result.current.connect();
      });

      // Simulate successful connection
      await act(async () => {
        mockSolanaWallet.connected = true;
      });

      // Assert: Network validation passed
      await waitFor(() => {
        expect(result.current.isCorrectNetwork).toBe(true);
      });
      
      expect(result.current.networkError).toBeNull();
      expect(mockConnection.getSlot).toHaveBeenCalled();
    });

    it('handles network validation failure', async () => {
      // Arrange: Mock network validation failure
      mockConnection.getSlot.mockRejectedValue(new Error('Network unreachable'));
      mockSolanaWallet.connect.mockResolvedValue(undefined);

      const { result } = renderWithProvider();

      // Act: Attempt connection with network failure
      await act(async () => {
        try {
          await result.current.connect();
        } catch (error) {
          // Expected to fail due to network
        }
      });

      // Assert: Network error handled
      await waitFor(() => {
        expect(result.current.connectionError).toBeTruthy();
      });
      
      expect(result.current.isCorrectNetwork).toBe(false);
    });

    it('provides network switching guidance', async () => {
      // Arrange: Mock network switch request
      const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
      
      const { result } = renderWithProvider();

      // Act: Request network switch
      await act(async () => {
        await result.current.switchNetwork();
      });

      // Assert: User guidance provided
      expect(alertSpy).toHaveBeenCalledWith(
        'Please manually switch to the Gorbagana testnet in your Backpack wallet settings.'
      );
      
      alertSpy.mockRestore();
    });
  });

  describe('Balance Management', () => {
    it('updates balance when wallet connects', async () => {
      // Arrange: Mock wallet with balance
      const mockBalance = 7500000000; // 7.5 SOL
      mockConnection.getBalance.mockResolvedValue(mockBalance);
      mockSolanaWallet.connect.mockResolvedValue(undefined);
      mockSolanaWallet.publicKey = {
        toString: () => 'balance-test-key',
        toBuffer: () => Buffer.from('balance-test-key')
      };

      const { result } = renderWithProvider();

      // Act: Connect wallet
      await act(async () => {
        await result.current.connect();
      });

      // Simulate connection
      await act(async () => {
        mockSolanaWallet.connected = true;
      });

      // Assert: Balance updated
      await waitFor(() => {
        expect(result.current.balance).toBe(7.5);
      });
      
      expect(mockConnection.getBalance).toHaveBeenCalledWith(mockSolanaWallet.publicKey);
    });

    it('refreshes balance on demand', async () => {
      // Arrange: Connected wallet
      mockSolanaWallet.connected = true;
      mockSolanaWallet.publicKey = {
        toString: () => 'refresh-test-key',
        toBuffer: () => Buffer.from('refresh-test-key')
      };
      
      const initialBalance = 5000000000; // 5 SOL
      const updatedBalance = 3000000000; // 3 SOL
      
      mockConnection.getBalance
        .mockResolvedValueOnce(initialBalance)
        .mockResolvedValueOnce(updatedBalance);

      const { result } = renderWithProvider();

      // Wait for initial balance
      await waitFor(() => {
        expect(result.current.balance).toBe(5);
      });

      // Act: Refresh balance
      await act(async () => {
        await result.current.refreshBalance();
      });

      // Assert: Balance updated
      await waitFor(() => {
        expect(result.current.balance).toBe(3);
      });
      
      expect(mockConnection.getBalance).toHaveBeenCalledTimes(2);
    });

    it('handles balance refresh errors gracefully', async () => {
      // Arrange: Connected wallet with balance error
      mockSolanaWallet.connected = true;
      mockSolanaWallet.publicKey = {
        toString: () => 'error-test-key',
        toBuffer: () => Buffer.from('error-test-key')
      };
      
      mockConnection.getBalance.mockRejectedValue(new Error('Balance fetch failed'));

      const { result } = renderWithProvider();

      // Act: Attempt balance refresh
      await act(async () => {
        await result.current.refreshBalance();
      });

      // Assert: Error handled gracefully (balance remains 0)
      expect(result.current.balance).toBe(0);
    });
  });

  describe('Auto-reconnection', () => {
    it('attempts auto-reconnection with recent connection', async () => {
      // Arrange: Mock recent connection in localStorage
      const recentConnection = {
        status: 'connected',
        networkValid: true,
        lastConnected: new Date(Date.now() - 1000 * 60 * 30), // 30 minutes ago
      };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(recentConnection));
      mockSolanaWallet.connect.mockResolvedValue(undefined);

      // Act: Render hook (should trigger auto-reconnection)
      renderWithProvider();

      // Assert: Auto-reconnection attempted
      await waitFor(() => {
        expect(mockSolanaWallet.connect).toHaveBeenCalled();
      });
    });

    it('skips auto-reconnection for old connections', async () => {
      // Arrange: Mock old connection in localStorage
      const oldConnection = {
        status: 'connected',
        networkValid: true,
        lastConnected: new Date(Date.now() - 1000 * 60 * 60 * 25), // 25 hours ago
      };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(oldConnection));

      // Act: Render hook
      renderWithProvider();

      // Wait a bit to ensure no auto-reconnection
      await new Promise(resolve => setTimeout(resolve, 100));

      // Assert: No auto-reconnection attempted
      expect(mockSolanaWallet.connect).not.toHaveBeenCalled();
    });
  });

  describe('Connection State Persistence', () => {
    it('saves connection state to localStorage', async () => {
      // Arrange: Mock successful connection
      mockSolanaWallet.connect.mockResolvedValue(undefined);
      mockSolanaWallet.publicKey = {
        toString: () => 'persist-test-key',
        toBuffer: () => Buffer.from('persist-test-key')
      };

      const { result } = renderWithProvider();

      // Act: Connect wallet
      await act(async () => {
        await result.current.connect();
      });

      // Simulate connection
      await act(async () => {
        mockSolanaWallet.connected = true;
      });

      // Assert: State saved to localStorage
      await waitFor(() => {
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'gorbagana-wallet-state',
          expect.stringContaining('"status":"connected"')
        );
      });
    });

    it('loads connection state from localStorage', () => {
      // Arrange: Mock saved connection state
      const savedState = {
        status: 'disconnected',
        networkValid: false,
        lastConnected: new Date(Date.now() - 1000 * 60 * 10), // 10 minutes ago
      };
      
      mockLocalStorage.getItem.mockReturnValue(JSON.stringify(savedState));

      // Act: Render hook
      const { result } = renderWithProvider();

      // Assert: State loaded from localStorage
      expect(result.current.connectionState.status).toBe('disconnected');
      expect(mockLocalStorage.getItem).toHaveBeenCalledWith('gorbagana-wallet-state');
    });
  });

  describe('Error Recovery', () => {
    it('handles retry attempts correctly', async () => {
      // Arrange: Mock connection that fails then succeeds
      mockSolanaWallet.connect
        .mockRejectedValueOnce(new Error('First attempt failed'))
        .mockRejectedValueOnce(new Error('Second attempt failed'))
        .mockResolvedValueOnce(undefined);

      const { result } = renderWithProvider();

      // Act: Multiple connection attempts
      await act(async () => {
        try {
          await result.current.connect();
        } catch (error) {
          // First attempt fails
        }
      });

      await act(async () => {
        try {
          await result.current.connect();
        } catch (error) {
          // Second attempt fails
        }
      });

      await act(async () => {
        await result.current.connect(); // Third attempt succeeds
      });

      // Assert: Retry count managed correctly
      expect(result.current.retryCount).toBeGreaterThan(0);
      expect(mockSolanaWallet.connect).toHaveBeenCalledTimes(3);
    });

    it('stops retrying after maximum attempts', async () => {
      // Arrange: Mock connection that always fails
      mockSolanaWallet.connect.mockRejectedValue(new Error('Connection always fails'));

      const { result } = renderWithProvider();

      // Act: Attempt connection multiple times
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          try {
            await result.current.connect();
          } catch (error) {
            // Expected to fail
          }
        });
      }

      // Assert: Retry limit enforced
      expect(result.current.connectionError).toBeTruthy();
      expect(result.current.connectionError).toContain('Maximum retry attempts reached');
    });
  });

  describe('External Wallet State Changes', () => {
    it('detects external wallet connection', async () => {
      // Arrange: Start disconnected
      const { result } = renderWithProvider();
      
      expect(result.current.isConnected).toBe(false);

      // Act: Simulate external wallet connection
      await act(async () => {
        mockSolanaWallet.connected = true;
        mockSolanaWallet.publicKey = {
          toString: () => 'external-connect-key',
          toBuffer: () => Buffer.from('external-connect-key')
        };
      });

      // Assert: State updated to reflect external connection
      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });
    });

    it('detects external wallet disconnection', async () => {
      // Arrange: Start connected
      mockSolanaWallet.connected = true;
      mockSolanaWallet.publicKey = {
        toString: () => 'external-disconnect-key',
        toBuffer: () => Buffer.from('external-disconnect-key')
      };

      const { result } = renderWithProvider();

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Act: Simulate external wallet disconnection
      await act(async () => {
        mockSolanaWallet.connected = false;
        mockSolanaWallet.publicKey = null;
      });

      // Assert: State updated to reflect external disconnection
      await waitFor(() => {
        expect(result.current.isConnected).toBe(false);
      });
      
      expect(result.current.balance).toBe(0);
    });
  });
});
import React, { createContext, useContext, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import {
    BackpackWalletAdapter,
} from '@solana/wallet-adapter-backpack';
import { clusterApiUrl } from '@solana/web3.js';

// Import wallet adapter CSS
require('@solana/wallet-adapter-react-ui/styles.css');

interface WalletContextProviderProps {
    children: React.ReactNode;
}

export const WalletContextProvider: React.FC<WalletContextProviderProps> = ({ children }) => {
    // Use Gorbagana network instead of default Solana networks
    const network = WalletAdapterNetwork.Devnet; // Will be overridden by endpoint
    const endpoint = 'https://rpc.gorbagana.wtf/';

    const wallets = useMemo(
        () => [
            new BackpackWalletAdapter(),
        ],
        [network]
    );

    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    {children}
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    );
};

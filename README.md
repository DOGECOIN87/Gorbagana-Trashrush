# Gorbagana Slots dApp

A decentralized slots game built on the Gorbagana blockchain using Solana's tools and Anchor framework. This project includes a complete smart contract implementation and a React frontend with blockchain integration.

## 🎮 Features

- **Smart Contract**: Written in Rust using Anchor framework
- **Frontend**: Modern React application with TypeScript
- **Wallet Integration**: Support for Phantom, Solflare, and other Solana wallets
- **Demo Mode**: Test the game locally without blockchain connection
- **Real Blockchain**: Deploy and play with real GOR tokens on Gorbagana testnet
- **Responsive Design**: Mobile-friendly slot machine interface

## 🚀 Quick Start (Demo Mode)

The application is ready to run in demo mode without any blockchain setup:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm run dev
   ```

3. **Open in browser**: Navigate to `http://localhost:3000`

4. **Play the demo**: Click "Connect Demo Wallet" to simulate blockchain interactions

## 🔧 Blockchain Setup (Real Deployment)

### Prerequisites

- Node.js 16+ and npm
- Rust and Cargo
- Solana CLI tools
- Anchor CLI
- GOR tokens for testnet deployment

### Environment Setup

1. **Create environment file** (`.env`):
   ```plaintext
   ANCHOR_WALLET=~/.config/solana/id.json
   GORBAGANA_CLUSTER_URL=https://rpc.gorbagana.wtf/
   ```

2. **Generate or configure your wallet**:
   ```bash
   solana-keygen new --outfile ~/.config/solana/id.json
   ```

3. **Set Solana CLI to use Gorbagana cluster**:
   ```bash
   solana config set --url https://rpc.gorbagana.wtf/
   ```

4. **Check your wallet balance**:
   ```bash
   solana balance
   ```

### Smart Contract Deployment

1. **Build the smart contract**:
   ```bash
   anchor build
   ```

2. **Deploy to Gorbagana testnet**:
   ```bash
   anchor deploy --provider.cluster https://rpc.gorbagana.wtf/
   ```

3. **Copy the program ID** from the deployment output and update:
   - `programs/gorbagana_slots/src/lib.rs` (declare_id! line)
   - `src/hooks/useProgram.tsx` (PROGRAM_ID constant)
   - `Anchor.toml` (program ID)

4. **Rebuild after updating program ID**:
   ```bash
   anchor build
   anchor deploy --provider.cluster https://rpc.gorbagana.wtf/
   ```

### Frontend Integration

1. **Update the frontend to use real blockchain** by modifying `index.tsx`:
   - Replace the demo wallet connection with real wallet adapter
   - Use the actual program hooks instead of simulation

2. **Start the application**:
   ```bash
   npm run dev
   ```

## 🎯 Game Mechanics

### Symbols and Payouts
- **Gorbagana** (🦍): 50x multiplier (rarest)
- **Trash Bag** (🗑️): 25x multiplier  
- **Takeout** (🥡): 20x multiplier
- **Fish Bone** (🐟): 15x multiplier
- **Rat** (🐀): 10x multiplier
- **Banana Peel** (🍌): 5x multiplier

### Winning Conditions
- **Three of a kind**: Full payout based on symbol multiplier
- **Two of a kind**: 2x bet amount
- **No match**: No payout

### Betting
- Minimum bet: 0.001 GOR
- Maximum bet: 1 GOR
- Adjustable bet amounts via dropdown

## 📁 Project Structure

```
gorbagana-slots/
├── programs/gorbagana_slots/     # Smart contract (Rust/Anchor)
│   ├── src/lib.rs               # Main contract logic
│   └── Cargo.toml               # Rust dependencies
├── src/                         # Frontend source
│   ├── components/              # React components
│   └── hooks/                   # Custom React hooks
├── assets/                      # Game images and assets
├── Anchor.toml                  # Anchor configuration
├── package.json                 # Node.js dependencies
└── vite.config.ts              # Vite build configuration
```

## 🛠️ Development Commands

```bash
# Frontend development
npm run dev              # Start development server
npm run build           # Build for production
npm run preview         # Preview production build

# Smart contract development  
anchor build            # Build smart contract
anchor test            # Run contract tests
anchor deploy          # Deploy to configured cluster

# Combined commands
npm run anchor-build    # Build smart contract via npm
npm run anchor-deploy   # Deploy smart contract via npm
```

## 🔗 Links

- **Gorbagana Network**: [https://gorbagana.wtf/](https://gorbagana.wtf/)
- **Gorbagana RPC**: `https://rpc.gorbagana.wtf/`
- **Gorbagana Docs**: [https://docs.gorbagana.wtf/](https://docs.gorbagana.wtf/)

## 🎮 How to Play

1. **Connect Wallet**: Click the wallet connect button (demo or real)
2. **Select Bet**: Choose your bet amount from the dropdown
3. **Spin**: Click the spin button to play
4. **Win**: Match symbols to earn payouts
5. **Repeat**: Continue playing with your winnings

## 🐛 Troubleshooting

- **TypeScript errors**: Ensure all dependencies are installed with `npm install`
- **Build failures**: Check that Rust and Anchor are properly installed
- **Wallet connection issues**: Verify you have a compatible Solana wallet extension
- **RPC errors**: Ensure the Gorbagana RPC endpoint is accessible

The application is now complete and ready for both demo usage and real blockchain deployment! 🚀

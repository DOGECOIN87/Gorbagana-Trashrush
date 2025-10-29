#!/bin/bash

# Gorbagana Deployment Environment Verification Script

echo "🔍 Verifying Gorbagana deployment environment..."
echo ""

# Check Solana CLI
echo "📋 Solana CLI Configuration:"
solana config get
echo ""

# Check network connection
echo "🌐 Network Connection:"
echo "Cluster version: $(solana cluster-version)"
echo ""

# Check wallet
echo "💳 Wallet Information:"
echo "Address: $(solana address)"
echo "Balance: $(solana balance) (Note: Shows as SOL but is actually GOR on Gorbagana)"
echo ""

# Check Anchor
echo "⚓ Anchor CLI:"
if command -v anchor &> /dev/null; then
    echo "✅ Anchor CLI installed: $(anchor --version)"
else
    echo "❌ Anchor CLI not found"
fi
echo ""

# Check environment file
echo "📄 Environment Configuration:"
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    echo "Configured cluster: $(grep GORBAGANA_CLUSTER_URL .env | cut -d'=' -f2)"
    echo "Deployer wallet: $(grep DEPLOYER_WALLET .env | cut -d'=' -f2)"
else
    echo "❌ .env file not found"
fi
echo ""

# Check if ready for deployment
BALANCE=$(solana balance | cut -d' ' -f1)
if (( $(echo "$BALANCE > 0" | bc -l) )); then
    echo "✅ Ready for deployment! You have $BALANCE GOR tokens."
else
    echo "⚠️  Need GOR tokens for deployment. Current balance: $BALANCE"
    echo "   Try: solana airdrop 1"
    echo "   Or request tokens from the Gorbagana community"
fi
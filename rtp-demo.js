// Quick RTP demonstration
const SYMBOL_CONFIG = {
  gorbagana: { id: 0, payout: 100, weight: 1 },
  wild: { id: 1, payout: 50, weight: 2 },
  bonusChest: { id: 2, payout: 25, weight: 3 },
  trash: { id: 3, payout: 20, weight: 4 },
  takeout: { id: 4, payout: 15, weight: 5 },
  fish: { id: 5, payout: 10, weight: 6 },
  rat: { id: 6, payout: 5, weight: 7 },
  banana: { id: 7, payout: 2, weight: 8 },
};

function calculateRTP() {
  const totalWeight = Object.values(SYMBOL_CONFIG).reduce((sum, symbol) => sum + symbol.weight, 0);
  let totalExpectedPayout = 0;
  
  console.log('🎰 GORBAGANA SLOTS RTP ANALYSIS');
  console.log('===============================\n');
  
  console.log('Symbol Analysis:');
  console.log('----------------');
  
  for (const [name, symbol] of Object.entries(SYMBOL_CONFIG)) {
    const probability = symbol.weight / totalWeight;
    const winProbability = Math.pow(probability, 3); // Three of a kind
    const contribution = winProbability * symbol.payout;
    totalExpectedPayout += contribution;
    
    console.log(`${name.padEnd(12)}: ${(winProbability * 100).toFixed(4)}% chance, ${symbol.payout}x payout, ${(contribution * 100).toFixed(4)}% RTP contribution`);
  }
  
  const baseRTP = totalExpectedPayout * 100;
  const jackpotRTP = 2.5; // Estimated
  const totalRTP = baseRTP + jackpotRTP;
  const houseEdge = 100 - totalRTP;
  
  console.log('\nRTP Summary:');
  console.log('------------');
  console.log(`Base RTP: ${baseRTP.toFixed(2)}%`);
  console.log(`Jackpot RTP: ${jackpotRTP.toFixed(2)}%`);
  console.log(`Total RTP: ${totalRTP.toFixed(2)}%`);
  console.log(`House Edge: ${houseEdge.toFixed(2)}%`);
  console.log(`Status: ${houseEdge <= 5.5 ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}`);
  
  if (houseEdge > 5.5) {
    console.log('\n🚨 CRITICAL ISSUES:');
    console.log('-------------------');
    console.log(`• House edge is ${(houseEdge - 5).toFixed(2)}% above target`);
    console.log(`• RTP is ${(95 - totalRTP).toFixed(2)}% below target`);
    console.log('• Players will lose money extremely quickly');
    console.log('• Configuration violates gambling regulations');
    
    console.log('\n🔧 RECOMMENDED FIX:');
    console.log('-------------------');
    const multiplier = 95 / totalRTP;
    console.log(`Multiply all payouts by ${multiplier.toFixed(2)}x:`);
    
    for (const [name, symbol] of Object.entries(SYMBOL_CONFIG)) {
      const newPayout = Math.round(symbol.payout * multiplier);
      console.log(`• ${name}: ${symbol.payout}x → ${newPayout}x`);
    }
  }
}

calculateRTP();
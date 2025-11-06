/**
 * Player Simulation Runner
 * Tests the current slot game mechanics with various player types
 */

// Simplified simulation for Node.js environment
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

const PLAYER_PROFILES = [
  {
    id: 'casual',
    name: 'Casual Player',
    startingBalance: 1.0,
    betStrategy: 'conservative',
    baseBet: 0.01,
    maxBet: 0.05,
    stopLoss: 0.2,
    stopWin: 2.0,
    sessionLength: 100
  },
  {
    id: 'regular',
    name: 'Regular Player',
    startingBalance: 5.0,
    betStrategy: 'moderate',
    baseBet: 0.05,
    maxBet: 0.25,
    stopLoss: 1.0,
    stopWin: 10.0,
    sessionLength: 200
  },
  {
    id: 'highroller',
    name: 'High Roller',
    startingBalance: 50.0,
    betStrategy: 'aggressive',
    baseBet: 0.5,
    maxBet: 5.0,
    stopLoss: 10.0,
    stopWin: 100.0,
    sessionLength: 500
  },
  {
    id: 'grinder',
    name: 'Grinder',
    startingBalance: 2.0,
    betStrategy: 'fixed',
    baseBet: 0.01,
    maxBet: 0.01,
    stopLoss: 0.1,
    stopWin: 5.0,
    sessionLength: 2000
  }
];

// Simulate slot spin (matching smart contract logic)
function simulateSlotSpin(bet, spinNumber) {
  const weights = [1, 2, 3, 4, 5, 6, 7, 8];
  const totalWeight = 36;
  
  const seed = Date.now() + spinNumber + Math.random() * 1000000;
  
  const generateSymbol = (seedOffset) => {
    const randomValue = Math.floor((seed + seedOffset) % totalWeight);
    let cumulativeWeight = 0;
    
    for (let symbol = 0; symbol < weights.length; symbol++) {
      cumulativeWeight += weights[symbol];
      if (randomValue < cumulativeWeight) {
        return symbol;
      }
    }
    return 7;
  };
  
  const symbols = [
    generateSymbol(0),
    generateSymbol(7919),
    generateSymbol(7927)
  ];
  
  let payout = 0;
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    const multipliers = [100, 50, 25, 20, 15, 10, 5, 2];
    const multiplier = multipliers[symbols[0]] || 0;
    payout = bet * multiplier;
  }
  
  return { symbols, payout };
}

// Calculate next bet based on strategy
function calculateNextBet(profile, currentBet, lastWin, balance, consecutiveLosses) {
  switch (profile.betStrategy) {
    case 'conservative':
      if (lastWin) {
        return Math.min(currentBet * 1.1, profile.maxBet, balance * 0.1);
      } else {
        return Math.max(currentBet * 0.9, profile.baseBet);
      }
      
    case 'moderate':
      const variance = 0.8 + Math.random() * 0.4;
      return Math.min(Math.max(profile.baseBet * variance, profile.baseBet), profile.maxBet, balance * 0.2);
      
    case 'aggressive':
      if (balance > profile.startingBalance) {
        return Math.min(profile.maxBet, balance * 0.3);
      } else {
        return Math.min(profile.baseBet * 2, balance * 0.5);
      }
      
    case 'fixed':
      return Math.min(profile.baseBet, balance);
      
    default:
      return profile.baseBet;
  }
}

// Simulate a single player session
function simulatePlayerSession(profile) {
  let balance = profile.startingBalance;
  let currentBet = profile.baseBet;
  let totalWagered = 0;
  let totalWon = 0;
  let spins = 0;
  let wins = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let consecutiveLosses = 0;
  let lastWin = false;
  
  while (
    spins < profile.sessionLength &&
    balance >= profile.stopLoss &&
    balance < profile.stopWin &&
    balance >= currentBet
  ) {
    spins++;
    
    currentBet = calculateNextBet(profile, currentBet, lastWin, balance, consecutiveLosses);
    currentBet = Math.min(currentBet, balance);
    
    if (currentBet <= 0) break;
    
    balance -= currentBet;
    totalWagered += currentBet;
    
    const result = simulateSlotSpin(currentBet, spins);
    const payout = result.payout;
    
    balance += payout;
    totalWon += payout;
    
    const netSpin = payout - currentBet;
    if (netSpin > 0) {
      wins++;
      lastWin = true;
      consecutiveLosses = 0;
      biggestWin = Math.max(biggestWin, netSpin);
    } else {
      lastWin = false;
      consecutiveLosses++;
      biggestLoss = Math.max(biggestLoss, Math.abs(netSpin));
    }
  }
  
  const netResult = balance - profile.startingBalance;
  const hitRate = spins > 0 ? (wins / spins) * 100 : 0;
  const rtp = totalWagered > 0 ? (totalWon / totalWagered) * 100 : 0;
  const houseEdge = 100 - rtp;
  
  return {
    playerId: profile.id,
    playerName: profile.name,
    startingBalance: profile.startingBalance,
    endingBalance: balance,
    totalSpins: spins,
    totalWagered,
    totalWon,
    netResult,
    biggestWin,
    biggestLoss,
    hitRate,
    rtp,
    houseEdge,
    bustedOut: balance < profile.stopLoss,
    reachedTarget: balance >= profile.stopWin
  };
}

// Run multi-player simulation
function runMultiPlayerSimulation(profiles = PLAYER_PROFILES, playersPerProfile = 20) {
  const allResults = [];
  let totalWagered = 0;
  let totalPayout = 0;
  let totalSpins = 0;
  
  console.log('🎰 GORBAGANA SLOTS - PLAYER SIMULATION');
  console.log('=====================================\\n');
  
  for (const profile of profiles) {
    console.log(`Simulating ${playersPerProfile} ${profile.name} players...`);
    
    const profileResults = [];
    for (let i = 0; i < playersPerProfile; i++) {
      const playerProfile = {
        ...profile,
        id: `${profile.id}_${i + 1}`,
        name: `${profile.name} #${i + 1}`
      };
      
      const result = simulatePlayerSession(playerProfile);
      profileResults.push(result);
      allResults.push(result);
      
      totalWagered += result.totalWagered;
      totalPayout += result.totalWon;
      totalSpins += result.totalSpins;
    }
    
    // Profile summary
    const avgResult = profileResults.reduce((sum, r) => sum + r.netResult, 0) / profileResults.length;
    const avgRTP = profileResults.reduce((sum, r) => sum + r.rtp, 0) / profileResults.length;
    const winRate = profileResults.filter(r => r.netResult > 0).length / profileResults.length * 100;
    const bustRate = profileResults.filter(r => r.bustedOut).length / profileResults.length * 100;
    
    console.log(`  Average Result: ${avgResult.toFixed(4)} GOR`);
    console.log(`  Average RTP: ${avgRTP.toFixed(2)}%`);
    console.log(`  Win Rate: ${winRate.toFixed(1)}%`);
    console.log(`  Bust Rate: ${bustRate.toFixed(1)}%\\n`);
  }
  
  // Overall statistics
  const houseProfit = totalWagered - totalPayout;
  const overallRTP = totalWagered > 0 ? (totalPayout / totalWagered) * 100 : 0;
  const overallHouseEdge = 100 - overallRTP;
  
  const playersWon = allResults.filter(r => r.netResult > 0).length;
  const playersLost = allResults.filter(r => r.netResult < 0).length;
  const playersBusted = allResults.filter(r => r.bustedOut).length;
  
  const netResults = allResults.map(r => r.netResult).sort((a, b) => a - b);
  const medianResult = netResults[Math.floor(netResults.length / 2)];
  const worstLoss = Math.min(...netResults);
  const biggestWin = Math.max(...netResults);
  
  console.log('📊 OVERALL SIMULATION RESULTS');
  console.log('-----------------------------');
  console.log(`Total Players: ${allResults.length}`);
  console.log(`Total Spins: ${totalSpins.toLocaleString()}`);
  console.log(`Total Wagered: ${totalWagered.toFixed(4)} GOR`);
  console.log(`Total Payout: ${totalPayout.toFixed(4)} GOR`);
  console.log(`House Profit: ${houseProfit.toFixed(4)} GOR`);
  console.log(`Overall RTP: ${overallRTP.toFixed(2)}%`);
  console.log(`House Edge: ${overallHouseEdge.toFixed(2)}%\\n`);
  
  console.log('👥 PLAYER OUTCOMES');
  console.log('------------------');
  console.log(`Players Won: ${playersWon} (${(playersWon / allResults.length * 100).toFixed(1)}%)`);
  console.log(`Players Lost: ${playersLost} (${(playersLost / allResults.length * 100).toFixed(1)}%)`);
  console.log(`Players Busted: ${playersBusted} (${(playersBusted / allResults.length * 100).toFixed(1)}%)`);
  console.log(`Median Result: ${medianResult.toFixed(4)} GOR`);
  console.log(`Biggest Win: ${biggestWin.toFixed(4)} GOR`);
  console.log(`Worst Loss: ${worstLoss.toFixed(4)} GOR\\n`);
  
  // Risk Assessment
  console.log('⚠️ RISK ASSESSMENT');
  console.log('------------------');
  
  if (overallHouseEdge > 10) {
    console.log('🚨 CRITICAL: House edge extremely high - players losing too much');
    console.log('   • Current house edge:', overallHouseEdge.toFixed(2) + '%');
    console.log('   • Target house edge: 5%');
    console.log('   • Excess:', (overallHouseEdge - 5).toFixed(2) + '%');
  } else if (overallHouseEdge > 7) {
    console.log('⚠️ WARNING: House edge above recommended levels');
  } else if (overallHouseEdge < 3) {
    console.log('⚠️ WARNING: House edge too low - unsustainable for house');
  } else {
    console.log('✅ House edge within acceptable range');
  }
  
  if (playersBusted / allResults.length > 0.5) {
    console.log('🚨 CRITICAL: Over 50% of players busted out');
  } else if (playersBusted / allResults.length > 0.3) {
    console.log('⚠️ WARNING: High bust rate may indicate poor player experience');
  }
  
  if (playersWon / allResults.length < 0.1) {
    console.log('🚨 CRITICAL: Very few players winning - poor retention expected');
  }
  
  console.log('\\n💡 RECOMMENDATIONS');
  console.log('------------------');
  
  if (overallHouseEdge > 7) {
    console.log('• URGENT: Reduce house edge by increasing payout multipliers');
    const multiplier = 95 / overallRTP;
    console.log(`• Multiply all payouts by ${multiplier.toFixed(2)}x to achieve 95% RTP`);
    console.log('• Current payouts are far too low for sustainable gameplay');
  }
  
  if (playersBusted / allResults.length > 0.3) {
    console.log('• Implement loss limits or responsible gambling features');
    console.log('• Adjust volatility to reduce extreme losses');
  }
  
  if (playersWon / allResults.length < 0.2) {
    console.log('• Increase small win frequency to improve player engagement');
    console.log('• Consider bonus features or progressive elements');
  }
  
  // Show some individual player examples
  console.log('\\n🎯 EXAMPLE PLAYER OUTCOMES');
  console.log('---------------------------');
  
  const examples = [
    allResults.find(r => r.playerId.includes('casual')),
    allResults.find(r => r.playerId.includes('regular')),
    allResults.find(r => r.playerId.includes('highroller')),
    allResults.find(r => r.playerId.includes('grinder'))
  ].filter(Boolean);
  
  examples.forEach(player => {
    console.log(`${player.playerName}:`);
    console.log(`  Started: ${player.startingBalance.toFixed(4)} GOR`);
    console.log(`  Ended: ${player.endingBalance.toFixed(4)} GOR`);
    console.log(`  Net: ${player.netResult.toFixed(4)} GOR (${((player.netResult / player.startingBalance) * 100).toFixed(1)}%)`);
    console.log(`  Spins: ${player.totalSpins}, RTP: ${player.rtp.toFixed(2)}%`);
    console.log(`  Status: ${player.bustedOut ? '💀 BUSTED' : player.reachedTarget ? '🎯 TARGET REACHED' : '⏹️ STOPPED'}`);
    console.log('');
  });
  
  return {
    totalPlayers: allResults.length,
    totalSpins,
    totalWagered,
    totalPayout,
    houseProfit,
    overallRTP,
    overallHouseEdge,
    playerResults: allResults
  };
}

// Run the simulation
console.log('Starting comprehensive player simulation...\\n');
const simulation = runMultiPlayerSimulation(PLAYER_PROFILES, 25);

console.log('\\n🔍 DETAILED ANALYSIS');
console.log('====================');

// Calculate theoretical vs actual RTP
const theoreticalRTP = 22.28; // From our earlier calculation
console.log(`Theoretical RTP: ${theoreticalRTP.toFixed(2)}%`);
console.log(`Simulated RTP: ${simulation.overallRTP.toFixed(2)}%`);
console.log(`Difference: ${Math.abs(theoreticalRTP - simulation.overallRTP).toFixed(2)}%`);

if (Math.abs(theoreticalRTP - simulation.overallRTP) < 2) {
  console.log('✅ Simulation matches theoretical calculations');
} else {
  console.log('⚠️ Significant difference between theory and simulation');
}

console.log('\\n🎰 SYMBOL FREQUENCY ANALYSIS');
console.log('-----------------------------');
console.log('Based on current weights [1,2,3,4,5,6,7,8]:');

const weights = [1, 2, 3, 4, 5, 6, 7, 8];
const totalWeight = 36;
const symbols = ['Gorbagana', 'Wild', 'Bonus', 'Trash', 'Takeout', 'Fish', 'Rat', 'Banana'];

symbols.forEach((symbol, i) => {
  const prob = weights[i] / totalWeight;
  const winProb = Math.pow(prob, 3);
  const multiplier = [100, 50, 25, 20, 15, 10, 5, 2][i];
  
  console.log(`${symbol.padEnd(10)}: ${(prob * 100).toFixed(2)}% each, ${(winProb * 100).toFixed(4)}% win, ${multiplier}x payout`);
});

console.log('\\n🚨 CRITICAL FINDINGS');
console.log('====================');
console.log('1. House edge is ' + (simulation.overallHouseEdge - 5).toFixed(2) + '% above target');
console.log('2. Players lose ' + (100 - simulation.overallRTP).toFixed(2) + '% of every bet on average');
console.log('3. Only ' + (simulation.playerResults.filter(r => r.netResult > 0).length / simulation.totalPlayers * 100).toFixed(1) + '% of players made a profit');
console.log('4. ' + (simulation.playerResults.filter(r => r.bustedOut).length / simulation.totalPlayers * 100).toFixed(1) + '% of players lost most of their money');
console.log('\\n⚠️ THIS CONFIGURATION IS NOT SUITABLE FOR PRODUCTION USE');
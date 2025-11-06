/**
 * RTP Testing and Verification Script
 * Run this to verify the slot game RTP calculations
 */

import { generateRTPReport, simulateGameplay, calculateTheoreticalRTP } from './rtpAnalysis';

export function runRTPTests() {
  console.log('🎰 Gorbagana Slots RTP Verification');
  console.log('=====================================\n');

  // Test with default bet amount
  const betAmount = 0.01;
  const report = generateRTPReport(betAmount);

  console.log('📊 THEORETICAL ANALYSIS');
  console.log('------------------------');
  console.log(`House Edge: ${report.analysis.houseEdge.toFixed(2)}%`);
  console.log(`Theoretical RTP: ${report.analysis.theoreticalRTP.toFixed(2)}%`);
  console.log(`Hit Frequency: ${report.analysis.hitFrequency.toFixed(4)}%`);
  console.log(`Volatility: ${report.analysis.volatility}`);
  console.log(`Expected Payout per Spin: ${report.analysis.expectedPayoutPerSpin.toFixed(6)} GOR`);

  console.log('\n🎯 COMPLIANCE CHECK');
  console.log('-------------------');
  console.log(`Target House Edge: 5.00%`);
  console.log(`Target RTP: 95.00%`);
  console.log(`Status: ${report.summary.isCompliant ? '✅ COMPLIANT' : '❌ NON-COMPLIANT'}`);
  console.log(`Risk Level: ${report.summary.riskLevel.toUpperCase()}`);

  if (!report.summary.isCompliant) {
    console.log('\n⚠️ ISSUES FOUND');
    console.log('---------------');
    report.summary.keyFindings.forEach(finding => {
      console.log(`• ${finding}`);
    });

    console.log('\n🔧 ACTION ITEMS');
    console.log('---------------');
    report.summary.actionItems.forEach(item => {
      console.log(`• ${item}`);
    });
  }

  console.log('\n🎲 SIMULATION RESULTS');
  console.log('---------------------');
  console.log(`Actual RTP: ${report.simulation.actualRTP.toFixed(2)}%`);
  console.log(`Total Spins: ${report.simulation.totalWagered / betAmount}`);
  console.log(`Total Wagered: ${report.simulation.totalWagered.toFixed(4)} GOR`);
  console.log(`Total Payout: ${report.simulation.totalPayout.toFixed(4)} GOR`);
  console.log(`House Profit: ${report.simulation.houseProfit.toFixed(4)} GOR`);
  console.log(`Hit Rate: ${report.simulation.hitRate.toFixed(2)}%`);
  console.log(`Big Wins (10x+): ${report.simulation.bigWins}`);

  console.log('\n🏆 TOP WINNING COMBINATIONS');
  console.log('----------------------------');
  report.analysis.winCombinations.slice(0, 5).forEach((combo, index) => {
    const symbol = combo.symbols[0];
    console.log(`${index + 1}. ${symbol.toUpperCase()} x3: ${(combo.probability * 100).toFixed(4)}% chance, ${combo.payout.toFixed(4)} GOR payout`);
  });

  if (report.recommendations.adjustments.length > 0) {
    console.log('\n🔧 RECOMMENDED ADJUSTMENTS');
    console.log('---------------------------');
    report.recommendations.adjustments.forEach(adj => {
      console.log(`${adj.symbol?.toUpperCase()}: ${adj.type} ${adj.currentValue} → ${adj.recommendedValue} (${adj.impact.toFixed(1)}% impact)`);
    });
  }

  console.log('\n📈 VARIANCE ANALYSIS');
  console.log('--------------------');
  console.log(`Variance: ${report.simulation.variance.toFixed(6)}`);
  console.log(`Standard Deviation: ${Math.sqrt(report.simulation.variance).toFixed(6)}`);

  // Test different bet amounts
  console.log('\n💰 MULTI-BET ANALYSIS');
  console.log('---------------------');
  const betAmounts = [0.001, 0.01, 0.1, 1.0];
  betAmounts.forEach(bet => {
    const analysis = calculateTheoreticalRTP(bet);
    console.log(`${bet} GOR bet: ${analysis.theoreticalRTP.toFixed(2)}% RTP, ${analysis.houseEdge.toFixed(2)}% house edge`);
  });

  return report;
}

// Export for use in tests
export function quickRTPCheck(): { isCompliant: boolean; rtp: number; houseEdge: number } {
  const analysis = calculateTheoreticalRTP(0.01);
  return {
    isCompliant: Math.abs(analysis.houseEdge - 5) <= 0.5,
    rtp: analysis.theoreticalRTP,
    houseEdge: analysis.houseEdge
  };
}

// Run tests if this file is executed directly
if (typeof window === 'undefined' && require.main === module) {
  runRTPTests();
}
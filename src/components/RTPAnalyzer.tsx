import React, { useState, useEffect } from 'react';
import { 
  generateRTPReport, 
  RTPrealTimeMonitor, 
  calculateTheoreticalRTP,
  simulateGameplay,
  SYMBOL_CONFIG
} from '../utils/rtpAnalysis';

interface RTPAnalyzerProps {
  isVisible: boolean;
  onClose: () => void;
}

export const RTPAnalyzer: React.FC<RTPAnalyzerProps> = ({ isVisible, onClose }) => {
  const [betAmount, setBetAmount] = useState(0.01);
  const [report, setReport] = useState<ReturnType<typeof generateRTPReport> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [simulationSpins, setSimulationSpins] = useState(100000);
  const [activeTab, setActiveTab] = useState<'analysis' | 'simulation' | 'monitor'>('analysis');
  const [monitor] = useState(new RTPrealTimeMonitor());
  const [monitorStats, setMonitorStats] = useState(monitor.getStats());

  useEffect(() => {
    if (isVisible) {
      generateReport();
    }
  }, [isVisible, betAmount]);

  useEffect(() => {
    // Update monitor stats every second
    const interval = setInterval(() => {
      setMonitorStats(monitor.getStats());
    }, 1000);

    return () => clearInterval(interval);
  }, [monitor]);

  const generateReport = async () => {
    setIsLoading(true);
    try {
      // Simulate some delay for realistic loading
      await new Promise(resolve => setTimeout(resolve, 500));
      const newReport = generateRTPReport(betAmount);
      setReport(newReport);
    } catch (error) {
      console.error('Error generating RTP report:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const runSimulation = async () => {
    setIsLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      const simulation = simulateGameplay(simulationSpins, betAmount);
      if (report) {
        setReport({
          ...report,
          simulation
        });
      }
    } catch (error) {
      console.error('Error running simulation:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const addTestSpin = (wager: number, payout: number) => {
    monitor.recordSpin(wager, payout);
  };

  const resetMonitor = () => {
    monitor.reset();
    setMonitorStats(monitor.getStats());
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-slate-900 rounded-xl max-w-6xl w-full max-h-[90vh] overflow-y-auto border border-purple-500/30">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-slate-700">
          <h2 className="text-2xl font-bold text-white">RTP Analysis & Verification</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl"
          >
            ×
          </button>
        </div>

        {/* Controls */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex flex-wrap gap-4 items-center">
            <div>
              <label className="block text-sm text-gray-300 mb-1">Bet Amount (GOR)</label>
              <input
                type="number"
                value={betAmount}
                onChange={(e) => setBetAmount(parseFloat(e.target.value) || 0.01)}
                step="0.001"
                min="0.001"
                className="bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 w-32"
              />
            </div>
            <button
              onClick={generateReport}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {isLoading ? 'Analyzing...' : 'Generate Report'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700">
          {[
            { id: 'analysis', label: 'Theoretical Analysis' },
            { id: 'simulation', label: 'Simulation' },
            { id: 'monitor', label: 'Live Monitor' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-6 py-3 font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Theoretical Analysis Tab */}
          {activeTab === 'analysis' && report && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className={`p-4 rounded-lg border ${
                  report.summary.isCompliant 
                    ? 'bg-green-900/20 border-green-500' 
                    : 'bg-red-900/20 border-red-500'
                }`}>
                  <div className="text-sm text-gray-300">House Edge</div>
                  <div className="text-2xl font-bold text-white">
                    {report.analysis.houseEdge.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">Target: 5.00%</div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">Theoretical RTP</div>
                  <div className="text-2xl font-bold text-white">
                    {report.analysis.theoreticalRTP.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">Target: 95.00%</div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">Hit Frequency</div>
                  <div className="text-2xl font-bold text-white">
                    {report.analysis.hitFrequency.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">Winning spins</div>
                </div>

                <div className={`p-4 rounded-lg border ${
                  report.analysis.volatility === 'high' 
                    ? 'bg-red-900/20 border-red-500'
                    : report.analysis.volatility === 'medium'
                    ? 'bg-yellow-900/20 border-yellow-500'
                    : 'bg-green-900/20 border-green-500'
                }`}>
                  <div className="text-sm text-gray-300">Volatility</div>
                  <div className="text-2xl font-bold text-white capitalize">
                    {report.analysis.volatility}
                  </div>
                  <div className="text-xs text-gray-400">Risk level</div>
                </div>
              </div>

              {/* Key Findings */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Key Findings</h3>
                <div className="space-y-2">
                  {report.summary.keyFindings.map((finding, index) => (
                    <div key={index} className="text-sm text-gray-300">
                      {finding}
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Items */}
              {report.summary.actionItems.length > 0 && (
                <div className="bg-yellow-900/20 border border-yellow-500 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-yellow-400 mb-3">Action Items</h3>
                  <div className="space-y-2">
                    {report.summary.actionItems.map((item, index) => (
                      <div key={index} className="text-sm text-yellow-300">
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Win Combinations Table */}
              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Win Combinations Analysis</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-600">
                        <th className="text-left py-2 text-gray-300">Symbol</th>
                        <th className="text-right py-2 text-gray-300">Probability</th>
                        <th className="text-right py-2 text-gray-300">Payout</th>
                        <th className="text-right py-2 text-gray-300">RTP Contribution</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.analysis.winCombinations.map((combo, index) => {
                        const symbol = combo.symbols[0];
                        const symbolConfig = SYMBOL_CONFIG[symbol];
                        return (
                          <tr key={index} className="border-b border-slate-700">
                            <td className="py-2 text-white capitalize">{symbol}</td>
                            <td className="py-2 text-right text-gray-300">
                              {(combo.probability * 100).toFixed(4)}%
                            </td>
                            <td className="py-2 text-right text-gray-300">
                              {combo.payout.toFixed(4)} GOR
                            </td>
                            <td className="py-2 text-right text-gray-300">
                              {((combo.contribution / betAmount) * 100).toFixed(4)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Recommendations */}
              {report.recommendations.adjustments.length > 0 && (
                <div className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-3">Recommended Adjustments</h3>
                  <div className="space-y-3">
                    {report.recommendations.adjustments.map((adjustment, index) => (
                      <div key={index} className="bg-slate-700 rounded p-3">
                        <div className="flex justify-between items-center">
                          <span className="text-white capitalize">{adjustment.symbol}</span>
                          <span className={`text-sm px-2 py-1 rounded ${
                            adjustment.type === 'payout' ? 'bg-blue-600' : 'bg-green-600'
                          }`}>
                            {adjustment.type}
                          </span>
                        </div>
                        <div className="text-sm text-gray-300 mt-1">
                          Current: {adjustment.currentValue} → Recommended: {adjustment.recommendedValue}
                        </div>
                        <div className="text-xs text-gray-400">
                          Impact: {adjustment.impact.toFixed(2)}%
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Simulation Tab */}
          {activeTab === 'simulation' && (
            <div className="space-y-6">
              <div className="flex gap-4 items-center">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Simulation Spins</label>
                  <input
                    type="number"
                    value={simulationSpins}
                    onChange={(e) => setSimulationSpins(parseInt(e.target.value) || 100000)}
                    step="10000"
                    min="1000"
                    className="bg-slate-800 text-white px-3 py-2 rounded border border-slate-600 w-32"
                  />
                </div>
                <button
                  onClick={runSimulation}
                  disabled={isLoading}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50 mt-6"
                >
                  {isLoading ? 'Running...' : 'Run Simulation'}
                </button>
              </div>

              {report && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                    <div className="text-sm text-gray-300">Actual RTP</div>
                    <div className="text-2xl font-bold text-white">
                      {report.simulation.actualRTP.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      vs {report.analysis.theoreticalRTP.toFixed(2)}% theoretical
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                    <div className="text-sm text-gray-300">House Profit</div>
                    <div className="text-2xl font-bold text-white">
                      {report.simulation.houseProfit.toFixed(4)} GOR
                    </div>
                    <div className="text-xs text-gray-400">
                      {((report.simulation.houseProfit / report.simulation.totalWagered) * 100).toFixed(2)}% edge
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                    <div className="text-sm text-gray-300">Hit Rate</div>
                    <div className="text-2xl font-bold text-white">
                      {report.simulation.hitRate.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-400">
                      {report.simulation.bigWins} big wins
                    </div>
                  </div>
                </div>
              )}

              {report && (
                <div className="bg-slate-800 rounded-lg p-4">
                  <h3 className="text-lg font-bold text-white mb-3">Simulation Results</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-gray-300">Total Spins:</div>
                      <div className="text-white font-mono">{simulationSpins.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-gray-300">Total Wagered:</div>
                      <div className="text-white font-mono">{report.simulation.totalWagered.toFixed(4)} GOR</div>
                    </div>
                    <div>
                      <div className="text-gray-300">Total Payout:</div>
                      <div className="text-white font-mono">{report.simulation.totalPayout.toFixed(4)} GOR</div>
                    </div>
                    <div>
                      <div className="text-gray-300">Variance:</div>
                      <div className="text-white font-mono">{report.simulation.variance.toFixed(6)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Live Monitor Tab */}
          {activeTab === 'monitor' && (
            <div className="space-y-6">
              <div className="flex gap-4">
                <button
                  onClick={() => addTestSpin(betAmount, 0)}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
                >
                  Add Losing Spin
                </button>
                <button
                  onClick={() => addTestSpin(betAmount, betAmount * 10)}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded"
                >
                  Add Winning Spin (10x)
                </button>
                <button
                  onClick={resetMonitor}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
                >
                  Reset Monitor
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">Current RTP</div>
                  <div className="text-2xl font-bold text-white">
                    {monitorStats.currentRTP.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">All time</div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">Recent RTP</div>
                  <div className="text-2xl font-bold text-white">
                    {monitorStats.recentRTP.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">Last hour</div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">House Edge</div>
                  <div className="text-2xl font-bold text-white">
                    {monitorStats.houseEdge.toFixed(2)}%
                  </div>
                  <div className="text-xs text-gray-400">Current</div>
                </div>

                <div className="p-4 rounded-lg bg-slate-800 border border-slate-600">
                  <div className="text-sm text-gray-300">Total Spins</div>
                  <div className="text-2xl font-bold text-white">
                    {monitorStats.totalSpins.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">Recorded</div>
                </div>
              </div>

              <div className="bg-slate-800 rounded-lg p-4">
                <h3 className="text-lg font-bold text-white mb-3">Live Statistics</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-gray-300">Total Wagered:</div>
                    <div className="text-white font-mono">{monitorStats.totalWagered.toFixed(4)} GOR</div>
                  </div>
                  <div>
                    <div className="text-gray-300">Total Payout:</div>
                    <div className="text-white font-mono">{monitorStats.totalPayout.toFixed(4)} GOR</div>
                  </div>
                  <div>
                    <div className="text-gray-300">House Profit:</div>
                    <div className="text-white font-mono">{monitorStats.houseProfit.toFixed(4)} GOR</div>
                  </div>
                  <div>
                    <div className="text-gray-300">Profit Margin:</div>
                    <div className="text-white font-mono">
                      {monitorStats.totalWagered > 0 
                        ? ((monitorStats.houseProfit / monitorStats.totalWagered) * 100).toFixed(2)
                        : '0.00'
                      }%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
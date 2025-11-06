import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Diagnostic component to test each layer
const DiagnosticApp: React.FC = () => {
  const [currentTest, setCurrentTest] = useState(0);
  const [results, setResults] = useState<{ [key: string]: boolean }>({});
  const [error, setError] = useState<string | null>(null);

  const tests = [
    {
      name: 'Basic React Rendering',
      test: () => {
        return Promise.resolve(true);
      }
    },
    {
      name: 'CSS and Tailwind Loading',
      test: () => {
        const testElement = document.createElement('div');
        testElement.className = 'bg-blue-500 text-white p-4';
        document.body.appendChild(testElement);
        const styles = window.getComputedStyle(testElement);
        const hasStyles = styles.backgroundColor !== 'rgba(0, 0, 0, 0)' && styles.backgroundColor !== 'transparent';
        document.body.removeChild(testElement);
        return Promise.resolve(hasStyles);
      }
    },
    {
      name: 'Asset Loading (Images)',
      test: () => {
        return new Promise((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = '/gorbagana.jpeg';
          setTimeout(() => resolve(false), 3000); // Timeout after 3s
        });
      }
    },
    {
      name: 'Wallet Adapter Imports',
      test: async () => {
        try {
          const { useConnection, useWallet } = await import('@solana/wallet-adapter-react');
          const { WalletMultiButton } = await import('@solana/wallet-adapter-react-ui');
          return !!(useConnection && useWallet && WalletMultiButton);
        } catch (error) {
          console.error('Wallet adapter import error:', error);
          return false;
        }
      }
    },
    {
      name: 'Component Imports',
      test: async () => {
        try {
          const { DesktopSlotGame } = await import('./src/components/DesktopSlotGame.tsx');
          const { BlockchainSlotGame } = await import('./src/components/BlockchainSlotGame.tsx');
          return !!(DesktopSlotGame && BlockchainSlotGame);
        } catch (error) {
          console.error('Component import error:', error);
          return false;
        }
      }
    },
    {
      name: 'Hook Imports',
      test: async () => {
        try {
          const { WalletContextProvider } = await import('./src/hooks/useWallet.tsx');
          const { useProgram } = await import('./src/hooks/useProgram.tsx');
          return !!(WalletContextProvider && useProgram);
        } catch (error) {
          console.error('Hook import error:', error);
          return false;
        }
      }
    },
    {
      name: 'Three.js (TrashbagBackground)',
      test: async () => {
        try {
          const THREE = await import('three');
          return !!THREE.Scene;
        } catch (error) {
          console.error('Three.js import error:', error);
          return false;
        }
      }
    },
    {
      name: 'Original App Component',
      test: async () => {
        try {
          // Try to import and instantiate the original app
          const React = await import('react');
          const { WalletContextProvider } = await import('./src/hooks/useWallet.tsx');
          const { DesktopSlotGame } = await import('./src/components/DesktopSlotGame.tsx');
          const { BlockchainSlotGame } = await import('./src/components/BlockchainSlotGame.tsx');
          
          // Test if we can create the components without errors
          const testComponent = React.createElement(WalletContextProvider, {}, 
            React.createElement('div', {}, 'Test')
          );
          return !!testComponent;
        } catch (error) {
          console.error('Original app test error:', error);
          return false;
        }
      }
    }
  ];

  const runTest = async (testIndex: number) => {
    try {
      setError(null);
      const test = tests[testIndex];
      console.log(`Running test: ${test.name}`);
      const result = await test.test();
      setResults(prev => ({ ...prev, [test.name]: result }));
      console.log(`Test ${test.name}: ${result ? 'PASSED' : 'FAILED'}`);
      return result;
    } catch (error) {
      console.error(`Test ${tests[testIndex].name} error:`, error);
      setError(error instanceof Error ? error.message : 'Unknown error');
      setResults(prev => ({ ...prev, [tests[testIndex].name]: false }));
      return false;
    }
  };

  const runAllTests = async () => {
    setResults({});
    setError(null);
    
    for (let i = 0; i < tests.length; i++) {
      setCurrentTest(i);
      await runTest(i);
      await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
    }
    setCurrentTest(-1);
  };

  useEffect(() => {
    runAllTests();
  }, []);

  const getStatusIcon = (testName: string) => {
    if (!(testName in results)) return '⏳';
    return results[testName] ? '✅' : '❌';
  };

  const getStatusColor = (testName: string) => {
    if (!(testName in results)) return 'text-yellow-400';
    return results[testName] ? 'text-green-400' : 'text-red-400';
  };

  const failedTests = Object.entries(results).filter(([_, passed]) => !passed);
  const passedTests = Object.entries(results).filter(([_, passed]) => passed);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">🔧 Gorbagana Slots Diagnostic</h1>
          <p className="text-gray-400">Diagnosing why the original UI isn't loading...</p>
        </div>

        {/* Test Progress */}
        <div className="mb-8 p-6 bg-black/50 rounded-xl">
          <h2 className="text-2xl font-bold mb-4">Test Progress</h2>
          <div className="space-y-3">
            {tests.map((test, index) => (
              <div 
                key={test.name}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  currentTest === index ? 'bg-blue-600/30 border border-blue-500' : 'bg-gray-800/50'
                }`}
              >
                <span className="font-medium">{test.name}</span>
                <span className={`text-2xl ${getStatusColor(test.name)}`}>
                  {getStatusIcon(test.name)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Results Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="p-6 bg-green-900/30 border border-green-500/50 rounded-xl">
            <h3 className="text-xl font-bold text-green-400 mb-3">✅ Passed Tests ({passedTests.length})</h3>
            <ul className="space-y-1">
              {passedTests.map(([testName]) => (
                <li key={testName} className="text-green-300">• {testName}</li>
              ))}
            </ul>
          </div>

          <div className="p-6 bg-red-900/30 border border-red-500/50 rounded-xl">
            <h3 className="text-xl font-bold text-red-400 mb-3">❌ Failed Tests ({failedTests.length})</h3>
            <ul className="space-y-1">
              {failedTests.map(([testName]) => (
                <li key={testName} className="text-red-300">• {testName}</li>
              ))}
            </ul>
          </div>
        </div>

        {/* Error Details */}
        {error && (
          <div className="mb-8 p-6 bg-red-900/50 border border-red-500 rounded-xl">
            <h3 className="text-xl font-bold text-red-400 mb-3">Error Details</h3>
            <pre className="text-sm text-red-300 whitespace-pre-wrap">{error}</pre>
          </div>
        )}

        {/* Recommendations */}
        <div className="p-6 bg-blue-900/30 border border-blue-500/50 rounded-xl">
          <h3 className="text-xl font-bold text-blue-400 mb-3">🔍 Diagnostic Results</h3>
          <div className="space-y-2 text-sm">
            {failedTests.length === 0 && Object.keys(results).length > 0 && (
              <p className="text-green-300">✅ All tests passed! The original app should work. Let me try loading it...</p>
            )}
            {failedTests.some(([name]) => name.includes('Wallet Adapter')) && (
              <p className="text-yellow-300">⚠️ Wallet adapter issues detected. This might be causing the blank screen.</p>
            )}
            {failedTests.some(([name]) => name.includes('Component Imports')) && (
              <p className="text-yellow-300">⚠️ Component import issues detected. File paths might be incorrect.</p>
            )}
            {failedTests.some(([name]) => name.includes('CSS')) && (
              <p className="text-yellow-300">⚠️ CSS loading issues detected. Styling might not be working.</p>
            )}
            {failedTests.some(([name]) => name.includes('Asset')) && (
              <p className="text-yellow-300">⚠️ Asset loading issues detected. Images might not be accessible.</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4 mt-8">
          <button
            onClick={runAllTests}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-bold transition-colors"
          >
            🔄 Run Tests Again
          </button>
          
          {failedTests.length === 0 && Object.keys(results).length > 0 && (
            <button
              onClick={() => {
                // Try to load the original app
                window.location.href = window.location.href.replace('index-diagnostic.tsx', 'index.tsx');
              }}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-bold transition-colors"
            >
              🚀 Load Original App
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// React App Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<DiagnosticApp />);
} else {
  console.error('Root element not found!');
}
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// Simple debug component to test step by step
const DebugApp: React.FC = () => {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    console.log('DebugApp mounted, step:', step);
  }, [step]);

  const testSteps = [
    { id: 1, name: 'Basic React', component: () => <div>✅ React is working!</div> },
    { id: 2, name: 'State Management', component: () => <div>✅ State: {step}</div> },
    { id: 3, name: 'Styling', component: () => <div className="text-white bg-blue-500 p-4 rounded">✅ Tailwind CSS working!</div> },
    { id: 4, name: 'Complex Layout', component: () => (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 text-white p-8">
        <h1 className="text-4xl font-bold mb-4">✅ Complex Layout Working!</h1>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-black/50 p-4 rounded">Left Panel</div>
          <div className="bg-black/50 p-4 rounded">Center Panel</div>
          <div className="bg-black/50 p-4 rounded">Right Panel</div>
        </div>
      </div>
    )}
  ];

  const CurrentComponent = testSteps.find(s => s.id === step)?.component || (() => <div>Unknown step</div>);

  try {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-4">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">🔧 Gorbagana Slots Debug Mode</h1>
          
          <div className="mb-6">
            <h2 className="text-xl mb-4">Testing Step {step}: {testSteps.find(s => s.id === step)?.name}</h2>
            <div className="flex gap-2 mb-4">
              {testSteps.map(testStep => (
                <button
                  key={testStep.id}
                  onClick={() => setStep(testStep.id)}
                  className={`px-4 py-2 rounded ${
                    step === testStep.id 
                      ? 'bg-blue-600 text-white' 
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {testStep.id}. {testStep.name}
                </button>
              ))}
            </div>
          </div>

          <div className="border border-gray-600 rounded-lg p-4 mb-6">
            <CurrentComponent />
          </div>

          <div className="bg-black/50 p-4 rounded">
            <h3 className="text-lg font-bold mb-2">Debug Info:</h3>
            <ul className="text-sm space-y-1">
              <li>✅ React: {React.version}</li>
              <li>✅ Window width: {window.innerWidth}px</li>
              <li>✅ Current step: {step}</li>
              <li>✅ Error: {error || 'None'}</li>
            </ul>
          </div>

          <div className="mt-6">
            <button
              onClick={() => {
                console.log('Loading full app...');
                // Change the script src to load the main app
                const script = document.querySelector('script[src*="index-debug.tsx"]');
                if (script) {
                  script.remove();
                  const newScript = document.createElement('script');
                  newScript.type = 'module';
                  newScript.src = '/index.tsx';
                  document.body.appendChild(newScript);
                  // Clear the root and let the new script take over
                  const root = document.getElementById('root');
                  if (root) root.innerHTML = '';
                }
              }}
              className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-bold"
            >
              🚀 Load Full App
            </button>
          </div>
        </div>
      </div>
    );
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Unknown error');
    return (
      <div className="min-h-screen bg-red-900 text-white p-4">
        <h1 className="text-3xl font-bold mb-4">❌ Error in Debug App</h1>
        <pre className="bg-black p-4 rounded">{error}</pre>
      </div>
    );
  }
};

// React App Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<DebugApp />);
} else {
  console.error('Root element not found!');
}
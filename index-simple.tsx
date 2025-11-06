import React from 'react';
import ReactDOM from 'react-dom/client';

// Simple test component
const SimpleApp: React.FC = () => {
  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontFamily: 'Arial, sans-serif'
    }}>
      <div style={{ textAlign: 'center', padding: '2rem' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎰 Gorbagana Slots</h1>
        <h2 style={{ fontSize: '2rem', marginBottom: '2rem' }}>Trash Rush</h2>
        <p style={{ fontSize: '1.2rem', marginBottom: '2rem' }}>
          Welcome to the blockchain slots game!
        </p>
        <button 
          style={{
            background: 'linear-gradient(45deg, #ff6b6b, #ee5a24)',
            border: 'none',
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            color: 'white',
            borderRadius: '10px',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
          onClick={() => alert('Game is loading...')}
        >
          🎮 Start Game
        </button>
        <div style={{ marginTop: '2rem', fontSize: '0.9rem', opacity: 0.8 }}>
          <p>✅ React App is working</p>
          <p>✅ TypeScript is working</p>
          <p>✅ Vite dev server is running</p>
        </div>
      </div>
    </div>
  );
};

// React App Entry Point
const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<SimpleApp />);
} else {
  console.error('Root element not found!');
}
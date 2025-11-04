import React from 'react';
import ReactDOM from 'react-dom/client';

const SimpleApp: React.FC = () => {
  return (
    <div style={{ padding: '20px', backgroundColor: 'lightblue', minHeight: '100vh' }}>
      <h1>Test App</h1>
      <p>If you can see this, React is working!</p>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<SimpleApp />);
}
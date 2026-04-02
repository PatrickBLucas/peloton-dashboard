import React from 'react';
import ReactDOM from 'react-dom/client';
import './App.css';
import App from './App';
import { register } from './serviceWorkerRegistration';

// temporary debug -- remove after testing
const debugDiv = document.createElement('div');
debugDiv.id = 'debug-bar';
debugDiv.style.cssText = 'position:fixed;top:0;left:0;right:0;background:red;color:#fff;font-size:12px;z-index:99999;padding:4px 8px;text-align:center;';
debugDiv.textContent = 'stored: ' + (localStorage.getItem('activeTab') || 'null');
document.body.appendChild(debugDiv);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

register();
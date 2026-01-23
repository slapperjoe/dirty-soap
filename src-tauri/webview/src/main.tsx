import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { ErrorBoundary } from './components/ErrorBoundary';
import 'monaco-editor/min/vs/editor/editor.main.css';

// Set document title with version
declare const __APP_VERSION__: string;
document.title = `APInox v${__APP_VERSION__}`;

// DEBUG: verify JS execution and event blocking
window.addEventListener('load', () => {
    console.log('Main loaded');
    const debug = document.createElement('div');
    debug.style.position = 'fixed';
    debug.style.top = '0';
    debug.style.left = '0';
    debug.style.backgroundColor = 'red';
    debug.style.color = 'white';
    debug.style.zIndex = '999999';
    debug.style.padding = '10px';
    debug.textContent = 'JS RUNNING';
    debug.id = 'debug-indicator';
    debug.style.display = 'none'; // Hidden by default
    document.body.appendChild(debug);

    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        debug.textContent = `CLICKED: ${target.tagName} #${target.id} .${target.className}`;
        console.log('Clicked:', target);
    });

    document.addEventListener('mousemove', (_) => {
        // Visualize mouse pos to ensure verify we get events
        // debug.textContent = `MOUSE: ${e.clientX},${e.clientY}`;
    });
});

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <React.StrictMode>
        <ErrorBoundary>
            <App />
        </ErrorBoundary>
    </React.StrictMode>,
)
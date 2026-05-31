import './styles/globals.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

// StrictMode is disabled: double-invoking effects destroys PTY sessions on mount
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)

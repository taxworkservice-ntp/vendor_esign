import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './lib/auth'
import { ClientAuthProvider } from './lib/client-auth'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <ClientAuthProvider>
        <App />
      </ClientAuthProvider>
    </AuthProvider>
  </React.StrictMode>,
)

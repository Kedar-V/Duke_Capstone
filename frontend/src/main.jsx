import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App.jsx'
import GlobalFallback from './GlobalFallback.jsx'
import './styles.css'

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

const tree = (
  <GlobalFallback>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </GlobalFallback>
)

ReactDOM.createRoot(document.getElementById('root')).render(
  clerkPubKey
    ? <ClerkProvider publishableKey={clerkPubKey}>{tree}</ClerkProvider>
    : tree,
)

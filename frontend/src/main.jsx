import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import GlobalFallback from './GlobalFallback.jsx'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <GlobalFallback>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </GlobalFallback>,
)

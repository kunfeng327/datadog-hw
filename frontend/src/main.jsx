import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { initRum } from './api/rum.js'
import './style.css'

initRum() // Datadog RUM（未配置 env 时自动跳过）

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

import React from 'react'
import ReactDOM from 'react-dom/client'
import 'maplibre-gl/dist/maplibre-gl.css'
import './index.css'
import './style.css'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'

ReactDOM.createRoot(document.querySelector('#app') as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)


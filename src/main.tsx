import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

const CHUNK_RELOAD_KEY = 'thinkfit:last-chunk-reload'
const CHUNK_RELOAD_COOLDOWN_MS = 10_000

// A tab left open across a deployment can still reference code-split chunks
// from the previous build. Vite emits this event when one of those imports
// fails, so refresh once to load the current index and its new asset hashes.
window.addEventListener('vite:preloadError', event => {
  const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0)
  if (Date.now() - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) return

  event.preventDefault()
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

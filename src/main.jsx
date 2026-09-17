import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import './index.css'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('cjenko:need-refresh'))
  },
})

window.addEventListener('cjenko:apply-update', () => {
  // updateSW() šalje SKIP_WAITING; plugin reload-a stranicu na `controlling`.
  void updateSW()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

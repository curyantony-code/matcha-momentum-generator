import { installGroupKeys } from './a11y-keys'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/figtree'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import './styles.css'
import { App } from './App'
import { applyTheme, loadTheme } from './theme'

applyTheme('dark') // the edit bay until the saved choice is read (one quick IPC call)
installGroupKeys() // arrow keys in every tab row and set of choices (a11y-keys.ts)
void loadTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)

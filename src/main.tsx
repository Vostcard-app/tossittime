import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3'
import './index.css'
import App from './App.tsx'

const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY || '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {recaptchaSiteKey ? (
      <GoogleReCaptchaProvider
        reCaptchaKey={recaptchaSiteKey}
        scriptProps={{
          async: false,
          defer: false,
          appendTo: 'head',
          nonce: undefined,
        }}
      >
        <App />
      </GoogleReCaptchaProvider>
    ) : (
      <App />
    )}
  </StrictMode>,
)

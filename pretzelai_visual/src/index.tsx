import React from "react"
import ReactDOM from "react-dom/client"
import "./index.css"
import App from "./App"
import posthog from "posthog-js"
import { POSTHOG_PUBLIC_KEY, POSTHOG_URL } from "./lib/config"

if (POSTHOG_PUBLIC_KEY && POSTHOG_URL) {
  posthog.init(POSTHOG_PUBLIC_KEY, {
    api_host: POSTHOG_URL,
    persistence: "memory",
  })
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

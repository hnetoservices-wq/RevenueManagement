import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPortuguesePhrases } from "./ui/ptPTPhrases";
import { initPortugueseUi } from "./ui/ptPT";
import { initUiPreferences } from "./ui/preferences";
import "./styles.css";
import "./snapshot.css";
import "./ui/accessibility.css";

initUiPreferences();
initPortuguesePhrases();
initPortugueseUi();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

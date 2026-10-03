import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initPricingGridUi } from "./features/pricing/pricingGridUi";
import { initPricingPeriodResetUi } from "./features/pricing/pricingPeriodResetUi";
import { initPricingPeriodStatus } from "./features/pricing/pricingPeriodStatus";
import { initPricingReferenceLine } from "./features/pricing/pricingReferenceLine";
import { initPortuguesePhrases } from "./ui/ptPTPhrases";
import { initPortugueseUi } from "./ui/ptPT";
import { initPortugueseInventoryUi } from "./ui/ptPTInventory";
import { initPortugueseNumberFormatting } from "./ui/ptPTNumbers";
import { initUiPreferences } from "./ui/preferences";
import "./styles.css";
import "./snapshot.css";
import "./ui/accessibility.css";
import "./ui/inventoryTheme.css";
import "./features/pricing/pricing-app-theme.css";
import "./features/pricing/pricing-simplify.css";

initUiPreferences();
initPortugueseNumberFormatting();
initPortuguesePhrases();
initPortugueseUi();
initPortugueseInventoryUi();
initPricingGridUi();
initPricingReferenceLine();
initPricingPeriodResetUi();
initPricingPeriodStatus();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

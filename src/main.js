import "./style.css";
import { initPreferences } from "./preferences.js";
import { route } from "./router.js";

// Import all modules to trigger their side-effects (event listener registration)
import "./auth.js";
import "./views/landing.js";
import "./views/dashboard.js";
import "./preferences.js";

// Editor modules
import "./views/editor.js";
import "./editor/commit-list.js";
import "./editor/history-nav.js";
import "./editor/selection.js";
import "./editor/diff-panel.js";

// Wire up lazy handler to break commit-list ↔ history-nav circular dep
import { setCommitListHandlers, setNavButtonUpdater } from "./editor/commit-list.js";
import { loadSnapshot, updateNavButtons } from "./editor/history-nav.js";
setCommitListHandlers({ loadSnapshot });
setNavButtonUpdater(updateNavButtons);

// Apply preferences immediately (prevents theme flash)
initPreferences();

// Start routing
route();

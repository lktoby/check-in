
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GuardianLink from "./components/GuardianLink";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GuardianLink />
  </StrictMode>
);

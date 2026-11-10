import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import RegistrationChoice from "./components/RegistrationChoice";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RegistrationChoice />
  </StrictMode>
);
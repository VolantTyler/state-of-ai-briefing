import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { Analytics } from "@vercel/analytics/react";

createRoot(document.getElementById("root")).render(
  <>
    <App />
    <SpeedInsights />
    <Analytics />
  </>
);


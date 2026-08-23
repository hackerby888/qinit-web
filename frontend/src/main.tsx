import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Docs } from "./Docs";
import { SplashScreen } from "./ide/Splash";
import { loadIdeModule } from "./ide/load";
import { installCrashHandlers } from "./ide/crash";
import { CrashBoundary, CrashOverlay } from "./ide/CrashDialog";
import { CrashDevTrigger, installCrashDev } from "./ide/crashDev"; // DEV-only smoke triggers
import "./index.css";

// The IDE pulls in Monaco — lazy-load it so the landing/docs bundle stays light.
const Ide = React.lazy(loadIdeModule);
const Projects = React.lazy(() => import("./ide/Projects"));
const SharedEntry = React.lazy(() => import("./ide/SharedEntry"));
const Admin = React.lazy(() => import("./ide/Admin"));

const routeFallback = (label: string, task: string) => (
  <SplashScreen label={label} steps={[{ label: task, status: "loading" }]} />
);

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

// Armed before React renders, so a throw in the very first render is already covered.
installCrashHandlers();
if (import.meta.env.DEV) {
  installCrashDev();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {/* Sibling ABOVE the boundary: a boundary swaps its children for the fallback, so a dialog nested
        under it would be unmounted by the very crash it reports. */}
    <CrashOverlay />
    <CrashBoundary>
      {import.meta.env.DEV && <CrashDevTrigger />}
      <QueryClientProvider client={qc}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/docs" element={<Docs />} />
            <Route path="/docs/:slug" element={<Docs />} />
            <Route path="/ide" element={<Suspense fallback={routeFallback("Opening projects", "project manager")}><Projects /></Suspense>} />
            <Route path="/ide/p/:id" element={<Suspense fallback={routeFallback("Opening workspace", "editor bundle")}><Ide /></Suspense>} />
            <Route path="/ide/s/:linkId" element={<Suspense fallback={routeFallback("Opening shared project", "collaboration client")}><SharedEntry /></Suspense>} />
            <Route path="/admin" element={<Suspense fallback={routeFallback("Opening admin", "admin console")}><Admin /></Suspense>} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </CrashBoundary>
  </React.StrictMode>,
);

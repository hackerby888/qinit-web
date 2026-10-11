import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Routes, Route } from "react-router-dom";
import LandingPage from "./landing/LandingPage";
import { Docs } from "./docs/DocsPage";
import { SplashScreen } from "./ui/Splash";
import { loadIdeModule } from "./ide/load";
import { BACKEND_ENABLED } from "./ide/cloud/backend";
import { installCrashHandlers } from "./crash/crash";
import { CrashBoundary, CrashOverlay } from "./crash/CrashDialog";
import { CrashDevTrigger, installCrashDev } from "./crash/CrashDevTrigger"; // DEV-only smoke triggers
import "./index.css";

// The IDE pulls in Monaco — lazy-load it so the landing/docs bundle stays light.
const Ide = React.lazy(loadIdeModule);
const Projects = React.lazy(() => import("./ide/Projects"));
const SharedEntry = React.lazy(() => import("./ide/cloud/SharedEntry"));
const Admin = React.lazy(() => import("./admin/AdminPage"));

const routeFallback = (label: string, task: string) => (
  <SplashScreen label={label} steps={[{ label: task, status: "loading" }]} />
);

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
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/ide" element={<Suspense fallback={routeFallback("Opening projects", "project manager")}><Projects /></Suspense>} />
          <Route path="/ide/p/:id" element={<Suspense fallback={routeFallback("Opening workspace", "editor bundle")}><Ide /></Suspense>} />
          {/* shared links and the admin console exist only with the backend */}
          <Route path="/ide/s/:linkId" element={BACKEND_ENABLED ? <Suspense fallback={routeFallback("Opening shared project", "collaboration client")}><SharedEntry /></Suspense> : <Navigate to="/ide" replace />} />
          <Route path="/admin" element={BACKEND_ENABLED ? <Suspense fallback={routeFallback("Opening admin", "admin console")}><Admin /></Suspense> : <Navigate to="/ide" replace />} />
        </Routes>
      </BrowserRouter>
    </CrashBoundary>
  </React.StrictMode>,
);

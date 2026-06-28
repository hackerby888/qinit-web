import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Docs } from "./Docs";
import "./index.css";

// The IDE pulls in Monaco — lazy-load it so the landing/docs bundle stays light.
const Ide = React.lazy(() => import("./ide/Ide"));
const Projects = React.lazy(() => import("./ide/Projects"));
const SharedEntry = React.lazy(() => import("./ide/SharedEntry"));
const Admin = React.lazy(() => import("./ide/Admin"));

// Suspense fallback while the Ide chunk loads — match the IDE's chosen palette (via the inline <script> that
// sets window.__QINIT_IDE_THEME__ before bundle load), defaulting to flat void (#0d1117).
function ideFallbackBg(): string {
  if (typeof window !== "undefined" && (window as any).__QINIT_IDE_THEME__ === "neo") return "#070908";
  return "#0d1117"; // flat void (default)
}
const ideFallback = <div style={{ minHeight: "100vh", background: ideFallbackBg() }} />;

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/ide" element={<Suspense fallback={ideFallback}><Projects /></Suspense>} />
          <Route path="/ide/p/:id" element={<Suspense fallback={ideFallback}><Ide /></Suspense>} />
          <Route path="/ide/s/:linkId" element={<Suspense fallback={ideFallback}><SharedEntry /></Suspense>} />
          <Route path="/admin" element={<Suspense fallback={ideFallback}><Admin /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

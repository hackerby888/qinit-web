import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import { Docs } from "./Docs";
import "./index.css";

// The IDE pulls in Monaco — lazy-load it so the landing/docs bundle stays light.
const Ide = React.lazy(() => import("./ide/Ide"));

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: 1 } } });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/docs" element={<Docs />} />
          <Route path="/docs/:slug" element={<Docs />} />
          <Route path="/ide" element={<Suspense fallback={<div style={{ minHeight: "100vh", background: "#070908" }} />}><Ide /></Suspense>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);

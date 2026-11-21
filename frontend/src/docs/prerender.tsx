// server entry for the docs prerender: built with `vite build --ssr`, then run by prerender-write.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { Route, Routes } from "react-router-dom";
import { StaticRouter } from "react-router-dom/server";
import { DOCS, Docs } from "./DocsPage";

export const pages = DOCS.map(({ slug, title, description }) => ({ slug, title, description }));

export const render = (slug: string): string =>
  renderToStaticMarkup(<StaticRouter location={`/docs/${slug}`}><Routes><Route path="/docs/:slug" element={<Docs />} /></Routes></StaticRouter>);

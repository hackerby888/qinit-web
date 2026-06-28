import { useEffect } from "react";
import "./landing/pixel.css";
import { KEYFRAMES } from "./landing/components";
import { CodeShowcase, Cta, Ecosystem, Features, Footer, Hero, Nav, NetworkStrip, Pillars } from "./landing/sections";
import { IdeShowcase } from "./landing/IdeShowcase";
import { applyTheme } from "./landing/tokens";

export default function App() {
  // Landing page always renders neo-brutalist. When navigating here from the IDE (flat), reset the shared
  // palette so the landing chrome reads the right colors. The IDE's useIdeTheme applies its own palette on
  // mount, so the landing and IDE never share a palette.
  useEffect(() => { applyTheme("neo"); }, []);
  return (
    <div className="pixel-root">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      {/* First fold is all black: nav + hero fill the viewport, so the white section starts below the fold. */}
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
        <Nav />
        <Hero />
      </div>
      <Pillars />
      <NetworkStrip />
      <Features />
      <IdeShowcase />
      <CodeShowcase />
      <Ecosystem />
      <Cta />
      <Footer />
    </div>
  );
}

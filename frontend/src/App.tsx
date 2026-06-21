import "./landing/pixel.css";
import { KEYFRAMES } from "./landing/components";
import { CodeShowcase, Cta, Ecosystem, Features, Footer, Hero, Nav, NetworkStrip, Pillars } from "./landing/sections";
import { IdeShowcase } from "./landing/IdeShowcase";

export default function App() {
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

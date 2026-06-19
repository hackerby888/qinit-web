import "./landing/pixel.css";
import { KEYFRAMES } from "./landing/components";
import { CodeShowcase, Cta, Ecosystem, Features, Footer, Hero, Nav, NetworkStrip, Pillars } from "./landing/sections";
import { IdeShowcase } from "./landing/IdeShowcase";

export default function App() {
  return (
    <div className="pixel-root">
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />

      <Nav />
      <Hero />
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

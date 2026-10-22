import { CodeShowcase, Cta, Features, Footer, Hero, Nav, NetworkStrip, Path, Pillars } from "./sections";
import { IdeShowcase } from "./IdeShowcase";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen">
      <div className="bg-fx" />
      <Nav />
      <main>
        <Hero />
        <Pillars />
        <NetworkStrip />
        <Features />
        <IdeShowcase />
        <CodeShowcase />
        <Path />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}

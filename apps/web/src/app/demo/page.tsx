import Link from "next/link";

const steps = [
  "Connect a Sui testnet wallet.",
  "Mint the CLAY Lofi Yeti pet.",
  "Run the AI agent task.",
  "Watch the pet move through running, review, and jumping.",
  "Save memory, inspect Walrus proof, and download the Codex pet pack."
];

export default function DemoPage() {
  return (
    <main className="demo-page">
      <section className="demo-copy">
        <p className="eyebrow">CLAY demo route</p>
        <h1>PetLofi demo script</h1>
        <ol>
          {steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <Link href="/">Back to pet room</Link>
      </section>
    </main>
  );
}

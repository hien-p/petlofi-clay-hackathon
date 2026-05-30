"use client";

import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";

type OnboardingOverlayProps = {
  onWatchDemo: () => void;
  onConnect?: () => void;
  onClose: () => void;
};

const FLOW = [
  { step: "1", icon: "🔗", action: "Connect wallet", result: "Link your Sui testnet wallet" },
  { step: "2", icon: "✨", action: "Mint to begin", result: "Your pet becomes a real object on Sui — you own it" },
  { step: "3", icon: "🍖", action: "Feed & Rest", result: "Keep Mood & Energy up (each is an on-chain action)" },
  { step: "4", icon: "🎮", action: "Play arena", result: "Survive 60s → earn XP, proof auto-saved to Walrus" },
  { step: "5", icon: "🤖", action: "Put to work", result: "Run an AI agent task → XP + a Walrus proof" },
  { step: "6", icon: "⭐", action: "Evolve", result: "Level up enough → your pet grows a stage" }
];

export function OnboardingOverlay({ onWatchDemo, onConnect, onClose }: OnboardingOverlayProps) {
  const watchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    watchRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div className="onboarding-backdrop" role="dialog" aria-modal="true" aria-label="PetLofi onboarding">
      <div className="onboarding-card">
        <button className="onboarding-close" type="button" onClick={onClose} aria-label="Close onboarding">
          <X size={16} />
        </button>
        <div className="onboarding-header">
          <span className="onboarding-mark">
            <Sparkles size={20} />
          </span>
          <div>
            <h2>PetLofi — raise your AI pet on Sui</h2>
            <p className="onboarding-sub">An on-chain Tamagotchi: care for it, put it to work, evolve it. Here is the full loop:</p>
          </div>
        </div>
        <table className="onboarding-flow">
          <thead>
            <tr>
              <th>#</th>
              <th>Do this</th>
              <th>What you get</th>
            </tr>
          </thead>
          <tbody>
            {FLOW.map((row) => (
              <tr key={row.step}>
                <td className="flow-step">{row.step}</td>
                <td className="flow-action">
                  <span className="flow-icon">{row.icon}</span>
                  {row.action}
                </td>
                <td className="flow-result">{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="onboarding-actions">
          <button ref={watchRef} className="onboarding-btn primary" type="button" onClick={onWatchDemo}>
            ▶ Watch demo (no wallet)
          </button>
          <button className="onboarding-btn secondary" type="button" onClick={onClose}>
            Explore myself
          </button>
          <button className="onboarding-link" type="button" onClick={onConnect ?? onClose}>
            Connect wallet
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingOverlay;

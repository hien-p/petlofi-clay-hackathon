"use client";

import { useEffect, useRef } from "react";
import { Sparkles, X } from "lucide-react";

type OnboardingOverlayProps = {
  onWatchDemo: () => void;
  onConnect?: () => void;
  onClose: () => void;
};

const STEPS = [
  {
    title: "A pet that lives on-chain",
    body: "Sui testnet — a real object with real stats you truly own."
  },
  {
    title: "Put it to work",
    body: "Run an AI agent task → it earns XP and a Walrus proof."
  },
  {
    title: "Mint & play for real",
    body: "Connect a wallet whenever you want to make it yours on-chain."
  }
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
          <h2>PetLofi — your AI work-pet, owned on Sui</h2>
        </div>
        <ol className="onboarding-steps">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="onboarding-step-num">{index + 1}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
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

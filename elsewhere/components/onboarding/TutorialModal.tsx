"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { TutorialSpotlight } from "@/components/onboarding/TutorialSpotlight";

/**
 * Set by signup/page.tsx after a successful signup, only if the user has never
 * finished the onboarding tutorial on this browser (see TUTORIAL_COMPLETED_KEY).
 * Consumed (removed) on first render of TutorialModal.
 */
export const TUTORIAL_PENDING_KEY = "elsewhere:pending_tutorial";

/**
 * Set when the post-signup tutorial is claimed (first feed visit after signup).
 * Prevents queuing the tutorial again on later signups on this browser.
 */
export const TUTORIAL_COMPLETED_KEY = "elsewhere:tutorial_complete";

/**
 * Each value maps to one tutorial step.
 * null  → modal is closed / tutorial not active
 * 1     → Step 1: Location services   — centered Modal
 * 2     → Step 2: Rate button         — TutorialSpotlight anchored to [data-tutorial="rate-btn"]
 * 3     → Step 3: Match score         — TutorialSpotlight anchored to [data-tutorial="match-score"]
 */
type TutorialStep = 1 | 2 | 3;

export function TutorialModal({
  onLocationEnabled,
}: {
  /**
   * Called when the tutorial step 1 is resolved (Enable OR Not now).
   * The feed uses this to un-pause the useUserLocation hook, ensuring the
   * browser location prompt fires from a user-gesture context rather than
   * automatically on mount.
   */
  onLocationEnabled?: () => void;
} = {}) {
  const [step, setStep] = useState<TutorialStep | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Only show when the signup page has set the pending flag
    const pending = localStorage.getItem(TUTORIAL_PENDING_KEY);
    if (!pending) return;

    // Consume immediately so a second signup never re-queues the tutorial
    localStorage.removeItem(TUTORIAL_PENDING_KEY);
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, "1");

    const timer = setTimeout(() => setStep(1), 2000);
    return () => clearTimeout(timer);
  }, []);

  /** Advance through the three-step tutorial, then close. */
  function advance() {
    setStep((s) => {
      if (s === 1) return 2;
      if (s === 2) return 3;
      return null; // step 3 → done (completed flag already set when pending was consumed)
    });
  }

  function handleEnable() {
    // Call getCurrentPosition synchronously inside the click handler so the
    // browser treats it as a direct user gesture — required by mobile Chrome
    // and Safari to show the native permission prompt immediately.
    // The success/error callbacks are intentionally empty here: once the
    // user responds to the prompt, onLocationEnabled() un-pauses useUserLocation
    // which fires its own getCurrentPosition and handles the result (coords or denied).
    navigator.geolocation?.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );

    // Un-pause useUserLocation so it re-fires getCurrentPosition and updates
    // the feed's location state (ready / denied / unavailable) correctly.
    onLocationEnabled?.();
    advance();
  }

  function handleNotNow() {
    // Also un-pause location so the feed can still attempt to get coords
    // (the user can always allow later via the browser address bar).
    onLocationEnabled?.();
    advance();
  }

  // Step 1 — centered modal: location services
  if (step === 1) {
    return (
      <Modal
        open
        onClose={handleNotNow}
        labelledBy="tutorial-step1-title"
        closeOnOverlayClick={false}
        closeOnEscape={false}
        contentClassName="!max-w-[300px]"
      >
        <div className="flex flex-col gap-16">
          <div className="flex flex-col gap-8 text-center">
            <h2 id="tutorial-step1-title" className="text-heading-m text-text">
              Find places near you
            </h2>
            <p className="text-body-m text-text-secondary">
              Allow location access in your browser.
              <br />
              Check the top of your screen.
            </p>
          </div>

          <div className="flex gap-8">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleNotNow}
            >
              Not now
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleEnable}>
              Enable
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  // Step 2 — anchored tooltip: Rate button
  if (step === 2) {
    return (
      <TutorialSpotlight
        targetSelector='[data-tutorial="rate-btn"]'
        placement="above"
        title="Rate places"
        body="Use this button to rate places you've been to."
        onGotIt={advance}
      />
    );
  }

  // Step 3 — anchored tooltip: Match score badge
  if (step === 3) {
    return (
      <TutorialSpotlight
        targetSelector='[data-tutorial="match-score"]'
        placement="below"
        title="Your match score"
        body="We recommend places based on what you like. Rate more places to make it more accurate."
        onGotIt={advance}
      />
    );
  }

  return null;
}

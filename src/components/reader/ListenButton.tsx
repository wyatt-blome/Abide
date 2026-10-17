"use client";

import { Button, type ButtonProps } from "@/components/ui";
import type { Speech } from "./useSpeech";

export interface ListenButtonProps extends Omit<ButtonProps, "onClick" | "children"> {
  speech: Speech;
  /** Called when the user taps Listen while idle (start the speech from here). */
  onListen: () => void;
  busy?: boolean;
  listenLabel?: string;
}

/** Listen → Pause → Resume. Disabled with an explanation where speech synthesis is missing. */
export function ListenButton({ speech, onListen, busy, listenLabel = "Listen", variant, ...rest }: ListenButtonProps) {
  if (!speech.supported) {
    return (
      <Button {...rest} variant={variant ?? "secondary"} icon="speaker" disabled aria-label="Listening isn't available in this browser">
        {listenLabel}
      </Button>
    );
  }
  if (speech.state === "speaking") {
    return (
      <Button {...rest} variant={variant ?? "primary"} icon="pause" onClick={speech.pause}>
        Pause
      </Button>
    );
  }
  if (speech.state === "paused") {
    return (
      <Button {...rest} variant={variant ?? "primary"} icon="play" onClick={speech.resume}>
        Resume
      </Button>
    );
  }
  return (
    <Button {...rest} variant={variant ?? "secondary"} icon="speaker" disabled={busy || rest.disabled} onClick={onListen}>
      {busy ? "Loading…" : listenLabel}
    </Button>
  );
}

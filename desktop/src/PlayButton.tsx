import { useEffect, useRef, useState } from 'react';
import { playUiTone } from './uiSounds';

type PlayButtonProps = {
  ariaLabel: string;
  label?: string;
  disabled?: boolean;
  reducedMotion?: boolean;
  sound?: boolean;
  onPlay: () => void;
};

export function PlayButton({ ariaLabel, label = 'PLAY', disabled = false, reducedMotion = false, sound = false, onPlay }: PlayButtonProps) {
  const [pressed, setPressed] = useState(false);
  const [pulse, setPulse] = useState(0);
  const pending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (disabled) {
      clearTimeout(timer.current);
      pending.current = false;
      setPressed(false);
    }
  }, [disabled]);

  return (
    <button
      type="button"
      className={`play${pressed && !disabled ? ' play--pressed' : ''}`}
      aria-label={ariaLabel}
      disabled={disabled}
      onPointerDown={(event) => {
        if (event.button === 0 && event.isPrimary && !disabled && !pending.current) setPressed(true);
      }}
      onPointerUp={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onLostPointerCapture={() => setPressed(false)}
      onBlur={() => setPressed(false)}
      onKeyDown={(event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat && !pending.current) setPressed(true);
      }}
      onKeyUp={() => setPressed(false)}
      onClick={() => {
        if (pending.current || disabled) return;
        setPressed(false);
        // Audio must begin inside the user gesture, even when playback waits for release.
        if (sound) playUiTone('play');
        if (reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
          onPlay();
          return;
        }
        pending.current = true;
        setPulse((value) => value + 1);
        timer.current = setTimeout(() => {
          pending.current = false;
          onPlay();
        }, 220);
      }}
    >
      <span className="play__mark" aria-hidden="true">
        <span className="play__triangle">
          <svg viewBox="0 0 24 24" focusable="false"><path d="M7 4.5 20 12 7 19.5Z" /></svg>
        </span>
        {pulse > 0 && <span key={pulse} className="play__ring" />}
      </span>
      <span className="play__label">{label}</span>
    </button>
  );
}

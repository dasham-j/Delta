"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Functional motion helpers.
 *
 * The rule, enforced here: motion exists to signal *change over time*. These
 * hooks fire only when a value actually changes between renders, never on
 * first paint, so a flash always means "this just updated" and nothing else.
 * `prefers-reduced-motion` is honoured in CSS (globals.css), which collapses
 * every animation these hooks trigger to an instant — so no value is ever
 * hidden behind an effect a reduced-motion user cannot see.
 */

const FLASH_MS = 760;

/**
 * Returns a key that changes each time `value` changes, suitable for React's
 * `key` to restart a CSS flash animation. Returns 0 until the first change,
 * so there is no flash on mount.
 */
export function useChangeKey(value: unknown): number {
  const previous = useRef<unknown>(value);
  const [key, setKey] = useState(0);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (!Object.is(previous.current, value)) {
      previous.current = value;
      setKey((k) => k + 1);
    }
  }, [value]);

  return key;
}

/**
 * True for a short window immediately after `value` changes (but not on mount).
 * Use to add a flash class; it clears itself.
 */
export function useFlash(value: unknown): boolean {
  const previous = useRef<unknown>(value);
  const mounted = useRef(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previous.current = value;
      return;
    }
    if (Object.is(previous.current, value)) return;
    previous.current = value;
    setOn(true);
    const id = setTimeout(() => setOn(false), FLASH_MS);
    return () => clearTimeout(id);
  }, [value]);

  return on;
}

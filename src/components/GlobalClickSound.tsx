"use client";

import { useEffect, useMemo, useRef } from "react";

type AudioPool = {
  nextIndex: number;
  clips: HTMLAudioElement[];
};

function approach(current: number, target: number, maxDelta: number) {
  if (current < target) return Math.min(target, current + maxDelta);
  if (current > target) return Math.max(target, current - maxDelta);
  return current;
}

function makeAudioPool(url: string, poolSize: number, volume: number): AudioPool {
  const clips = Array.from({ length: poolSize }, () => {
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = volume;
    return audio;
  });

  return { nextIndex: 0, clips };
}

export function GlobalClickSound() {
  const clickUrls = useMemo(() => ["/sounds/clickDown.mp3", "/sounds/clickUp.mp3"], []);
  const scrollUrl = useMemo(() => "/sounds/scroll.mp3", []);

  const clickPoolsRef = useRef<AudioPool[] | null>(null);
  const scrollAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastPointerDownAtRef = useRef(0);

  const lastWheelAtRef = useRef(0);
  const wheelIntensityRef = useRef(0);
  const scrollTargetRateRef = useRef(1);
  const scrollCurrentRateRef = useRef(1);
  const scrollTargetVolRef = useRef(0);
  const scrollCurrentVolRef = useRef(0);

  useEffect(() => {
    clickPoolsRef.current = clickUrls.map((url) => makeAudioPool(url, 4, 0.35));
    const scrollAudio = new Audio(scrollUrl);
    scrollAudio.preload = "auto";
    scrollAudio.loop = true;
    scrollAudio.volume = 0;
    scrollAudio.playbackRate = 1;
    scrollAudioRef.current = scrollAudio;

    const onPointerDown = (event: PointerEvent) => {
      // Only play for primary button clicks (ignore right click / pen barrel buttons)
      if (typeof (event as unknown as MouseEvent).button === "number") {
        const button = (event as unknown as MouseEvent).button;
        if (button !== 0) return;
      }

      // Avoid double-trigger (some setups dispatch both pointerdown & click handlers)
      const now = performance.now();
      if (now - lastPointerDownAtRef.current < 25) return;
      lastPointerDownAtRef.current = now;

      const pools = clickPoolsRef.current;
      if (!pools || pools.length === 0) return;

      // Randomize between the two tracks
      const pool = pools[Math.floor(Math.random() * pools.length)];
      const audio = pool.clips[pool.nextIndex];
      pool.nextIndex = (pool.nextIndex + 1) % pool.clips.length;

      try {
        audio.currentTime = 0;
        void audio.play();
      } catch {
        // ignore autoplay/interaction errors
      }
    };

    const onWheel = (event: WheelEvent) => {
      const scrollAudio = scrollAudioRef.current;
      if (!scrollAudio) return;

      const now = performance.now();
      const dtWheel = Math.min(0.05, Math.max(0.001, (now - lastWheelAtRef.current) / 1000));
      lastWheelAtRef.current = now;

      // Linear intensity proxy based on wheel delta magnitude (more predictable/linear).
      const raw = Math.abs(event.deltaY);
      const clamped = Math.min(220, raw);
      wheelIntensityRef.current = approach(wheelIntensityRef.current, clamped, 900 * dtWheel);
      const normalized = Math.min(1, wheelIntensityRef.current / 120);

      // Map intensity -> playback rate & volume (linear).
      const targetRate = 1 + normalized * 0.55;
      const targetVol = normalized * 0.32;

      scrollTargetRateRef.current = targetRate;
      scrollTargetVolRef.current = targetVol;

      // Ensure audio is running (wheel events count as user interaction).
      if (scrollAudio.paused) {
        try {
          void scrollAudio.play();
        } catch {
          // ignore
        }
      }
    };

    let rafId = 0;
    let lastRafAt = performance.now();
    const tick = () => {
      rafId = requestAnimationFrame(tick);

      const scrollAudio = scrollAudioRef.current;
      if (!scrollAudio) return;

      const now = performance.now();
      const dt = Math.min(0.05, (now - lastRafAt) / 1000);
      lastRafAt = now;

      // If wheel hasn't happened recently, decay targets back to rest.
      const sinceWheel = now - lastWheelAtRef.current;
      if (sinceWheel > 90) {
        scrollTargetVolRef.current = Math.max(0, scrollTargetVolRef.current - 0.9 * dt);
        scrollTargetRateRef.current = approach(scrollTargetRateRef.current, 1, 1.2 * dt);
      }

      // Move toward targets with a constant max speed (more linear feel).
      scrollCurrentRateRef.current = approach(
        scrollCurrentRateRef.current,
        scrollTargetRateRef.current,
        3.0 * dt,
      );
      scrollCurrentVolRef.current = approach(
        scrollCurrentVolRef.current,
        scrollTargetVolRef.current,
        2.0 * dt,
      );

      scrollAudio.playbackRate = scrollCurrentRateRef.current;
      scrollAudio.volume = scrollCurrentVolRef.current;

      // Stop fully when it becomes inaudible.
      if (sinceWheel > 220 && scrollCurrentVolRef.current < 0.01) {
        scrollAudio.pause();
        scrollAudio.currentTime = 0;
      }
    };
    rafId = requestAnimationFrame(tick);

    document.addEventListener("pointerdown", onPointerDown, { capture: true });
    document.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("wheel", onWheel, { capture: true } as AddEventListenerOptions);

      cancelAnimationFrame(rafId);
      const scrollAudio = scrollAudioRef.current;
      if (scrollAudio) {
        scrollAudio.pause();
        scrollAudio.src = "";
      }
    };
  }, [clickUrls, scrollUrl]);

  return null;
}

import { ControlType } from "./types";

export function setupControls(
  controlTypeRef: React.MutableRefObject<ControlType>,
  mountRef: React.MutableRefObject<HTMLDivElement | null>,
  isPausedRef: React.MutableRefObject<boolean>,
  isGameOverRef: React.MutableRefObject<boolean>,
  setIsPaused: (paused: boolean) => void,
  restartGame: () => void
) {
  let steer = 0;
  let mouseX = 0;
  let forward = 0; // 0 = stopped, 1 = forward, -1 = reverse
  let leftMouseDown = false;
  let rightMouseDown = false;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      steer = 1;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      steer = -1;
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      forward = 1;
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      forward = -1;
      e.preventDefault();
    } else if (e.key === "p" || e.key === "P") {
      if (!isGameOverRef.current) {
        isPausedRef.current = !isPausedRef.current;
        setIsPaused(isPausedRef.current);
      }
      e.preventDefault();
    } else if (e.key === "r" || e.key === "R") {
      restartGame();
      e.preventDefault();
    }
  };

  const onKeyUp = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft" && steer === 1) {
      steer = 0;
      e.preventDefault();
    } else if (e.key === "ArrowRight" && steer === -1) {
      steer = 0;
      e.preventDefault();
    } else if (e.key === "ArrowUp" && forward === 1) {
      forward = 0;
      e.preventDefault();
    } else if (e.key === "ArrowDown" && forward === -1) {
      forward = 0;
      e.preventDefault();
    }
  };

  const onMouseMove = (e: MouseEvent) => {
    if (controlTypeRef.current === 'mouse' && mountRef.current) {
      const rect = mountRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      mouseX = e.clientX - centerX;
      const normalizedX = mouseX / (rect.width / 2);
      if (Math.abs(normalizedX) < 0.1) {
        steer = 0;
      } else {
        steer = -normalizedX;
      }
    }
  };

  const onMouseDown = (e: MouseEvent) => {
    if (controlTypeRef.current === 'mouse') {
      if (e.button === 0) { // Left click
        leftMouseDown = true;
        forward = 1;
        e.preventDefault();
      } else if (e.button === 2) { // Right click
        rightMouseDown = true;
        forward = -1;
        e.preventDefault();
      }
    }
  };

  const onMouseUp = (e: MouseEvent) => {
    if (controlTypeRef.current === 'mouse') {
      if (e.button === 0) { // Left click
        leftMouseDown = false;
        if (!rightMouseDown) {
          forward = 0;
        }
        e.preventDefault();
      } else if (e.button === 2) { // Right click
        rightMouseDown = false;
        if (!leftMouseDown) {
          forward = 0;
        } else {
          forward = 1; // Left still down, go forward
        }
        e.preventDefault();
      }
    }
  };

  const onContextMenu = (e: MouseEvent) => {
    if (controlTypeRef.current === 'mouse') {
      e.preventDefault();
    }
  };

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  window.addEventListener("mousedown", onMouseDown, { passive: false });
  window.addEventListener("mouseup", onMouseUp, { passive: false });
  window.addEventListener("contextmenu", onContextMenu, { passive: false });

  return {
    getSteer: () => steer,
    getForward: () => forward,
    cleanup: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
    },
  };
}

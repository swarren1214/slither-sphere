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

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      steer = 1;
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      steer = -1;
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

  window.addEventListener("keydown", onKeyDown, { passive: false });
  window.addEventListener("keyup", onKeyUp, { passive: false });
  window.addEventListener("mousemove", onMouseMove, { passive: true });

  return {
    getSteer: () => steer,
    cleanup: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousemove", onMouseMove);
    },
  };
}

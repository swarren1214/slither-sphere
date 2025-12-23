import * as THREE from "three";
import { Difficulty, DifficultySettings, GameConfig } from "./types";

export const DIFFICULTY_SETTINGS: Record<Difficulty, DifficultySettings> = {
  easy: { speedMultiplier: 0.75, barrierCount: 8, barrierRadius: 5, barrierHeight: 12 },
  medium: { speedMultiplier: 1.0, barrierCount: 12, barrierRadius: 6, barrierHeight: 15 },
  hard: { speedMultiplier: 1.25, barrierCount: 16, barrierRadius: 7, barrierHeight: 18 }
};

export function getGameConfig(difficulty: Difficulty): GameConfig {
  const R = 800; // sphere radius (2x bigger)
  const diffSettings = DIFFICULTY_SETTINGS[difficulty];
  
  const baseSpeed = 200;
  const moveSpeed = baseSpeed * diffSettings.speedMultiplier;
  const snakeLift = 7;
  const dotLift = 3.6;
  
  return {
    sphereRadius: R,
    moveSpeed,
    steerSpeed: 1.9,
    segmentSpacing: 18,
    initialSegments: 5,
    dotCount: 35,
    dotRadius: 4.4,
    eatDistance: 13,
    snakeLift,
    dotLift,
    barrierCount: diffSettings.barrierCount,
    barrierRadius: diffSettings.barrierRadius,
    barrierHeight: diffSettings.barrierHeight,
    barrierLift: 3.6,
    snakeRadius: R + snakeLift,
    dotSurfaceRadius: R + dotLift,
    acceleration: 300, // Speed units per second squared
    deceleration: 250, // Speed units per second squared
  };
}

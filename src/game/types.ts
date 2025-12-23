import * as THREE from "three";

export type Dot = {
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
};

export type Barrier = {
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
  wallSegments?: THREE.Mesh[];
  curve?: THREE.CatmullRomCurve3;
  tubeRadius?: number;
};

export type MenuScreen = 'main' | 'playing' | 'settings' | 'store';
export type ControlType = 'keyboard' | 'mouse';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultySettings {
  speedMultiplier: number;
  barrierCount: number;
  barrierRadius: number;
  barrierHeight: number;
}

export interface GameConfig {
  sphereRadius: number;
  moveSpeed: number;
  steerSpeed: number;
  segmentSpacing: number;
  initialSegments: number;
  dotCount: number;
  dotRadius: number;
  eatDistance: number;
  snakeLift: number;
  dotLift: number;
  barrierCount: number;
  barrierRadius: number;
  barrierHeight: number;
  barrierLift: number;
  snakeRadius: number;
  dotSurfaceRadius: number;
  acceleration: number;
  deceleration: number;
  reverseSpeedMultiplier: number;
}

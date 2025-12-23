# Game Module Structure

This directory contains the modular game logic for Slither Sphere, organized into separate, reusable components.

## Files

### `types.ts`
Core TypeScript types and interfaces used throughout the game:
- `Dot` - Fruit/collectible objects
- `Barrier` - Obstacle objects  
- `MenuScreen`, `ControlType`, `Difficulty` - UI and settings types
- `DifficultySettings`, `GameConfig` - Configuration interfaces

### `utils.ts`
Mathematical utilities for 3D game mechanics:
- `randomUnitVector()` - Generate random points on sphere surface
- `rotateAroundAxis()` - Rodrigues' rotation formula for snake movement

### `config.ts`
Game configuration and difficulty settings:
- `DIFFICULTY_SETTINGS` - Speed and barrier counts for each difficulty
- `getGameConfig()` - Returns complete game configuration based on difficulty

### `world.ts`
Creates the 3D environment:
- Globe/sphere mesh
- Background star field  
- Wireframe grid overlay
- Lighting setup

### `snake.ts`
Snake creation and rendering:
- Snake head mesh
- Body segment meshes
- Materials and geometry

### `dots.ts`
Fruit/collectible system:
- Dot mesh creation
- Spawning logic
- Respawn functionality

### `barriers.ts`
Obstacle system:
- Barrier mesh creation
- Random placement on sphere
- Collision geometry

### `controls.ts`
Input handling:
- Keyboard controls (arrow keys)
- Mouse controls (horizontal movement)
- Pause/restart functionality
- Returns `getSteer()` function and cleanup

## Usage Example

```typescript
import { getGameConfig } from "@/game/config";
import { createWorld } from "@/game/world";
import { createSnake } from "@/game/snake";
import { createDots } from "@/game/dots";
import { createBarriers } from "@/game/barriers";
import { setupControls } from "@/game/controls";

// Get configuration
const config = getGameConfig('medium');

// Create scene components
const { stars } = createWorld(scene, config.sphereRadius);
const { headMesh, bodyMeshes } = createSnake(scene);
const { dots, respawnDot } = createDots(scene, config.dotCount, ...);
const { barriers } = createBarriers(scene, config.barrierCount, ...);

// Setup controls
const controls = setupControls(refs, callbacks);
const steer = controls.getSteer();
```

## Benefits of Modular Structure

1. **Separation of Concerns** - Each file has a single responsibility
2. **Easier Testing** - Individual modules can be tested in isolation
3. **Better Maintainability** - Changes to visuals don't affect game logic
4. **Reusability** - Components can be used in different contexts
5. **Clearer Dependencies** - Import statements show exactly what's needed
6. **Easier Navigation** - Find specific functionality quickly

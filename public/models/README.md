# 3D Model Assets

Place your 3D model files in this directory.

## Supported Formats

- **GLTF/GLB** (recommended) - `.gltf` or `.glb`
- **FBX** - `.fbx`
- **OBJ** - `.obj` (with `.mtl` material file)

## Recommended Export Settings from Blender

### For GLTF/GLB (Recommended):
1. File → Export → glTF 2.0 (.glb/.gltf)
2. Settings:
   - Format: GLB (Binary)
   - Include: Selected Objects (or whole scene)
   - Transform: +Y Up
   - Geometry: Apply Modifiers
   - Materials: Export
   - Compression: Enable if file size is large

### For FBX:
1. File → Export → FBX (.fbx)
2. Settings:
   - Selected Objects: On
   - Object Types: Mesh, Armature
   - Apply Scalings: FBX All
   - Forward: -Z Forward
   - Up: Y Up

## Example Asset Structure

```
public/models/
├── world/
│   └── sphere-planet.glb
├── snake/
│   └── snake-body.glb
├── collectibles/
│   └── fruit.glb
└── obstacles/
    └── barrier.glb
```

## Usage in Code

```typescript
import { loadAsset } from '@/game/assetLoader';

// Load a single model
const asset = await loadAsset('/models/world/sphere-planet.glb', 'glb');
scene.add(asset.scene);

// Load multiple models
const assets = await loadAssets([
  { name: 'world', path: '/models/world/sphere-planet.glb', type: 'glb' },
  { name: 'snake', path: '/models/snake/snake-body.glb', type: 'glb' },
]);

scene.add(assets.world.scene);
scene.add(assets.snake.scene);
```

## Tips

- Keep models optimized (low poly count for better performance)
- Use power-of-two texture sizes (256, 512, 1024, 2048)
- Bake lighting and textures when possible
- Center your models at origin (0,0,0) in Blender before export
- Apply all transforms before exporting

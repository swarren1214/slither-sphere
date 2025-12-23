import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three-stdlib";
import { FBXLoader } from "three-stdlib";
import { OBJLoader } from "three-stdlib";

export type AssetType = 'gltf' | 'glb' | 'fbx' | 'obj';

export interface LoadedAsset {
  scene: THREE.Group | THREE.Object3D;
  animations?: THREE.AnimationClip[];
  mixer?: THREE.AnimationMixer;
}

/**
 * Load a 3D model asset
 * @param path - Path to the model file (relative to public folder)
 * @param type - File type (gltf, glb, fbx, obj)
 * @returns Promise with the loaded asset
 */
export async function loadAsset(path: string, type: AssetType): Promise<LoadedAsset> {
  return new Promise((resolve, reject) => {
    switch (type) {
      case 'gltf':
      case 'glb': {
        const loader = new GLTFLoader();
        loader.load(
          path,
          (gltf: GLTF) => {
            const asset: LoadedAsset = {
              scene: gltf.scene,
              animations: gltf.animations,
            };
            
            // Set up animation mixer if animations exist
            if (gltf.animations.length > 0) {
              asset.mixer = new THREE.AnimationMixer(gltf.scene);
            }
            
            resolve(asset);
          },
          undefined,
          (error: unknown) => reject(error)
        );
        break;
      }
      
      case 'fbx': {
        const loader = new FBXLoader();
        loader.load(
          path,
          (fbx: THREE.Group) => {
            const asset: LoadedAsset = {
              scene: fbx,
              animations: fbx.animations,
            };
            
            if (fbx.animations.length > 0) {
              asset.mixer = new THREE.AnimationMixer(fbx);
            }
            
            resolve(asset);
          },
          undefined,
          (error: unknown) => reject(error)
        );
        break;
      }
      
      case 'obj': {
        const loader = new OBJLoader();
        loader.load(
          path,
          (obj: THREE.Group) => {
            resolve({ scene: obj });
          },
          undefined,
          (error: unknown) => reject(error)
        );
        break;
      }
      
      default:
        reject(new Error(`Unsupported asset type: ${type}`));
    }
  });
}

/**
 * Load multiple assets in parallel
 * @param assets - Array of asset configurations
 * @returns Promise with all loaded assets
 */
export async function loadAssets(
  assets: Array<{ name: string; path: string; type: AssetType }>
): Promise<Record<string, LoadedAsset>> {
  const promises = assets.map(async (asset) => ({
    name: asset.name,
    data: await loadAsset(asset.path, asset.type),
  }));
  
  const results = await Promise.all(promises);
  
  return results.reduce((acc, { name, data }) => {
    acc[name] = data;
    return acc;
  }, {} as Record<string, LoadedAsset>);
}

/**
 * Apply transformations to a loaded model
 */
export function transformModel(
  model: THREE.Object3D,
  options: {
    position?: THREE.Vector3;
    rotation?: THREE.Euler;
    scale?: number | THREE.Vector3;
  }
) {
  if (options.position) {
    model.position.copy(options.position);
  }
  
  if (options.rotation) {
    model.rotation.copy(options.rotation);
  }
  
  if (options.scale) {
    if (typeof options.scale === 'number') {
      model.scale.setScalar(options.scale);
    } else {
      model.scale.copy(options.scale);
    }
  }
  
  return model;
}

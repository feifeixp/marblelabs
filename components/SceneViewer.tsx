
import React, { useRef, useState, useEffect, useCallback } from 'react';
import * as pc from 'playcanvas';
import EditorPanel from './EditorPanel';
import { TargetType, GizmoMode, TransformType, Axis, EnvironmentState, Character } from '../types';
import { SSAO_SCRIPT_CONTENT } from '../services/ssaoScript';

// Expose pc to window for legacy scripts (like ssao) that expect it globally
if (typeof window !== 'undefined') {
  (window as any).pc = pc;
}

interface SceneViewerProps {
  splatUrl: string | null;
  characters: Character[];
  onRemoveCharacter: (id: string) => void;
  captureRef: React.MutableRefObject<any>;
  onCameraMove?: () => void;
}

const SKYBOX_URLS: Record<string, string> = {
  'sky_41_2k': '/cubemaps/sky_41_2k.png', // Local Equirectangular (Panorama)
  'helipad': '/cubemaps/helipad.dds', // Local Cubemap (DDS)
  'studio': 'https://playcanvas.github.io/examples/assets/cubemaps/studio.dds', // CDN fallback
};

const SceneViewer: React.FC<SceneViewerProps> = ({ splatUrl, characters, onRemoveCharacter, captureRef, onCameraMove }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appRef = useRef<pc.Application | null>(null);
  const cameraEntityRef = useRef<pc.Entity | null>(null);
  
  // Entities
  const splatEntityRef = useRef<pc.Entity | null>(null);
  const characterEntitiesMapRef = useRef<Map<string, pc.Entity>>(new Map()); // id -> entity
  
  // Gizmo Refs
  const gizmoRootRef = useRef<pc.Entity | null>(null);
  const gizmoLayerIdRef = useRef<number>(100);
  const draggedAxisRef = useRef<string | null>(null); 
  const dragStartPointRef = useRef<pc.Vec3>(new pc.Vec3());
  const dragStartValueRef = useRef<pc.Vec3>(new pc.Vec3());
  const dragPlaneRef = useRef<pc.Plane>(new pc.Plane());

  // Interaction Refs
  const isOrbitingRef = useRef(false);
  const isFreeLookingRef = useRef(false); 
  const orbitParamsRef = useRef({ alpha: 0, beta: 0, radius: 5, targetPivot: new pc.Vec3() });
  const mouseLookEulerRef = useRef<pc.Vec3>(new pc.Vec3());
  
  // Assets Refs
  const currentSkyboxAssetRef = useRef<pc.Asset | null>(null);
  const ssaoScriptLoadedRef = useRef(false);

  // React State (for UI)
  const [isLocked, setIsLocked] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Selection
  const [selectedTarget, setSelectedTarget] = useState<TargetType | null>('scene');
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);

  const [gizmoMode, setGizmoMode] = useState<GizmoMode>('translate');
  const [transforms, setTransforms] = useState({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  });
  
  // Environment State (Pure IBL + Camera)
  const [envState, setEnvState] = useState<EnvironmentState>({
    skyboxId: 'helipad', // Changed default to helipad as user has dds files
    customSkyboxUrl: undefined,
    customSkyboxFileName: undefined,
    skyboxIntensity: 1.0,
    skyboxRotation: 0,
    exposure: 1.0,
    cameraFov: 60,
    cameraSpeed: 2.0,
    fogEnabled: false,
    fogColor: '#000000',
    fogDensity: 0.01,
    aoEnabled: false,
    aoIntensity: 1.0,
    aoRadius: 5.0,
  });

  // Load Version Signal
  const [sceneLoadVersion, setSceneLoadVersion] = useState(0);

  // Refs for Engine Loop
  const isLockedRef = useRef(false);
  const isEditModeRef = useRef(false);
  const selectedTargetRef = useRef<TargetType | null>('scene');
  const activeCharacterIdRef = useRef<string | null>(null);
  const envStateRef = useRef(envState); // To access speed in update loop

  // Constants
  const COLOR_X = new pc.Color(0.9, 0.2, 0.2, 1);
  const COLOR_Y = new pc.Color(0.2, 0.9, 0.2, 1);
  const COLOR_Z = new pc.Color(0.2, 0.2, 0.9, 1);

  // --- Sync State to Refs ---
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  useEffect(() => { selectedTargetRef.current = selectedTarget; }, [selectedTarget]);
  useEffect(() => { activeCharacterIdRef.current = activeCharacterId; }, [activeCharacterId]);
  useEffect(() => { envStateRef.current = envState; }, [envState]);

  // --- Helper: Material Creation ---
  const createColorMaterial = (color: pc.Color) => {
    const material = new pc.StandardMaterial();
    material.diffuse = color;
    material.emissive = color;
    material.useLighting = false;
    material.depthTest = false; 
    material.update();
    return material;
  };

  // --- Helper: Hex to Color ---
  const hexToPcColor = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? new pc.Color(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    ) : new pc.Color(1, 1, 1);
  };

  // --- Logic: Get Active Target ---
  const getTargetEntity = useCallback(() => {
    if (selectedTarget === 'scene') return splatEntityRef.current;
    if (selectedTarget === 'character' && activeCharacterId) {
        return characterEntitiesMapRef.current.get(activeCharacterId) || null;
    }
    return null;
  }, [selectedTarget, activeCharacterId]);

  // --- Logic: Orbit Calculation ---
  const syncOrbitParamsToCamera = useCallback(() => {
    const target = getTargetEntity();
    if (!target || !cameraEntityRef.current) return;

    const targetPos = target.getPosition();
    const camPos = cameraEntityRef.current.getPosition();
    
    const vec = new pc.Vec3().sub2(camPos, targetPos);
    const radius = vec.length();
    
    let alpha = Math.atan2(vec.x, vec.z) * pc.math.RAD_TO_DEG;
    let beta = Math.asin(vec.y / (radius || 0.001)) * pc.math.RAD_TO_DEG;
    
    orbitParamsRef.current = {
        alpha,
        beta,
        radius,
        targetPivot: targetPos.clone()
    };
  }, [getTargetEntity]);

  // --- Logic: Focus Camera ---
  const handleFocus = useCallback(() => {
      const target = getTargetEntity();
      if (!target || !cameraEntityRef.current) return;

      const tPos = target.getPosition();
      const camPos = cameraEntityRef.current.getPosition();
      
      let dir = new pc.Vec3().sub2(camPos, tPos).normalize();
      if (dir.length() === 0) dir.set(0, 0, 1);

      const focusDist = 4.0;
      const newPos = tPos.clone().add(dir.mulScalar(focusDist));

      cameraEntityRef.current.setPosition(newPos);
      cameraEntityRef.current.lookAt(tPos);

      const euler = cameraEntityRef.current.getEulerAngles();
      mouseLookEulerRef.current.set(euler.x, euler.y, 0);
      syncOrbitParamsToCamera();

  }, [getTargetEntity, syncOrbitParamsToCamera]);

  // --- Gizmo Logic ---
  const rebuildGizmo = useCallback(() => {
      if (!appRef.current) return;
      
      // Cleanup old gizmo
      if (gizmoRootRef.current) {
          gizmoRootRef.current.destroy();
          gizmoRootRef.current = null;
      }

      if (!isEditMode || !selectedTarget) return;

      const app = appRef.current;
      const root = new pc.Entity('GizmoRoot');
      app.root.addChild(root);
      gizmoRootRef.current = root;

      const matX = createColorMaterial(COLOR_X);
      const matY = createColorMaterial(COLOR_Y);
      const matZ = createColorMaterial(COLOR_Z);

      const addPart = (name: string, type: string, mat: pc.StandardMaterial, p: pc.Vec3, r: pc.Vec3, s: pc.Vec3) => {
          const e = new pc.Entity(name);
          e.addComponent('render', { 
            type: type,
            layers: [gizmoLayerIdRef.current] 
          });
          if (e.render && e.render.meshInstances && e.render.meshInstances.length > 0) {
            e.render.meshInstances[0].material = mat;
            e.render.meshInstances[0].renderStyle = pc.RENDERSTYLE_SOLID;
            (e.render.meshInstances[0] as any).gizmoAxis = name;
          }
          e.setLocalPosition(p);
          e.setLocalEulerAngles(r);
          e.setLocalScale(s);
          root.addChild(e);
          return e;
      };

      const cylThickness = 0.08;
      const cylLen = 1.0;
      const headScale = 0.3; 
      const headLen = 0.4; 
      const sphereScale = 0.25;

      if (gizmoMode === 'translate') {
          addPart('tx', 'cylinder', matX, new pc.Vec3(0.5, 0, 0), new pc.Vec3(0, 0, 90), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('tx', 'cone', matX, new pc.Vec3(1.0, 0, 0), new pc.Vec3(0, 0, -90), new pc.Vec3(headScale, headLen, headScale));
          addPart('tx', 'sphere', matX, new pc.Vec3(1.3, 0, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(sphereScale, sphereScale, sphereScale));

          addPart('ty', 'cylinder', matY, new pc.Vec3(0, 0.5, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('ty', 'cone', matY, new pc.Vec3(0, 1.0, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(headScale, headLen, headScale));
          addPart('ty', 'sphere', matY, new pc.Vec3(0, 1.3, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(sphereScale, sphereScale, sphereScale));

          addPart('tz', 'cylinder', matZ, new pc.Vec3(0, 0, 0.5), new pc.Vec3(90, 0, 0), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('tz', 'cone', matZ, new pc.Vec3(0, 0, 1.0), new pc.Vec3(90, 0, 0), new pc.Vec3(headScale, headLen, headScale));
          addPart('tz', 'sphere', matZ, new pc.Vec3(0, 0, 1.3), new pc.Vec3(0, 0, 0), new pc.Vec3(sphereScale, sphereScale, sphereScale));

      } else if (gizmoMode === 'rotate') {
          const ringScale = 1.2;
          const ringThick = 0.08;
          addPart('rx', 'cylinder', matX, new pc.Vec3(0, 0, 0), new pc.Vec3(0, 0, 90), new pc.Vec3(ringScale, ringThick, ringScale)); 
          addPart('ry', 'cylinder', matY, new pc.Vec3(0, 0, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(ringScale, ringThick, ringScale));
          addPart('rz', 'cylinder', matZ, new pc.Vec3(0, 0, 0), new pc.Vec3(90, 0, 0), new pc.Vec3(ringScale, ringThick, ringScale));

      } else if (gizmoMode === 'scale') {
          addPart('sx', 'cylinder', matX, new pc.Vec3(0.5, 0, 0), new pc.Vec3(0, 0, 90), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('sx', 'box', matX, new pc.Vec3(1.1, 0, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(headScale, headScale, headScale));
          addPart('sy', 'cylinder', matY, new pc.Vec3(0, 0.5, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('sy', 'box', matY, new pc.Vec3(0, 1.1, 0), new pc.Vec3(0, 0, 0), new pc.Vec3(headScale, headScale, headScale));
          addPart('sz', 'cylinder', matZ, new pc.Vec3(0, 0, 0.5), new pc.Vec3(90, 0, 0), new pc.Vec3(cylThickness, cylLen, cylThickness));
          addPart('sz', 'box', matZ, new pc.Vec3(0, 0, 1.1), new pc.Vec3(0, 0, 0), new pc.Vec3(headScale, headScale, headScale));
      }
      
      const target = getTargetEntity();
      if (target && gizmoRootRef.current) {
          gizmoRootRef.current.setPosition(target.getPosition());
          gizmoRootRef.current.setRotation(target.getRotation());
      }

  }, [isEditMode, gizmoMode, selectedTarget, getTargetEntity]);

  useEffect(() => { rebuildGizmo(); }, [rebuildGizmo, sceneLoadVersion]);


  // --- Transform Logic ---
  const updateLocalStateFromEntity = useCallback(() => {
    const entity = getTargetEntity();
    if (entity) {
      const pos = entity.getLocalPosition();
      const rot = entity.getLocalEulerAngles();
      const scl = entity.getLocalScale();
      
      setTransforms({
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z },
        scale: { x: scl.x, y: scl.y, z: scl.z },
      });
    }
  }, [getTargetEntity]);

  useEffect(() => {
    if (isEditMode) {
      updateLocalStateFromEntity();
      if (gizmoRootRef.current && getTargetEntity()) {
          const t = getTargetEntity()!;
          gizmoRootRef.current.setPosition(t.getPosition());
          gizmoRootRef.current.setRotation(t.getRotation());
      }
    }
  }, [isEditMode, selectedTarget, activeCharacterId, updateLocalStateFromEntity, getTargetEntity, sceneLoadVersion]);

  const handleTransformChange = (type: TransformType, axis: Axis, value: number) => {
    const entity = getTargetEntity();
    if (!entity) return;

    setTransforms(prev => ({
      ...prev,
      [type]: { ...prev[type], [axis]: value }
    }));

    if (type === 'position') {
      const current = entity.getLocalPosition();
      const newVal = { x: current.x, y: current.y, z: current.z };
      newVal[axis] = value;
      entity.setLocalPosition(newVal.x, newVal.y, newVal.z);
    } else if (type === 'rotation') {
      const current = entity.getLocalEulerAngles();
      const newVal = { x: current.x, y: current.y, z: current.z };
      newVal[axis] = value;
      entity.setLocalEulerAngles(newVal.x, newVal.y, newVal.z);
    } else if (type === 'scale') {
      const current = entity.getLocalScale();
      const newVal = { x: current.x, y: current.y, z: current.z };
      newVal[axis] = value;
      entity.setLocalScale(newVal.x, newVal.y, newVal.z);
    }
    
    // Sync Gizmo
    if (gizmoRootRef.current) {
        gizmoRootRef.current.setPosition(entity.getPosition());
        gizmoRootRef.current.setRotation(entity.getRotation());
    }
  };

  const handleEnvChange = (key: keyof EnvironmentState, value: any) => {
    setEnvState(prev => ({
      ...prev,
      [key]: value
    }));
  };

  // --- Environment Logic (Lighting, Camera, Fog, Exposure, AO) ---
  useEffect(() => {
    if (!appRef.current) return;
    const app = appRef.current;

    // 1. Skybox Settings
    app.scene.skyboxIntensity = envState.skyboxIntensity;
    app.scene.skyboxRotation = new pc.Quat().setFromEulerAngles(0, envState.skyboxRotation, 0);

    // 2. Exposure
    (app.scene as any).exposure = envState.exposure;

    // 3. Camera FOV
    if (cameraEntityRef.current && cameraEntityRef.current.camera) {
        cameraEntityRef.current.camera.fov = envState.cameraFov;
    }

    // 4. Fog
    const scene = app.scene as any;
    if (envState.fogEnabled) {
        scene.fog = pc.FOG_EXP2;
        scene.fogColor = hexToPcColor(envState.fogColor);
        scene.fogDensity = envState.fogDensity;
    } else {
        scene.fog = pc.FOG_NONE;
    }

    // 5. Ambient Occlusion (SSAO)
    if (cameraEntityRef.current && ssaoScriptLoadedRef.current) {
        const camera = cameraEntityRef.current;
        
        if (envState.aoEnabled) {
            // Ensure script component exists
            if (!camera.script) camera.addComponent('script');
            
            // Ensure 'ssao' instance exists
            if (!camera.script!.has('ssao')) {
                camera.script!.create('ssao', {
                    attributes: {
                        radius: envState.aoRadius,
                        intensity: envState.aoIntensity,
                        samples: 16,
                        brightness: 0,
                    }
                });
            } else {
                // Update Attributes
                const ssao = (camera.script as any).ssao;
                ssao.radius = envState.aoRadius;
                ssao.intensity = envState.aoIntensity;
            }
        } else {
            // Destroy SSAO if disabled
            if (camera.script && camera.script.has('ssao')) {
                camera.script.destroy('ssao');
            }
        }
    }

  }, [envState]);

  // --- Dynamic Skybox Loading ---
  useEffect(() => {
    if (!appRef.current) return;
    const app = appRef.current;
    
    // Determine URL: Custom vs Preset
    let url = '';
    let filename = '';
    let isCustom = false;

    if (envState.skyboxId === 'custom') {
        if (!envState.customSkyboxUrl) return; // Wait for upload
        url = envState.customSkyboxUrl;
        filename = envState.customSkyboxFileName || 'custom.jpg'; // fallback
        isCustom = true;
    } else {
        url = SKYBOX_URLS[envState.skyboxId];
        filename = url;
    }
    
    if (!url) return;
    
    // If loading same asset, skip
    if (currentSkyboxAssetRef.current && currentSkyboxAssetRef.current.name === (isCustom ? 'custom' : envState.skyboxId) && !isCustom) return;

    const isDDS = filename.toLowerCase().endsWith('.dds');
    const isHDR = filename.toLowerCase().endsWith('.hdr') || filename.toLowerCase().endsWith('.exr');

    // Asset Definition
    const asset = new pc.Asset(isCustom ? 'custom-skybox' : envState.skyboxId, 'texture', { url: url }, {
        // HDR files are usually RGBE (Radiance)
        type: isDDS ? pc.TEXTURETYPE_RGBM : (isHDR ? pc.TEXTURETYPE_RGBE : undefined), 
        mime: isHDR ? 'image/vnd.radiance' : undefined,
        minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        anisotropy: 1,
        name: isCustom ? 'custom' : envState.skyboxId
    });

    asset.on('error', (err: any) => {
        console.error(`Failed to load skybox asset ${url}:`, err);
    });

    const onAssetReady = (asset: pc.Asset) => {
         const texture = asset.resource as pc.Texture;
         if (texture) {
             // 1. Projection & Addressing Setup
             if (isDDS) {
                 texture.projection = pc.TEXTUREPROJECTION_CUBE;
             } else {
                 texture.projection = pc.TEXTUREPROJECTION_EQUIRECT;
                 texture.addressU = pc.ADDRESS_CLAMP_TO_EDGE;
                 texture.addressV = pc.ADDRESS_CLAMP_TO_EDGE;
             }

             // 2. Assign Skybox
             app.scene.skybox = texture;
             
             // 3. Generate EnvAtlas (Required for PBR IBL)
             // For DDS (prefiltered), we can use it directly but generating atlas is safer if envLighting is active
             // For Equirect (PNG/HDR), we MUST generate atlas.
             if (pc.EnvLighting) {
                 const envAtlas = pc.EnvLighting.generateAtlas(texture);
                 app.scene.envAtlas = envAtlas;
             } else {
                 app.scene.skyboxMip = 1; 
             }
             
             // 4. Tone Mapping
             (app.scene as any).toneMapping = pc.TONEMAP_ACES;

             // 5. Force Material Update
             app.root.findComponents('render').forEach((renderComp: any) => {
                if (renderComp.meshInstances) {
                    renderComp.meshInstances.forEach((mi: pc.MeshInstance) => {
                        if (mi.material instanceof pc.StandardMaterial) {
                            mi.material.useSkybox = true;
                            mi.material.update();
                        }
                    });
                }
             });
             app.root.findComponents('model').forEach((modelComp: any) => {
                if (modelComp.meshInstances) {
                    modelComp.meshInstances.forEach((mi: pc.MeshInstance) => {
                        if (mi.material instanceof pc.StandardMaterial) {
                            mi.material.useSkybox = true;
                            mi.material.update();
                        }
                    });
                }
             });

             if (currentSkyboxAssetRef.current) {
                 // unload old?
             }
             currentSkyboxAssetRef.current = asset;
         }
    };

    asset.ready(onAssetReady);
    app.assets.add(asset);
    app.assets.load(asset);

  }, [envState.skyboxId, envState.customSkyboxUrl, envState.customSkyboxFileName]);


  // --- Engine Initialization (Run Once) ---
  useEffect(() => {
    if (!canvasRef.current) return;

    const app = new pc.Application(canvasRef.current, {
      mouse: new pc.Mouse(canvasRef.current),
      keyboard: new pc.Keyboard(window),
      touch: new pc.TouchDevice(canvasRef.current),
      elementInput: new pc.ElementInput(canvasRef.current),
      graphicsDeviceOptions: {
          alpha: true,
          antialias: true,
          powerPreference: "high-performance"
      }
    });

    app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
    app.setCanvasResolution(pc.RESOLUTION_AUTO);
    app.start();
    appRef.current = app;

    // Load SSAO Script (Inline Blob Loading to avoid 404s)
    if (!ssaoScriptLoadedRef.current) {
        const blob = new Blob([SSAO_SCRIPT_CONTENT], { type: 'application/javascript' });
        const scriptUrl = URL.createObjectURL(blob);
        
        const scriptAsset = new pc.Asset('ssao', 'script', { url: scriptUrl });
        app.assets.add(scriptAsset);
        app.assets.load(scriptAsset);
        scriptAsset.ready(() => {
            ssaoScriptLoadedRef.current = true;
            URL.revokeObjectURL(scriptUrl); // Cleanup
        });
        scriptAsset.on('error', (err: string) => {
          console.error("Failed to load SSAO script:", err);
        });
    }

    const gizmoLayerId = 10000;
    const gizmoLayer = new pc.Layer({ name: 'Gizmo', id: gizmoLayerId, clearDepthBuffer: true });
    app.scene.layers.push(gizmoLayer);
    gizmoLayerIdRef.current = gizmoLayerId;

    if (captureRef) captureRef.current = canvasRef.current;

    // -- LIGHTING & ENVIRONMENT SETUP --
    app.scene.ambientLight = new pc.Color(0.2, 0.2, 0.2); 
    (app.scene as any).toneMapping = pc.TONEMAP_ACES;
    (app.scene as any).exposure = 1.0;
    (app.scene as any).gammaCorrection = pc.GAMMA_SRGB;
    
    // Camera
    const camera = new pc.Entity('Camera');
    
    const worldLayer = app.scene.layers.getLayerByName('World');
    const skyboxLayer = app.scene.layers.getLayerByName('Skybox'); 
    const uiLayer = app.scene.layers.getLayerByName('UI');

    camera.addComponent('camera', {
      clearColor: new pc.Color(0.05, 0.05, 0.05),
      farClip: 1000,
      fov: 60,
      layers: [worldLayer.id, skyboxLayer.id, gizmoLayerId],
    });
    camera.setPosition(0, 1.5, 4);
    app.root.addChild(camera);
    cameraEntityRef.current = camera;
    
    const initEuler = camera.getEulerAngles();
    mouseLookEulerRef.current.set(initEuler.x, initEuler.y, initEuler.z);

    // --- Update Loop ---
    const update = (dt: number) => {
       // 1. Sync Gizmo & Auto Scale
       if (gizmoRootRef.current && selectedTargetRef.current && camera) {
           let target = null;
           if (selectedTargetRef.current === 'scene') target = splatEntityRef.current;
           else if (selectedTargetRef.current === 'character' && activeCharacterIdRef.current) {
               target = characterEntitiesMapRef.current.get(activeCharacterIdRef.current) || null;
           }

           if (target) {
               gizmoRootRef.current.setPosition(target.getPosition());
               gizmoRootRef.current.setRotation(target.getRotation());
               
               const dist = camera.getPosition().distance(target.getPosition());
               const scale = Math.max(0.1, dist * 0.2); 
               gizmoRootRef.current.setLocalScale(scale, scale, scale);
           }
       }

       // 2. 2D Cylindrical Billboard Logic (Iterate all 2d characters)
       characterEntitiesMapRef.current.forEach((charEntity) => {
           if ((charEntity as any).is2DBillboard && camera) {
                const camPos = camera.getPosition();
                const charPos = charEntity.getPosition();
                
                const dx = camPos.x - charPos.x;
                const dz = camPos.z - charPos.z;
                let yaw = Math.atan2(dx, dz) * pc.math.RAD_TO_DEG;
                
                charEntity.setEulerAngles(0, yaw, 0);
           }
       });

       // 3. Movement Logic (WASD)
       if ((isLockedRef.current || isEditModeRef.current) && camera) {
           const speed = envStateRef.current.cameraSpeed; // Use speed from state
           const forward = camera.forward;
           const right = camera.right;
           let x = 0;
           let z = 0;
           let y = 0; 

           if (app.keyboard.isPressed(pc.KEY_W) || app.keyboard.isPressed(pc.KEY_UP)) z += 1;
           if (app.keyboard.isPressed(pc.KEY_S) || app.keyboard.isPressed(pc.KEY_DOWN)) z -= 1;
           if (app.keyboard.isPressed(pc.KEY_A) || app.keyboard.isPressed(pc.KEY_LEFT)) x -= 1;
           if (app.keyboard.isPressed(pc.KEY_D) || app.keyboard.isPressed(pc.KEY_RIGHT)) x += 1;
           if (app.keyboard.isPressed(pc.KEY_E)) y += 1;
           if (app.keyboard.isPressed(pc.KEY_Q)) y -= 1;

           if (x !== 0 || z !== 0 || y !== 0) {
              const pos = camera.getPosition();
              const move = new pc.Vec3();
              move.add(forward.clone().mulScalar(z * speed * dt));
              move.add(right.clone().mulScalar(x * speed * dt));
              move.y += y * speed * dt;
              camera.setPosition(pos.add(move));
              if (onCameraMove) onCameraMove();
           }
       }

       if (camera) {
         const curEuler = camera.getEulerAngles();
         if (!isFreeLookingRef.current && !isLockedRef.current) {
             mouseLookEulerRef.current.set(curEuler.x, curEuler.y, 0);
         }
       }
    };

    const onMouseMove = (event: pc.MouseEvent) => {
        if (document.pointerLockElement === canvasRef.current) {
            const lookSpeed = 0.2;
            mouseLookEulerRef.current.x -= event.dy * lookSpeed;
            mouseLookEulerRef.current.y -= event.dx * lookSpeed;
            mouseLookEulerRef.current.x = pc.math.clamp(mouseLookEulerRef.current.x, -90, 90);
            camera.setLocalEulerAngles(mouseLookEulerRef.current.x, mouseLookEulerRef.current.y, 0);
            return;
        }

        if (!isEditModeRef.current) return;

        if (isFreeLookingRef.current) {
            const lookSpeed = 0.2;
            mouseLookEulerRef.current.x -= event.dy * lookSpeed;
            mouseLookEulerRef.current.y -= event.dx * lookSpeed;
            mouseLookEulerRef.current.x = pc.math.clamp(mouseLookEulerRef.current.x, -90, 90);
            camera.setLocalEulerAngles(mouseLookEulerRef.current.x, mouseLookEulerRef.current.y, 0);
            return;
        }

        if (isOrbitingRef.current) {
            const sensitivity = 0.4;
            orbitParamsRef.current.alpha -= event.dx * sensitivity;
            orbitParamsRef.current.beta += event.dy * sensitivity;
            orbitParamsRef.current.beta = pc.math.clamp(orbitParamsRef.current.beta, -89, 89);

            const { alpha, beta, radius, targetPivot } = orbitParamsRef.current;
            const a = alpha * pc.math.DEG_TO_RAD;
            const b = beta * pc.math.DEG_TO_RAD;
            
            const x = radius * Math.cos(b) * Math.sin(a);
            const z = radius * Math.cos(b) * Math.cos(a);
            const y = radius * Math.sin(b);

            const newPos = targetPivot.clone().add(new pc.Vec3(x, y, z));
            camera.setPosition(newPos);
            camera.lookAt(targetPivot);
            return;
        }

        if (draggedAxisRef.current && gizmoRootRef.current) {
            const axis = draggedAxisRef.current;
            const mode = axis.substring(0, 1); 
            const dir = axis.substring(1); 

            let target = null;
            if (selectedTargetRef.current === 'scene') target = splatEntityRef.current;
            else if (selectedTargetRef.current === 'character' && activeCharacterIdRef.current) {
                target = characterEntitiesMapRef.current.get(activeCharacterIdRef.current) || null;
            }
            
            if (!target) return;

            const from = camera.getPosition();
            const to = camera.camera!.screenToWorld(event.x, event.y, camera.camera!.farClip);
            const ray = new pc.Ray(from, to.sub(from).normalize());

            const hitPoint = new pc.Vec3();
            const t = dragPlaneRef.current.intersectsRay(ray, hitPoint);
            
            if (t !== undefined) {
                const gizmoRot = gizmoRootRef.current.getRotation();
                const axisVec = new pc.Vec3();
                if (dir === 'x') axisVec.set(1, 0, 0);
                if (dir === 'y') axisVec.set(0, 1, 0);
                if (dir === 'z') axisVec.set(0, 0, 1);
                gizmoRot.transformVector(axisVec, axisVec);

                const deltaVec = hitPoint.clone().sub(dragStartPointRef.current);
                const projectedDelta = axisVec.dot(deltaVec);

                if (mode === 't') {
                    const moveVec = axisVec.clone().mulScalar(projectedDelta);
                    const newPos = dragStartValueRef.current.clone().add(moveVec);
                    target.setPosition(newPos);
                    setTransforms(prev => ({...prev, position: { x: newPos.x, y: newPos.y, z: newPos.z }}));
                } else if (mode === 'r') {
                    const sensitivity = 20;
                    const angle = projectedDelta * sensitivity;
                    const newRot = dragStartValueRef.current.clone();
                    if (dir === 'x') newRot.x += angle;
                    if (dir === 'y') newRot.y += angle;
                    if (dir === 'z') newRot.z += angle;
                    target.setLocalEulerAngles(newRot);
                     setTransforms(prev => ({...prev, rotation: { x: newRot.x, y: newRot.y, z: newRot.z }}));
                } else if (mode === 's') {
                    const sensitivity = 1;
                    const scaleFactor = 1 + (projectedDelta * sensitivity);
                    const newScale = dragStartValueRef.current.clone();
                    if (dir === 'x') newScale.x *= scaleFactor;
                    if (dir === 'y') newScale.y *= scaleFactor;
                    if (dir === 'z') newScale.z *= scaleFactor;
                    target.setLocalScale(newScale);
                    setTransforms(prev => ({...prev, scale: { x: newScale.x, y: newScale.y, z: newScale.z }}));
                }
            }
        }
    };

    const onMouseDown = (event: pc.MouseEvent) => {
        if (!isEditModeRef.current || !cameraEntityRef.current) return;
        if (event.button !== pc.MOUSEBUTTON_LEFT) return;

        const camera = cameraEntityRef.current.camera!;
        const from = cameraEntityRef.current.getPosition();
        const to = camera.screenToWorld(event.x, event.y, camera.farClip);
        const ray = new pc.Ray(from, to.sub(from).normalize());
        
        let hitAxis = null;
        let closestDist = Infinity;

        // 1. Check Gizmo Click
        if (gizmoRootRef.current) {
            gizmoRootRef.current.children.forEach(childNode => {
                const child = childNode as pc.Entity;
                const meshInstances = child.render?.meshInstances;
                if (meshInstances && meshInstances.length > 0) {
                    const aabb = meshInstances[0].aabb;
                    if (aabb.intersectsRay(ray)) {
                        const dist = aabb.center.distance(from);
                        if (dist < closestDist) {
                            closestDist = dist;
                            hitAxis = (meshInstances[0] as any).gizmoAxis;
                        }
                    }
                }
            });
        }

        if (hitAxis) {
            draggedAxisRef.current = hitAxis;
            let target = null;
            if (selectedTargetRef.current === 'scene') target = splatEntityRef.current;
            else if (selectedTargetRef.current === 'character' && activeCharacterIdRef.current) {
                target = characterEntitiesMapRef.current.get(activeCharacterIdRef.current) || null;
            }

            if (target) {
                const planeNormal = cameraEntityRef.current.forward.clone().mulScalar(-1);
                dragPlaneRef.current.setFromPointNormal(target.getPosition(), planeNormal);
                const hitPoint = new pc.Vec3();
                dragPlaneRef.current.intersectsRay(ray, hitPoint);
                dragStartPointRef.current.copy(hitPoint);

                if (hitAxis.startsWith('t')) dragStartValueRef.current.copy(target.getPosition());
                if (hitAxis.startsWith('r')) dragStartValueRef.current.copy(target.getLocalEulerAngles());
                if (hitAxis.startsWith('s')) dragStartValueRef.current.copy(target.getLocalScale());
            }
        } else {
            // 2. Check Object Click (Selection)
            let hitCharacterId = null;
            let closestCharDist = Infinity;

            characterEntitiesMapRef.current.forEach((entity, id) => {
                 // Check children mesh instances for intersection
                 const checkIntersection = (node: pc.GraphNode) => {
                     const ent = node as pc.Entity;
                     const meshes = [];
                     if (ent.render) meshes.push(...ent.render.meshInstances);
                     if (ent.model) meshes.push(...ent.model.meshInstances);
                     
                     for(const mi of meshes) {
                         const aabb = mi.aabb;
                         if (aabb.intersectsRay(ray)) {
                             const dist = aabb.center.distance(from);
                             if (dist < closestCharDist) {
                                 closestCharDist = dist;
                                 hitCharacterId = id;
                             }
                         }
                     }
                     ent.children.forEach(checkIntersection);
                 };
                 checkIntersection(entity);
            });

            if (hitCharacterId) {
                setSelectedTarget('character');
                setActiveCharacterId(hitCharacterId);
                
                // Set orbit target for drag immediately
                const targetEntity = characterEntitiesMapRef.current.get(hitCharacterId);
                if (targetEntity) {
                     isOrbitingRef.current = true;
                     const tPos = targetEntity.getPosition();
                     const camPos = cameraEntityRef.current.getPosition();
                     const vec = new pc.Vec3().sub2(camPos, tPos);
                     const radius = vec.length();
                     const alpha = Math.atan2(vec.x, vec.z) * pc.math.RAD_TO_DEG;
                     const beta = Math.asin(vec.y / (radius || 0.001)) * pc.math.RAD_TO_DEG;
                     orbitParamsRef.current = { alpha, beta, radius, targetPivot: tPos.clone() };
                }
            } else {
                // If clicked scene? (Currently scene splat doesn't have simple AABB for raycast easily without physics, assume scene click if nothing else)
                const target = selectedTargetRef.current === 'scene' ? splatEntityRef.current : 
                              (selectedTargetRef.current === 'character' && activeCharacterIdRef.current ? characterEntitiesMapRef.current.get(activeCharacterIdRef.current) : null);
                
                if (target) {
                    isOrbitingRef.current = true;
                    const tPos = target.getPosition();
                    const camPos = cameraEntityRef.current.getPosition();
                    const vec = new pc.Vec3().sub2(camPos, tPos);
                    const radius = vec.length();
                    const alpha = Math.atan2(vec.x, vec.z) * pc.math.RAD_TO_DEG;
                    const beta = Math.asin(vec.y / (radius || 0.001)) * pc.math.RAD_TO_DEG;
                    orbitParamsRef.current = { alpha, beta, radius, targetPivot: tPos.clone() };
                } else {
                    isFreeLookingRef.current = true;
                }
            }
        }
    };

    const onMouseUp = () => {
        draggedAxisRef.current = null;
        isOrbitingRef.current = false;
        isFreeLookingRef.current = false;
    };

    const onMouseWheel = (event: pc.MouseEvent) => {
        if (isEditModeRef.current && isOrbitingRef.current) {
             const sensitivity = 0.5;
             orbitParamsRef.current.radius -= event.wheelDelta * sensitivity * 0.5;
             orbitParamsRef.current.radius = Math.max(0.5, Math.min(orbitParamsRef.current.radius, 50));
             const { alpha, beta, radius, targetPivot } = orbitParamsRef.current;
             const a = alpha * pc.math.DEG_TO_RAD;
             const b = beta * pc.math.DEG_TO_RAD;
             const x = radius * Math.cos(b) * Math.sin(a);
             const z = radius * Math.cos(b) * Math.cos(a);
             const y = radius * Math.sin(b);
             const newPos = targetPivot.clone().add(new pc.Vec3(x, y, z));
             camera.setPosition(newPos);
        }
    };

    app.on('update', update);
    app.mouse.on(pc.EVENT_MOUSEMOVE, onMouseMove);
    app.mouse.on(pc.EVENT_MOUSEDOWN, onMouseDown);
    app.mouse.on(pc.EVENT_MOUSEUP, onMouseUp);
    app.mouse.on(pc.EVENT_MOUSEWHEEL, onMouseWheel);

    const handleResize = () => app.resizeCanvas();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      app.destroy();
    };
  }, []); 

  // --- Event Listeners ---
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleLockChange = () => setIsLocked(!!document.pointerLockElement);
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();
    document.addEventListener('pointerlockchange', handleLockChange);
    canvas.addEventListener('contextmenu', handleContextMenu);
    return () => {
        document.removeEventListener('pointerlockchange', handleLockChange);
        canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  // --- Loaders (Splat) ---
  useEffect(() => {
    if (!splatUrl || !appRef.current) return;
    const app = appRef.current;
    if (splatEntityRef.current) {
        splatEntityRef.current.destroy();
        splatEntityRef.current = null;
    }
    const asset = new pc.Asset('scene-splat', 'gsplat', { url: splatUrl });
    
    asset.on('error', (err: any) => {
        console.error('Failed to load splat:', err);
    });

    app.assets.add(asset);
    asset.ready(() => {
        const entity = new pc.Entity('SplatRoot');
        entity.addComponent('gsplat', { asset: asset });
        entity.setLocalEulerAngles(0, 0, 180); 
        entity.setLocalPosition(0, 0, 0);
        app.root.addChild(entity);
        splatEntityRef.current = entity;
        
        if (!isEditModeRef.current && cameraEntityRef.current) {
            cameraEntityRef.current.setPosition(0, 1, 4);
            cameraEntityRef.current.setLocalEulerAngles(0, 0, 0);
            const e = cameraEntityRef.current.getEulerAngles();
            mouseLookEulerRef.current.set(e.x, e.y, 0);
        }
        setSceneLoadVersion(v => v + 1);
    });
    app.assets.load(asset);
  }, [splatUrl]); 

  // --- Loaders (Character Manager) ---
  useEffect(() => {
    if (!appRef.current) return;
    const app = appRef.current;
    const map = characterEntitiesMapRef.current;

    // 1. Remove deleted characters
    const currentIds = new Set(characters.map(c => c.id));
    map.forEach((entity, id) => {
        if (!currentIds.has(id)) {
            entity.destroy();
            map.delete(id);
            if (activeCharacterId === id) {
                setActiveCharacterId(null);
                if (selectedTarget === 'character') setSelectedTarget(null);
            }
        }
    });

    // 2. Add new characters
    characters.forEach(char => {
        if (map.has(char.id)) return; // Already loaded

        if (char.type === '3d') {
            const asset = new pc.Asset(`char-${char.id}`, 'container', { url: char.url });
            asset.on('error', (e: any) => console.error('Failed to load character', e));
            app.assets.add(asset);
            asset.ready(() => {
                const entity = (asset.resource as any).instantiateRenderEntity();
                if (entity) {
                    entity.name = `Character-${char.id}`;
                    entity.setLocalPosition(0, 0, 0); // Default position
                    app.root.addChild(entity);
                    map.set(char.id, entity);
                    
                    // Auto-select newly added character
                    setActiveCharacterId(char.id);
                    setSelectedTarget('character');

                    // Enforce PBR
                    const meshInstances: pc.MeshInstance[] = [];
                    const findMeshInstances = (node: pc.GraphNode) => {
                        const ent = node as pc.Entity;
                        if (ent.render) meshInstances.push(...ent.render.meshInstances);
                        if (ent.model) meshInstances.push(...ent.model.meshInstances);
                        ent.children.forEach(findMeshInstances);
                    };
                    findMeshInstances(entity);
                    meshInstances.forEach(mi => {
                        if (mi.material instanceof pc.StandardMaterial) {
                            mi.material.useSkybox = true;
                            mi.material.useMetalness = true;
                            mi.material.update();
                        }
                    });

                    setSceneLoadVersion(v => v + 1);
                }
            });
            app.assets.load(asset);

        } else if (char.type === '2d') {
            const asset = new pc.Asset(`char-tex-${char.id}`, 'texture', { url: char.url });
            app.assets.add(asset);
            asset.ready(() => {
                const texture = asset.resource as pc.Texture;
                const root = new pc.Entity(`CharacterRoot-${char.id}`);
                root.setLocalPosition(0, 1, 0);
                (root as any).is2DBillboard = true; // Mark for update loop
                app.root.addChild(root);

                const worldLayer = app.scene.layers.getLayerByName('World');
                const plane = new pc.Entity('SpritePlane');
                plane.addComponent('render', { 
                    type: 'plane',
                    layers: [worldLayer.id] 
                });
                plane.setLocalEulerAngles(90, 0, 0);
                const aspect = texture.width / texture.height;
                const height = 2.0; 
                plane.setLocalScale(height * aspect, 1, height);

                const material = new pc.StandardMaterial();
                material.diffuseMap = texture;
                material.opacityMap = texture; 
                material.blendType = pc.BLEND_NORMAL;
                material.useLighting = true; 
                material.cull = pc.CULLFACE_NONE; 
                material.alphaTest = 0.05; 
                material.depthTest = true;
                material.update();

                if (plane.render) {
                    plane.render.meshInstances[0].material = material;
                }

                root.addChild(plane);
                map.set(char.id, root);
                
                setActiveCharacterId(char.id);
                setSelectedTarget('character');
                setSceneLoadVersion(v => v + 1);
            });
            app.assets.load(asset);
        }
    });
  }, [characters]); 


  return (
    <div className="w-full h-full bg-zinc-900 relative group">
      <canvas ref={canvasRef} className="w-full h-full block" id="application-canvas" />

      {/* --- Overlay UI --- */}
      {!isLocked && !isEditMode && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[2px] z-20">
          <div className="flex flex-col space-y-4">
             <div className="bg-black/80 text-white px-8 py-6 rounded-2xl border border-white/10 shadow-2xl text-center cursor-pointer hover:scale-105 transition-transform"
                  onClick={async () => { 
                    if (canvasRef.current) {
                      try { await canvasRef.current.requestPointerLock(); } catch(e) {}
                    } 
                  }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto mb-3 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <p className="font-bold text-xl mb-1 tracking-wide">Click to Navigate</p>
                <div className="text-xs text-zinc-500">WASD + Mouse Look</div>
             </div>

             <button 
                onClick={() => setIsEditMode(true)}
                className="bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 px-6 py-3 rounded-xl border border-white/10 shadow-xl flex items-center justify-center space-x-2 transition-colors"
             >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                <span className="font-medium">Edit Scene & Model</span>
             </button>
          </div>
        </div>
      )}

      {/* --- Edit Mode Inspector --- */}
      {isEditMode && (
        <EditorPanel 
          setIsEditMode={setIsEditMode}
          selectedTarget={selectedTarget}
          setSelectedTarget={setSelectedTarget}
          activeCharacterId={activeCharacterId}
          setActiveCharacterId={setActiveCharacterId}
          characters={characters}
          handleFocus={handleFocus}
          gizmoMode={gizmoMode}
          setGizmoMode={setGizmoMode}
          transforms={transforms}
          handleTransformChange={handleTransformChange}
          envState={envState}
          handleEnvChange={handleEnvChange}
        />
      )}
    </div>
  );
};

export default SceneViewer;

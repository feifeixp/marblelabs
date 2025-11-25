
export interface GenerationState {
  isGenerating: boolean;
  generatedImage: string | null;
  error: string | null;
}

export interface SceneConfig {
  splatUrl: string | null;
  backgroundColor: string;
  showGrid: boolean;
}

export enum ViewMode {
  VIEWPORT = 'VIEWPORT',
  RESULT = 'RESULT',
  SPLIT = 'SPLIT'
}

export interface Character {
  id: string;
  type: '2d' | '3d';
  url: string; 
  name: string;
}

// Scene Editor Types
export type TransformType = 'position' | 'rotation' | 'scale';
export type Axis = 'x' | 'y' | 'z';
export type TargetType = 'scene' | 'character';
export type GizmoMode = 'translate' | 'rotate' | 'scale';

export interface EnvironmentState {
  // Skybox / IBL
  skyboxId: string; // 'helipad' | 'adams' | 'studio'
  customSkyboxUrl?: string;
  customSkyboxFileName?: string; // To detect .hdr/.exr extension from blob
  skyboxIntensity: number;
  skyboxRotation: number;
  exposure: number;
  
  // Camera Settings
  cameraFov: number;
  cameraSpeed: number;

  // Atmosphere
  fogEnabled: boolean;
  fogColor: string;
  fogDensity: number;

  // Ambient Occlusion
  aoEnabled: boolean;
  aoIntensity: number;
  aoRadius: number;
}

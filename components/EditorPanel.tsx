
import React, { useState } from 'react';
import { TargetType, GizmoMode, TransformType, Axis, EnvironmentState, Character } from '../types';

interface EditorPanelProps {
  setIsEditMode: (val: boolean) => void;
  selectedTarget: TargetType | null;
  setSelectedTarget: React.Dispatch<React.SetStateAction<TargetType | null>>;
  // Character List Props
  activeCharacterId: string | null;
  setActiveCharacterId: (id: string | null) => void;
  characters: Character[];
  
  handleFocus: () => void;
  gizmoMode: GizmoMode;
  setGizmoMode: (mode: GizmoMode) => void;
  transforms: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  };
  handleTransformChange: (type: TransformType, axis: Axis, value: number) => void;
  // Environment Props
  envState: EnvironmentState;
  handleEnvChange: (key: keyof EnvironmentState, value: any) => void;
}

const TransformInput = ({ label, value, onChange }: { label: string, value: number, onChange: (val: number) => void }) => (
  <div className="flex items-center space-x-2">
    <span className="text-zinc-500 w-4 text-[10px] uppercase font-mono">{label}</span>
    <input 
      type="number" 
      step="0.1"
      value={Number(value.toFixed(2))}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
    />
  </div>
);

const EditorPanel: React.FC<EditorPanelProps> = ({
  setIsEditMode,
  selectedTarget,
  setSelectedTarget,
  activeCharacterId,
  setActiveCharacterId,
  characters,
  handleFocus,
  gizmoMode,
  setGizmoMode,
  transforms,
  handleTransformChange,
  envState,
  handleEnvChange
}) => {
  const [activeTab, setActiveTab] = useState<'inspector' | 'environment'>('inspector');

  const handleCustomSkyboxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        const url = URL.createObjectURL(file);
        handleEnvChange('customSkyboxUrl', url);
        handleEnvChange('customSkyboxFileName', file.name);
        handleEnvChange('skyboxId', 'custom');
    }
  };

  const handleCharacterSelect = (charId: string) => {
      setSelectedTarget('character');
      setActiveCharacterId(charId);
  };

  return (
    <div 
      className="absolute top-6 left-6 z-40 w-80 bg-black/80 backdrop-blur-md border border-zinc-700 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onMouseMove={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-zinc-900/50 p-3 border-b border-zinc-700 flex justify-between items-center sticky top-0 z-10 backdrop-blur-sm shrink-0">
        <div className="flex items-center space-x-2 text-white font-medium text-sm">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>Editor</span>
        </div>
        <button onClick={() => setIsEditMode(false)} className="text-zinc-400 hover:text-white">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700 shrink-0">
        <button 
          onClick={() => setActiveTab('inspector')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'inspector' ? 'text-white border-b-2 border-indigo-500 bg-zinc-800/30' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Object Inspector
        </button>
        <button 
          onClick={() => setActiveTab('environment')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${activeTab === 'environment' ? 'text-white border-b-2 border-indigo-500 bg-zinc-800/30' : 'text-zinc-400 hover:text-zinc-200'}`}
        >
          Environment
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-5 overflow-y-auto custom-scrollbar flex-1">
        
        {/* --- INSPECTOR TAB --- */}
        {activeTab === 'inspector' && (
          <>
            {/* Scene Selection */}
            <div className="flex items-center space-x-2">
               <button 
                  onClick={() => { setSelectedTarget('scene'); setActiveCharacterId(null); }}
                  className={`w-full py-2 text-xs font-medium rounded-md transition-colors border border-transparent ${selectedTarget === 'scene' ? 'bg-indigo-600 text-white shadow' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700'}`}
                >
                  Scene (Splat)
               </button>
            </div>

            {/* Character List */}
            <div className="space-y-2">
                <div className="text-[10px] text-zinc-400 font-bold tracking-wider uppercase">Characters</div>
                {characters.length === 0 ? (
                    <div className="text-zinc-500 text-xs italic text-center py-2 border border-zinc-800 rounded bg-zinc-900/50">
                        No characters loaded
                    </div>
                ) : (
                    <div className="flex flex-col space-y-1">
                        {characters.map(char => (
                            <button
                                key={char.id}
                                onClick={() => handleCharacterSelect(char.id)}
                                className={`flex items-center justify-between px-2 py-2 rounded text-xs transition-colors border ${
                                    selectedTarget === 'character' && activeCharacterId === char.id
                                    ? 'bg-indigo-900/30 border-indigo-500 text-white'
                                    : 'bg-zinc-800 border-transparent text-zinc-300 hover:bg-zinc-700'
                                }`}
                            >
                                <div className="flex items-center space-x-2 truncate">
                                    <span className={`w-2 h-2 rounded-full ${char.type === '3d' ? 'bg-emerald-500' : 'bg-indigo-400'}`}></span>
                                    <span className="truncate max-w-[150px]">{char.name}</span>
                                </div>
                                <span className="text-[9px] text-zinc-500 uppercase">{char.type}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-zinc-700 pt-4"></div>

            {selectedTarget ? (
              <>
                <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-white font-medium">
                        {selectedTarget === 'scene' ? 'Transform Scene' : 'Transform Character'}
                    </span>
                    <button 
                    onClick={handleFocus}
                    title="Focus Camera on Object"
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-2 py-1 rounded border border-zinc-700 transition-colors"
                    >
                    Focus
                    </button>
                </div>

                {/* Tool Selection */}
                <div className="flex justify-between items-center bg-zinc-800/50 p-1 rounded-lg border border-zinc-700 mb-4">
                  <button 
                    onClick={() => setGizmoMode('translate')}
                    className={`p-2 rounded transition-colors ${gizmoMode === 'translate' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="Translate"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16M10 3v18M14 3v18" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setGizmoMode('rotate')}
                    className={`p-2 rounded transition-colors ${gizmoMode === 'rotate' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="Rotate"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => setGizmoMode('scale')}
                    className={`p-2 rounded transition-colors ${gizmoMode === 'scale' ? 'bg-zinc-700 text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    title="Scale"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  </button>
                </div>

                {/* Transform Controls */}
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-zinc-400 font-bold tracking-wider">POSITION</div>
                    <div className="grid grid-cols-3 gap-2">
                      <TransformInput label="X" value={transforms.position.x} onChange={(v) => handleTransformChange('position', 'x', v)} />
                      <TransformInput label="Y" value={transforms.position.y} onChange={(v) => handleTransformChange('position', 'y', v)} />
                      <TransformInput label="Z" value={transforms.position.z} onChange={(v) => handleTransformChange('position', 'z', v)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-zinc-400 font-bold tracking-wider">ROTATION</div>
                    <div className="grid grid-cols-3 gap-2">
                      <TransformInput label="X" value={transforms.rotation.x} onChange={(v) => handleTransformChange('rotation', 'x', v)} />
                      <TransformInput label="Y" value={transforms.rotation.y} onChange={(v) => handleTransformChange('rotation', 'y', v)} />
                      <TransformInput label="Z" value={transforms.rotation.z} onChange={(v) => handleTransformChange('rotation', 'z', v)} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-zinc-400 font-bold tracking-wider">SCALE</div>
                    <div className="grid grid-cols-3 gap-2">
                      <TransformInput label="X" value={transforms.scale.x} onChange={(v) => handleTransformChange('scale', 'x', v)} />
                      <TransformInput label="Y" value={transforms.scale.y} onChange={(v) => handleTransformChange('scale', 'y', v)} />
                      <TransformInput label="Z" value={transforms.scale.z} onChange={(v) => handleTransformChange('scale', 'z', v)} />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-8 text-center text-zinc-500 text-xs">
                <p>No Object Selected</p>
                <p className="mt-1 opacity-50">Select scene or character to transform</p>
              </div>
            )}
          </>
        )}

        {/* --- ENVIRONMENT TAB --- */}
        {activeTab === 'environment' && (
          <div className="space-y-6">
            
            {/* Camera Settings */}
             <div className="space-y-2">
              <div className="text-xs font-bold text-zinc-300 border-b border-zinc-700 pb-1">Camera</div>
              <div className="space-y-3">
                 <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Field of View (FOV)</span>
                      <span>{envState.cameraFov.toFixed(0)}°</span>
                    </div>
                    <input 
                      type="range" min="30" max="120" step="1"
                      value={envState.cameraFov}
                      onChange={(e) => handleEnvChange('cameraFov', parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Move Speed</span>
                      <span>{envState.cameraSpeed.toFixed(1)}</span>
                    </div>
                    <input 
                      type="range" min="0.1" max="10" step="0.1"
                      value={envState.cameraSpeed}
                      onChange={(e) => handleEnvChange('cameraSpeed', parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-zinc-400">
                      <span>Exposure</span>
                      <span>{envState.exposure.toFixed(1)}</span>
                    </div>
                    <input 
                      type="range" min="0" max="4" step="0.1"
                      value={envState.exposure}
                      onChange={(e) => handleEnvChange('exposure', parseFloat(e.target.value))}
                      className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                  </div>
              </div>
            </div>

            {/* Skybox */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-zinc-300 border-b border-zinc-700 pb-1">Environment (IBL)</div>
              
              {/* Skybox Selection */}
              <div className="space-y-1 mb-2">
                 <label className="text-[10px] text-zinc-400">Environment Map</label>
                 <div className="flex space-x-2">
                   <select 
                      value={envState.skyboxId}
                      onChange={(e) => handleEnvChange('skyboxId', e.target.value)}
                      className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-indigo-500"
                   >
                      <option value="sky_41_2k">Default (Outdoor)</option>
                      <option value="helipad">Helipad (Sunny)</option>
                      <option value="studio">Studio (Soft)</option>
                      <option value="custom">Custom Upload</option>
                   </select>
                   <label className="cursor-pointer bg-zinc-700 hover:bg-zinc-600 text-white px-2 py-1 rounded border border-zinc-600 flex items-center justify-center" title="Upload Equirectangular Map (.jpg, .png, .hdr, .exr)">
                       <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                       </svg>
                       <input 
                          type="file" 
                          accept=".jpg,.jpeg,.png,.hdr,.exr" 
                          className="hidden" 
                          onChange={handleCustomSkyboxUpload}
                       />
                   </label>
                 </div>
                 {envState.skyboxId === 'custom' && (
                     <div className="text-[9px] text-zinc-500 truncate mt-1">
                         {envState.customSkyboxFileName ? `Loaded: ${envState.customSkyboxFileName}` : 'No custom map loaded'}
                     </div>
                 )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>Intensity</span>
                  <span>{envState.skyboxIntensity.toFixed(1)}</span>
                </div>
                <input 
                  type="range" min="0" max="5" step="0.1"
                  value={envState.skyboxIntensity}
                  onChange={(e) => handleEnvChange('skyboxIntensity', parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
               <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>Rotation</span>
                  <span>{envState.skyboxRotation.toFixed(0)}°</span>
                </div>
                <input 
                  type="range" min="0" max="360" step="1"
                  value={envState.skyboxRotation}
                  onChange={(e) => handleEnvChange('skyboxRotation', parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>
            </div>

             {/* Ambient Occlusion */}
             <div className="space-y-2">
               <div className="flex items-center justify-between border-b border-zinc-700 pb-1">
                  <div className="text-xs font-bold text-zinc-300">Ambient Occlusion (SSAO)</div>
                  <input 
                    type="checkbox"
                    checked={envState.aoEnabled}
                    onChange={(e) => handleEnvChange('aoEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-700 border-none accent-indigo-500 cursor-pointer"
                  />
               </div>
               {envState.aoEnabled && (
                 <>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Intensity</span>
                        <span>{envState.aoIntensity.toFixed(2)}</span>
                      </div>
                      <input 
                        type="range" min="0" max="2" step="0.05"
                        value={envState.aoIntensity}
                        onChange={(e) => handleEnvChange('aoIntensity', parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Radius</span>
                        <span>{envState.aoRadius.toFixed(1)}</span>
                      </div>
                      <input 
                        type="range" min="0.1" max="10" step="0.1"
                        value={envState.aoRadius}
                        onChange={(e) => handleEnvChange('aoRadius', parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                 </>
               )}
            </div>

            {/* Fog */}
            <div className="space-y-2">
               <div className="flex items-center justify-between border-b border-zinc-700 pb-1">
                  <div className="text-xs font-bold text-zinc-300">Fog</div>
                  <input 
                    type="checkbox"
                    checked={envState.fogEnabled}
                    onChange={(e) => handleEnvChange('fogEnabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-zinc-700 border-none accent-indigo-500 cursor-pointer"
                  />
               </div>
               {envState.fogEnabled && (
                 <>
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] text-zinc-400">Color</label>
                      <input 
                        type="color" 
                        value={envState.fogColor}
                        onChange={(e) => handleEnvChange('fogColor', e.target.value)}
                        className="w-6 h-6 rounded overflow-hidden cursor-pointer border-none bg-transparent"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] text-zinc-400">
                        <span>Density</span>
                        <span>{envState.fogDensity.toFixed(4)}</span>
                      </div>
                      <input 
                        type="range" min="0.0001" max="0.1" step="0.0001"
                        value={envState.fogDensity}
                        onChange={(e) => handleEnvChange('fogDensity', parseFloat(e.target.value))}
                        className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                      />
                    </div>
                 </>
               )}
            </div>
          </div>
        )}

      </div>
      
      <div className="p-3 bg-zinc-900/50 border-t border-zinc-700 shrink-0">
        <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
          WASD: Move <br/>
          Drag BG: {selectedTarget ? 'Orbit Object' : 'Rotate View'} <br/>
          Drag Gizmo: Transform
        </p>
      </div>
    </div>
  );
};

export default EditorPanel;

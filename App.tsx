
import React, { useState, useRef } from 'react';
import SceneViewer from './components/SceneViewer';
import ControlPanel from './components/ControlPanel';
import { generateCharacterInScene } from './services/geminiService';
import { ViewMode, GenerationState, Character } from './types';
import * as fflate from 'fflate';

const App: React.FC = () => {
  // State for the 3D Splat/Model
  const [splatUrl, setSplatUrl] = useState<string | null>(null);
  const [splatFileName, setSplatFileName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // State for Characters (Array)
  const [characters, setCharacters] = useState<Character[]>([]);

  // State for Generation
  const [generationState, setGenerationState] = useState<GenerationState>({
    isGenerating: false,
    generatedImage: null,
    error: null,
  });

  // UI State
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.VIEWPORT);

  // Reference to the 3D Canvas wrapper to capture screenshot
  const captureRef = useRef<HTMLCanvasElement>(null);

  // Handle Splat Upload
  const handleUploadSplat = async (file: File) => {
    setIsLoading(true);
    setSplatFileName(file.name);
    setGenerationState(prev => ({ ...prev, generatedImage: null, error: null }));
    setViewMode(ViewMode.VIEWPORT);

    try {
      let url = '';
      if (file.name.toLowerCase().endsWith('.spz')) {
        // Decompress SPZ (Zip containing ply/splat)
        const buffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(buffer);
        
        // Use fflate to unzip
        await new Promise<void>((resolve, reject) => {
           fflate.unzip(uint8, (err, unzipped) => {
              if (err) {
                 reject(err);
                 return;
              }
              // Prioritize .splat files, then .ply
              const innerFile = Object.keys(unzipped).find(name => 
                name.toLowerCase().endsWith('.splat') || name.toLowerCase().endsWith('.ksplat')
              ) || Object.keys(unzipped).find(name => 
                name.toLowerCase().endsWith('.ply')
              );

              if (!innerFile) {
                reject(new Error("No valid .splat or .ply file found inside SPZ archive"));
                return;
              }

              // Create blob with generic octet-stream, PlayCanvas relies on us passing 'gsplat' type manually or inference
              const blob = new Blob([unzipped[innerFile]], { type: 'application/octet-stream' });
              url = URL.createObjectURL(blob);
              resolve();
           });
        });
      } else {
        url = URL.createObjectURL(file);
      }
      
      setSplatUrl(url);
    } catch (e: any) {
      console.error("Failed to load file", e);
      setGenerationState(prev => ({ ...prev, error: `Failed to load file: ${e.message}` }));
      // Clear failed URL so it can be retried
      setSplatUrl(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Character Upload
  const handleUploadCharacter = async (file: File) => {
    const is3D = file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf');
    const isImage = file.type.startsWith('image/');
    const id = crypto.randomUUID().slice(0, 8); // Simple ID

    if (is3D) {
      const url = URL.createObjectURL(file);
      const newChar: Character = {
        id,
        type: '3d',
        url: url,
        name: file.name
      };
      setCharacters(prev => [...prev, newChar]);
      setViewMode(ViewMode.VIEWPORT);
    } else if (isImage) {
      // Convert to Base64 for Gemini (and also use as texture URL)
      const reader = new FileReader();
      reader.onloadend = () => {
        const newChar: Character = {
            id,
            type: '2d',
            url: reader.result as string,
            name: file.name
        };
        setCharacters(prev => [...prev, newChar]);
      };
      reader.readAsDataURL(file);
      setViewMode(ViewMode.VIEWPORT);
    }
  };

  const handleRemoveCharacter = (id: string) => {
      setCharacters(prev => prev.filter(c => c.id !== id));
  };

  // Capture Canvas Helper
  const captureScene = (): string | null => {
    // With PlayCanvas, captureRef.current is the actual <canvas>
    if (captureRef.current) {
        return captureRef.current.toDataURL('image/png');
    }
    return null;
  };

  // Handle Generation Request
  const handleGenerate = async (prompt: string) => {
    const sceneSnapshot = captureScene();
    
    if (!sceneSnapshot) {
      setGenerationState(prev => ({ ...prev, error: "Failed to capture 3D scene." }));
      return;
    }

    setGenerationState({ isGenerating: true, generatedImage: null, error: null });

    try {
      // Pass the first 2D character image found as reference (if any)
      // Future improvement: Allow selecting which character to reference for AI
      const char2D = characters.find(c => c.type === '2d');
      const characterImage = char2D ? char2D.url : null;

      const resultImage = await generateCharacterInScene(sceneSnapshot, prompt, characterImage);
      setGenerationState({
        isGenerating: false,
        generatedImage: resultImage,
        error: null,
      });
      setViewMode(ViewMode.RESULT);
    } catch (error: any) {
      setGenerationState({
        isGenerating: false,
        generatedImage: null,
        error: error.message || "Something went wrong during generation.",
      });
    }
  };

  const handleReset = () => {
    setGenerationState(prev => ({ ...prev, generatedImage: null, error: null }));
    setViewMode(ViewMode.VIEWPORT);
  };

  // Render Content based on ViewMode
  const renderContent = () => {
    const isSplit = viewMode === ViewMode.SPLIT;
    const isResult = viewMode === ViewMode.RESULT;
    
    return (
        <div className="relative w-full h-full flex overflow-hidden">
            {/* 3D Viewport */}
            <div className={`w-full h-full absolute inset-0 transition-opacity duration-500 ${isResult ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${isSplit ? 'w-1/2 relative' : ''}`}>
               {isLoading ? (
                   <div className="w-full h-full flex items-center justify-center text-zinc-400 animate-pulse bg-zinc-900">
                       <span className="flex items-center space-x-2">
                         <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                           <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                           <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                         </svg>
                         <span>Unzipping & Loading Splat...</span>
                       </span>
                   </div>
               ) : (
                <SceneViewer 
                    splatUrl={splatUrl} 
                    characters={characters}
                    onRemoveCharacter={handleRemoveCharacter}
                    captureRef={captureRef} 
                    onCameraMove={() => {}} 
                />
               )}
            </div>

            {/* Result View */}
            {(generationState.generatedImage || isSplit) && (
                 <div className={`absolute inset-0 bg-black flex items-center justify-center transition-opacity duration-500 ${!isResult && !isSplit ? 'opacity-0 pointer-events-none' : 'opacity-100'} ${isSplit ? 'w-1/2 left-1/2 relative border-l border-zinc-800' : ''}`}>
                     {generationState.generatedImage ? (
                         <img 
                            src={generationState.generatedImage} 
                            alt="Generated Scene" 
                            className="w-full h-full object-contain"
                         />
                     ) : (
                         <div className="text-zinc-500">No result generated yet</div>
                     )}
                 </div>
            )}
        </div>
    );
  };

  return (
    <div className="w-screen h-screen flex flex-col bg-black overflow-hidden relative">
      
      {/* Top Bar / Header */}
      <header className="absolute top-0 left-0 p-6 z-20 pointer-events-none">
        <h1 className="text-2xl font-bold tracking-tight text-white drop-shadow-md">
          Marble<span className="text-indigo-400">Lens</span>
        </h1>
        <p className="text-xs text-zinc-400 font-light">Spatial Generator (PlayCanvas)</p>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative">
        {renderContent()}
      </main>

      {/* Error Toast */}
      {generationState.error && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-500/90 text-white px-4 py-2 rounded-lg shadow-xl backdrop-blur-sm text-sm z-50 pointer-events-auto">
          <div className="flex items-center space-x-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{generationState.error}</span>
          </div>
        </div>
      )}

      {/* Sticky Controls */}
      <ControlPanel 
        onGenerate={handleGenerate}
        isGenerating={generationState.isGenerating}
        onUploadSplat={handleUploadSplat}
        onUploadCharacter={handleUploadCharacter}
        splatFileName={splatFileName}
        viewMode={viewMode}
        setViewMode={setViewMode}
        hasResult={!!generationState.generatedImage}
        onReset={handleReset}
      />
    </div>
  );
};

export default App;

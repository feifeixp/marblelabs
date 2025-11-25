import React, { useState } from 'react';
import { ViewMode } from '../types';

interface ControlPanelProps {
  onGenerate: (prompt: string) => void;
  isGenerating: boolean;
  onUploadSplat: (file: File) => void;
  onUploadCharacter: (file: File) => void;
  splatFileName: string | null;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  hasResult: boolean;
  onReset: () => void;
}

const ControlPanel: React.FC<ControlPanelProps> = ({
  onGenerate,
  isGenerating,
  onUploadSplat,
  onUploadCharacter,
  splatFileName,
  viewMode,
  setViewMode,
  hasResult,
  onReset
}) => {
  const [prompt, setPrompt] = useState('');

  const handleSplatChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadSplat(e.target.files[0]);
    }
  };

  const handleCharacterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadCharacter(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    onGenerate(prompt);
  };

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 pointer-events-none flex flex-col items-center justify-end z-50 bg-gradient-to-t from-black/90 via-black/40 to-transparent h-64 md:h-48">
      <div className="pointer-events-auto w-full max-w-3xl space-y-4">
        
        {/* Top Controls: View Mode & Uploads */}
        <div className="flex justify-between items-end mb-2">
          <div className="flex items-center space-x-2">
            <div className="flex space-x-2 bg-black/60 backdrop-blur-md p-1 rounded-lg border border-white/10">
              <button
                onClick={() => setViewMode(ViewMode.VIEWPORT)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === ViewMode.VIEWPORT ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
              >
                3D View
              </button>
              {hasResult && (
                <button
                  onClick={() => setViewMode(ViewMode.RESULT)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === ViewMode.RESULT ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
                >
                  Result
                </button>
              )}
              {hasResult && (
                 <button
                 onClick={() => setViewMode(ViewMode.SPLIT)}
                 className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewMode === ViewMode.SPLIT ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-white/10'}`}
               >
                 Split
               </button>
              )}
            </div>
          </div>

          <div className="flex space-x-2">
              {/* Splat Upload */}
              <label className="cursor-pointer bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg text-xs font-medium border border-white/10 transition-colors shadow-lg flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
                <span className="truncate max-w-[100px]">{splatFileName ? splatFileName : 'Load Scene (.spz)'}</span>
                <input type="file" accept=".spz,.splat,.ply,.ksplat" onChange={handleSplatChange} className="hidden" />
              </label>

              {/* Character Upload */}
              <label className={`cursor-pointer bg-zinc-800 border-white/10 hover:bg-zinc-700 text-white px-3 py-2 rounded-lg text-xs font-medium border transition-colors shadow-lg flex items-center space-x-2`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="truncate max-w-[100px]">Add Character</span>
                <input type="file" accept=".glb,.gltf,.png,.jpg,.jpeg" onChange={handleCharacterChange} className="hidden" />
              </label>
          </div>
        </div>

        {/* Main Prompt Bar */}
        <form onSubmit={handleSubmit} className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-xl blur opacity-30 group-hover:opacity-60 transition duration-1000 group-hover:duration-200"></div>
          <div className="relative flex items-center bg-zinc-900 rounded-xl border border-white/10 shadow-2xl overflow-hidden">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe how to integrate the character (e.g., 'The character is standing near the wall looking left')..."
              className="flex-1 bg-transparent border-none text-white px-4 py-4 focus:ring-0 focus:outline-none text-sm placeholder-zinc-500"
              disabled={isGenerating}
            />
            {hasResult && (
               <button
               type="button"
               onClick={onReset}
               className="px-4 py-2 text-zinc-400 hover:text-white text-sm font-medium transition-colors border-r border-white/10"
               disabled={isGenerating}
             >
               Clear
             </button>
            )}
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className={`px-6 py-4 font-semibold text-sm transition-all duration-200 flex items-center space-x-2
                ${isGenerating || !prompt.trim() 
                  ? 'bg-zinc-800 text-zinc-500 cursor-not-allowed' 
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                }`}
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <span>Generate</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </form>
        <div className="text-center flex justify-center space-x-4">
            <p className="text-[10px] text-zinc-500">Supported: .spz .splat .ply .glb .png .jpg</p>
            <p className="text-[10px] text-zinc-400">Import multiple 3D models or 2D sprites</p>
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;
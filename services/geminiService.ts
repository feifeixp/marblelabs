import { GoogleGenAI } from "@google/genai";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    throw new Error("API Key is missing. Please ensure process.env.API_KEY is available.");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Uses Gemini 2.5 Flash Image (Nano Banana) to synthesize a character into the scene.
 * It takes the current view (image) and a prompt, and optionally a character reference image.
 */
export const generateCharacterInScene = async (
  sceneSnapshotBase64: string,
  prompt: string,
  characterReferenceBase64?: string | null
): Promise<string> => {
  const ai = getClient();
  
  // Clean base64 strings
  const cleanSceneBase64 = sceneSnapshotBase64.replace(/^data:image\/(png|jpeg|jpg);base64,/, '');
  
  const parts: any[] = [];

  // 1. Text Prompt construction
  let finalPrompt = `Context: This is a snapshot of a 3D environment.
Task: ${prompt}
Instruction: Seamlessly integrate the subject into the environment. Match the lighting, shadows, and camera perspective of the background scene perfectly.`;

  if (characterReferenceBase64) {
    finalPrompt += `
Reference: A character image is provided. Use this character's visual features (appearance, clothing, style) but RE-DRAW them to match the perspective and angle of the 3D scene.
IMPORTANT: Do not just paste the image. You must rotate/warp/redraw the character so they look like they are physically standing in this 3D space.`;
  }

  parts.push({ text: finalPrompt });

  // 2. Scene Snapshot (Background)
  parts.push({
    inlineData: {
      data: cleanSceneBase64,
      mimeType: 'image/png',
    },
  });

  // 3. Character Reference (Optional)
  if (characterReferenceBase64) {
    const cleanCharBase64 = characterReferenceBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');
    parts.push({
      inlineData: {
        data: cleanCharBase64,
        mimeType: 'image/png', // Simplified, Gemini handles standard image types
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: parts,
      },
    });

    // Parse response for image
    if (response.candidates && response.candidates.length > 0) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData) {
          const base64EncodeString = part.inlineData.data;
          // Determine mime type if possible, default to png for generated images
          return `data:image/png;base64,${base64EncodeString}`;
        }
      }
    }

    throw new Error("No image data found in response.");

  } catch (error) {
    console.error("Gemini Generation Error:", error);
    throw error;
  }
};
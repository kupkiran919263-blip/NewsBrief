import { GoogleGenAI, Modality } from "@google/genai";
import { base64ToBytes, decodeAudioData, getAudioContext } from "./audioUtils";
import { VoiceName, Article, GroundingSource, Language } from "../types";

// Initialize Gemini client
const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface BriefingResult {
  script: string;
  sources: GroundingSource[];
}

/**
 * Step 1: Summarize articles into a briefing script.
 * Supports search queries via Google Search grounding.
 */
export async function generateBriefingScript(articles: Article[], language: Language = 'English'): Promise<BriefingResult> {
  if (articles.length === 0) return { script: "", sources: [] };

  const ai = getAI();
  
  // Format the input for the model. 
  // We treat all inputs as topics/context for the briefing search.
  const articlesPrompt = articles.map((a, i) => {
    return `Source ${i + 1} (Search Topic):\n${a.content}`;
  }).join('\n\n---\n\n');

  const prompt = `
    You are a professional news anchor preparing a detailed daily briefing.
    
    Here are the inputs provided by the user:
    ---
    ${articlesPrompt}
    ---
    
    Task:
    1. Synthesize these sources into a cohesive and engaging news briefing.
    2. Write the summary entirely in ${language}.
    3. Use your search tools to find the latest and most relevant news articles about the provided topics.
    4. LIMIT: Cover exactly the TOP 5 most important stories found. Do not exceed 5 stories.
    5. CRITICAL: Do not over-summarize. The user wants depth and detail.
    6. Ensure you explicitly cover the "Who, What, Where, When, Why, and How" for each of the 5 stories. Do not omit these core factual details.
    7. Provide a comprehensive briefing rather than a quick skim.
    8. Do not include markdown headers, bullet points, or asterisks.
    9. Start with a greeting like "Here are your top 5 stories." translated into ${language}.
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      // Enable Google Search to handle URL inputs and Search queries
      tools: [{ googleSearch: {} }],
    }
  });

  // Extract grounding metadata (sources used)
  const sources: GroundingSource[] = [];
  if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
    response.candidates[0].groundingMetadata.groundingChunks.forEach((chunk: any) => {
      if (chunk.web?.uri && chunk.web?.title) {
        sources.push({
          title: chunk.web.title,
          uri: chunk.web.uri
        });
      }
    });
  }

  return {
    script: response.text || "I couldn't generate a summary.",
    sources
  };
}

/**
 * Step 2: Convert the briefing script to speech.
 */
export async function generateSpeech(text: string, voice: VoiceName = VoiceName.Kore): Promise<AudioBuffer> {
  const ai = getAI();
  
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!base64Audio) {
    throw new Error("No audio data returned from Gemini.");
  }

  const audioBytes = base64ToBytes(base64Audio);
  const audioContext = getAudioContext();
  
  // TTS model usually outputs 24kHz
  return await decodeAudioData(audioBytes, audioContext, 24000, 1);
}

/**
 * Step 3: Generate a cover image for the briefing.
 */
export async function generateCoverImage(summary: string): Promise<string | null> {
  const ai = getAI();
  // Truncate summary to avoid excessive token usage for the prompt
  const prompt = `Generate a high-quality, cinematic news illustration that visually represents this story: ${summary.slice(0, 500)}...`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: prompt }]
      }
    });

    // The output response may contain both image and text parts; iterate to find the image.
    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  } catch (e) {
    console.warn("Image generation failed:", e);
  }
  return null;
}
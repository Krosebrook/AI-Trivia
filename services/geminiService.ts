
import { GoogleGenAI, Type } from "@google/genai";
import { TriviaQuestion, Difficulty } from "../types";

export class GeminiService {
  private ai: any;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
  }

  /**
   * Generates a set of trivia questions using Gemini 3 Flash with Google Search grounding.
   */
  async generateTriviaQuestions(topic: string, difficulty: Difficulty): Promise<TriviaQuestion[]> {
    const prompt = `Generate 5 ${difficulty} difficulty trivia questions about "${topic}". 
    Use Google Search to find current, accurate, and interesting facts that match a ${difficulty} difficulty level.
    - Easy: Common knowledge, widely known facts.
    - Medium: Requires some specific knowledge, not trivial for everyone.
    - Hard: Challenging, niche details, expert-level knowledge.
    Each question should have 4 options and a clear correct answer.
    Return the data as a clean JSON array.`;

    const response = await this.ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              question: { type: Type.STRING },
              answer: { type: Type.STRING },
              options: { 
                type: Type.ARRAY, 
                items: { type: Type.STRING } 
              },
              explanation: { type: Type.STRING },
              source: { type: Type.STRING }
            },
            required: ["question", "answer", "options", "explanation"]
          }
        }
      },
    });

    try {
      return JSON.parse(response.text.trim());
    } catch (e) {
      console.error("Failed to parse trivia questions:", e);
      return [];
    }
  }

  /**
   * Encodes byte array to base64 string.
   */
  static encodeBase64(bytes: Uint8Array): string {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Decodes base64 string to byte array.
   */
  static decodeBase64(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Decodes raw PCM audio data into an AudioBuffer.
   */
  static async decodeAudioData(
    data: Uint8Array,
    ctx: AudioContext,
    sampleRate: number,
    numChannels: number
  ): Promise<AudioBuffer> {
    const dataInt16 = new Int16Array(data.buffer);
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) {
        channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
      }
    }
    return buffer;
  }
}

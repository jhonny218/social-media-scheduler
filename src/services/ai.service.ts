import {
  CaptionGenerationRequest,
  CaptionGenerationResponse,
  HashtagSuggestionRequest,
  HashtagSuggestionResponse,
} from '../types';

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_MODEL = import.meta.env.VITE_GEMINI_MODEL || 'gemini-2.5-flash';
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

async function callGemini(prompt: string, imageBase64?: string): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }

  const parts: Array<{ text: string } | { inline_data: { mime_type: string; data: string } }> = [];

  // Add image if provided
  if (imageBase64) {
    // Extract base64 data from data URL if needed
    const base64Data = imageBase64.includes('base64,')
      ? imageBase64.split('base64,')[1]
      : imageBase64;

    // Determine mime type
    let mimeType = 'image/jpeg';
    if (imageBase64.includes('data:image/png')) mimeType = 'image/png';
    else if (imageBase64.includes('data:image/gif')) mimeType = 'image/gif';
    else if (imageBase64.includes('data:image/webp')) mimeType = 'image/webp';

    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: base64Data,
      },
    });
  }

  // Add text prompt
  parts.push({ text: prompt });

  const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1024,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to generate content');
  }

  const data: GeminiResponse = await response.json();

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('No content generated');
  }

  return data.candidates[0].content.parts[0].text;
}

// Convert blob URL to base64
async function blobUrlToBase64(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export class AIService {
  async generateCaption(request: CaptionGenerationRequest): Promise<CaptionGenerationResponse> {
    const { imageUrl, tone, includeHashtags, maxLength = 2200 } = request;

    // Convert blob URL to base64 if needed
    let imageBase64: string | undefined;
    if (imageUrl.startsWith('blob:')) {
      imageBase64 = await blobUrlToBase64(imageUrl);
    } else if (imageUrl.startsWith('data:')) {
      imageBase64 = imageUrl;
    }

    const toneDescriptions: Record<string, string> = {
      casual: 'friendly, conversational, and relatable',
      professional: 'polished, informative, and business-appropriate',
      playful: 'fun, witty, and entertaining with emojis',
      inspirational: 'motivating, uplifting, and thought-provoking',
    };

    const prompt = `You are an expert Instagram content creator. Analyze this image and write a captivating Instagram caption in a warm, reflective, authentic style similar to @prana_with_love that feels personal and inspiring.

Requirements:
- Tone: ${toneDescriptions[tone] || tone}
- Maximum length: ${maxLength} characters
- Make it engaging and encourage interaction (e.g., ask a gentle question, invite reflection, or evoke gratitude)
- Use heartfelt, genuine language and simple, joyful imagery that feels grounded and human
- Include subtle emotional cues (e.g., thankful, blessed, love, life, journey) without sounding generic
${includeHashtags ? '- Include 5-10 relevant hashtags at the end' : '- Do NOT include any hashtags'}

IMPORTANT: Return ONLY the caption text, nothing else. No explanations, no labels, just the caption.`;

    const result = await callGemini(prompt, imageBase64);

    // Clean up the response
    const caption = result.trim();

    // Extract hashtags if present
    const hashtagRegex = /#\w+/g;
    const hashtags = caption.match(hashtagRegex) || [];

    return {
      caption,
      hashtags: includeHashtags ? hashtags : undefined,
    };
  }

  async suggestHashtags(request: HashtagSuggestionRequest): Promise<HashtagSuggestionResponse> {
    const { caption, niche } = request;

    const prompt = `You are an Instagram hashtag expert. Based on the following caption${niche ? ` in the ${niche} niche` : ''}, generate 15–20 hashtags optimized for reach and relevance.

Caption: "${caption}"

Instructions:
- First, infer the content themes from the caption (e.g., Ayurveda, doshas, workouts, postpartum, feminine energy, self-care, holistic wellness).
- Prioritize relevance over raw popularity.

Hashtag mix requirements:
- Include 3–5 "signature" hashtags commonly used by Ayurveda/wellness creators (only if relevant to the caption). Prefer tags like:
  #ayurveda #ayurvedaeveryday #vatadosha
- Include:
  - 2–4 large hashtags (1M+ posts) for discovery
  - 6–10 mid hashtags (100k–1M posts)
  - 5–8 niche hashtags (10k–100k posts) that are highly specific
- If the caption indicates a Reel/trending format, you MAY include up to 1–2 Reel discovery tags (e.g., #povreel #trendingreels). Otherwise, do not include these.
- Avoid banned/spammy tags, avoid duplicates, and avoid overly generic tags that don’t match the caption.

Formatting:
- Return ONLY the hashtags
- One per line
- Each line must start with #
- No explanations, no numbering, no extra text.`;

    const result = await callGemini(prompt);

    // Parse hashtags from response
    const hashtagRegex = /#\w+/g;
    const hashtags = result.match(hashtagRegex) || [];

    // Deduplicate and limit to 30
    const uniqueHashtags = [...new Set(hashtags)].slice(0, 30);

    return {
      hashtags: uniqueHashtags,
    };
  }
}

export const aiService = new AIService();
export default AIService;

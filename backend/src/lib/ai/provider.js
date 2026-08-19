import { AnthropicProvider } from './providers/anthropic.js';
import { GeminiProvider } from './providers/gemini.js';
import { GroqProvider } from './providers/groq.js';
import { MockAIProvider } from './providers/mock.js';

let cached = null;

export function getAIProvider() {
  if (cached) return cached;

  const kind = process.env.AI_PROVIDER ?? 'groq';
  switch (kind) {
    case 'anthropic':
      cached = new AnthropicProvider();
      return cached;
    case 'gemini':
      cached = new GeminiProvider();
      return cached;
    case 'groq':
      cached = new GroqProvider();
      return cached;
    case 'mock':
      cached = new MockAIProvider();
      return cached;
    default:
      throw new Error(`Unknown AI_PROVIDER "${kind}". Supported: anthropic, gemini, groq, mock.`);
  }
}

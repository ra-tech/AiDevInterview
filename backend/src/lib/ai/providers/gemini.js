import { GoogleGenAI } from '@google/genai';
import {
  AnswerEvaluationSchema,
  CodingEvaluationSchema,
  FollowUpDecisionSchema,
  GeneratedQuestionSchema,
  InterviewPlanSchema,
  InterviewReportSchema,
  JDExtractionSchema
} from '../types.js';
import {
  buildAnswerEvaluationPrompt,
  buildCodingEvaluationPrompt,
  buildFinalReportPrompt,
  buildFollowUpPrompt,
  buildInterviewPlanPrompt,
  buildJDExtractionPrompt,
  buildQuestionPrompt
} from '../prompts/index.js';
import { buildCodingChallengePrompt, CodingChallengeSchema } from '../prompts/coding.js';
import { AIProviderError } from './errors.js';
import { isProviderCallFailure, isQuotaExceededError, withBackoff } from './retry.js';

/**
 * Built on @google/genai (the current SDK — @google/generative-ai is end-of-life).
 * See backend README for free-tier notes and model-name churn caveats.
 */
export class GeminiProvider {
  constructor(apiKey = process.env.GEMINI_API_KEY ?? '', model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash') {
    if (!apiKey) {
      throw new AIProviderError('GEMINI_API_KEY is not set. Add it to .env before starting an interview.');
    }
    this.client = new GoogleGenAI({ apiKey });
    this.model = model;
  }

  async runStructured(schema, prompt, maxOutputTokens = 1024) {
    const attempt = async (extraUserContext) => {
      let raw;
      try {
        const response = await withBackoff(() =>
          this.client.models.generateContent({
            model: this.model,
            contents: extraUserContext ? `${prompt.user}\n\n${extraUserContext}` : prompt.user,
            config: {
              systemInstruction: prompt.system,
              responseMimeType: 'application/json',
              maxOutputTokens,
              // Gemini 2.5 Flash "thinks" by default, and thinking tokens are drawn from the
              // same maxOutputTokens budget as the visible response — can silently produce an
              // empty response on short structured-output calls. Disabled for reliability.
              thinkingConfig: { thinkingBudget: 0 }
            }
          })
        );
        raw = response.text ?? '';
      } catch (err) {
        if (isQuotaExceededError(err)) {
          throw new AIProviderError(
            `Gemini free-tier quota exceeded for model "${this.model}". Wait for the daily/rate limit to reset, switch GEMINI_MODEL, or set AI_PROVIDER=mock. Original: ${err instanceof Error ? err.message : String(err)}`,
            err
          );
        }
        throw new AIProviderError(`Gemini request failed: ${err instanceof Error ? err.message : String(err)}`, err);
      }

      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      if (!cleaned) {
        throw new AIProviderError('Gemini returned an empty response (often a safety-filter block on the prompt or output).');
      }

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (err) {
        throw new AIProviderError(`Model returned non-JSON output: ${cleaned.slice(0, 200)}`, err);
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new AIProviderError(`Model output failed schema validation: ${result.error.message}`, result.error);
      }
      return result.data;
    };

    try {
      return await attempt();
    } catch (firstErr) {
      if (isProviderCallFailure(firstErr)) {
        throw firstErr;
      }
      try {
        return await attempt(
          `Your previous response was invalid: ${firstErr instanceof Error ? firstErr.message : String(firstErr)}. Return ONLY corrected valid JSON matching the required shape.`
        );
      } catch (secondErr) {
        const firstMsg = firstErr instanceof Error ? firstErr.message : String(firstErr);
        const secondMsg = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new AIProviderError(
          `AI provider failed after retry. First attempt: ${firstMsg} | Retry attempt: ${secondMsg}`,
          secondErr
        );
      }
    }
  }

  extractJobDescription(rawText) {
    return this.runStructured(JDExtractionSchema, buildJDExtractionPrompt(rawText), 1500);
  }

  generateInterviewPlan(input) {
    return this.runStructured(InterviewPlanSchema, buildInterviewPlanPrompt(input), 1200);
  }

  generateQuestion(input) {
    return this.runStructured(GeneratedQuestionSchema, buildQuestionPrompt(input), 700);
  }

  evaluateAnswer(input) {
    return this.runStructured(AnswerEvaluationSchema, buildAnswerEvaluationPrompt(input), 1300);
  }

  generateFollowUp(input) {
    return this.runStructured(FollowUpDecisionSchema, buildFollowUpPrompt(input), 700);
  }

  generateCodingChallenge(input) {
    return this.runStructured(CodingChallengeSchema, buildCodingChallengePrompt(input), 2000);
  }

  evaluateCodingSolution(input) {
    return this.runStructured(CodingEvaluationSchema, buildCodingEvaluationPrompt(input), 1000);
  }

  generateFinalReport(input) {
    return this.runStructured(InterviewReportSchema, buildFinalReportPrompt(input), 2800);
  }
}

import Groq from 'groq-sdk';
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
 * Groq's API is OpenAI-compatible chat completions. Model IDs churn fairly often as Groq
 * deprecates older ones (llama-3.3-70b-versatile was retired mid-2026 in favor of
 * openai/gpt-oss-120b) — check console.groq.com/docs/models if you get a model_not_found error.
 */
export class GroqProvider {
  constructor(apiKey = process.env.GROQ_API_KEY ?? '', model = process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b') {
    if (!apiKey) {
      throw new AIProviderError('GROQ_API_KEY is not set. Add it to .env before starting an interview.');
    }
    this.client = new Groq({ apiKey });
    this.model = model;
  }

  async runStructured(schema, prompt, maxTokens = 1024) {
    const attempt = async (extraUserContext) => {
      let raw;
      try {
        const completion = await withBackoff(() =>
          this.client.chat.completions.create({
            model: this.model,
            max_tokens: maxTokens,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: prompt.system },
              { role: 'user', content: extraUserContext ? `${prompt.user}\n\n${extraUserContext}` : prompt.user }
            ]
          })
        );
        raw = completion.choices[0]?.message?.content ?? '';
      } catch (err) {
        if (isQuotaExceededError(err)) {
          throw new AIProviderError(
            `Groq quota/rate limit hit for model "${this.model}". Wait, switch GROQ_MODEL, or set AI_PROVIDER=mock. Original: ${err instanceof Error ? err.message : String(err)}`,
            err
          );
        }
        throw new AIProviderError(`Groq request failed: ${err instanceof Error ? err.message : String(err)}`, err);
      }

      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      if (!cleaned) {
        throw new AIProviderError('Groq returned an empty response.');
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

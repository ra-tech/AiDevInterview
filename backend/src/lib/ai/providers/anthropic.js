import Anthropic from '@anthropic-ai/sdk';
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
import { isProviderCallFailure, withBackoff } from './retry.js';

export class AnthropicProvider {
  constructor(apiKey = process.env.ANTHROPIC_API_KEY ?? '', model = process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6') {
    if (!apiKey) {
      throw new AIProviderError('ANTHROPIC_API_KEY is not set. Add it to .env before starting an interview.');
    }
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async runStructured(schema, prompt, maxTokens = 1024) {
    const attempt = async (extraUserContext) => {
      let response;
      try {
        response = await withBackoff(() =>
          this.client.messages.create({
            model: this.model,
            max_tokens: maxTokens,
            system: prompt.system,
            messages: [{ role: 'user', content: extraUserContext ? `${prompt.user}\n\n${extraUserContext}` : prompt.user }]
          })
        );
      } catch (err) {
        throw new AIProviderError(`Anthropic request failed: ${err instanceof Error ? err.message : String(err)}`, err);
      }

      const textBlock = response.content.find((b) => b.type === 'text');
      const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
      const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

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

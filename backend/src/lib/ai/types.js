import { z } from 'zod';

// ---------------------------------------------------------------------------
// Structured-output contracts. Every AI call in this app returns one of these
// shapes. Prompts instruct the model to return JSON only; callers MUST run the
// response through the matching schema before touching it (see providers/*.js).
//
// Note on numeric fields: providers are asked for JSON via prompt instructions
// rather than a strictly-enforced JSON Schema (mainly for Gemini, whose
// structured-output mode is less consistent about number vs. string typing
// than Anthropic's). In practice this means a score can come back as "3"
// instead of 3, or slightly outside its documented range. `boundedInt` below
// coerces and clamps those cases instead of hard-failing validation — a
// wrong-but-close score is far less harmful to the product than an entire
// interview turn failing over a type coercion the model got wrong.
// ---------------------------------------------------------------------------

function boundedInt(min, max, fallback) {
  return z.preprocess((val) => {
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (typeof n !== 'number' || Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  }, z.number().int().min(min).max(max));
}

function coercedPositiveInt(fallback) {
  return z.preprocess((val) => {
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (typeof n !== 'number' || Number.isNaN(n) || n <= 0) return fallback;
    return Math.round(n);
  }, z.number().int().positive());
}

export const InterviewPlanSchema = z.object({
  target_role: z.string(),
  duration_minutes: coercedPositiveInt(30),
  sections: z
    .array(
      z.object({
        type: z.string(), // "introduction" | "javascript" | "react" | "coding" | ... (open-ended by design)
        duration: coercedPositiveInt(5)
      })
    )
    .min(1)
});

export const JDExtractionSchema = z.object({
  role: z.string(),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  responsibilities: z.array(z.string()),
  experience_expectations: z.array(z.string()),
  important_keywords: z.array(z.string())
});

export const GeneratedQuestionSchema = z.object({
  section: z.string(),
  type: z.enum(['introduction', 'conceptual', 'coding', 'behavioral', 'candidate_questions']),
  prompt: z.string(),
  difficulty: boundedInt(1, 5, 3)
});

export const AnswerEvaluationSchema = z.object({
  technical_accuracy: boundedInt(0, 10, 5),
  problem_solving: boundedInt(0, 10, 5),
  communication: boundedInt(0, 10, 5),
  depth_of_understanding: boundedInt(0, 10, 5),
  covered_concepts: z.array(z.string()),
  missed_concepts: z.array(z.string()),
  explanation: z.string(),
  suggested_answer: z.string(),
  // The model's opinion on whether more evidence is needed before moving topics.
  // The orchestrator (not the model) makes the final state-transition decision,
  // but this signal feeds that decision — see interview/orchestrator.js.
  sufficient_evidence: z.boolean(),
  vague_or_evasive: z.boolean()
});

export const FollowUpDecisionSchema = z.object({
  action: z.enum(['ask_follow_up', 'change_topic']),
  next_prompt: z.string(),
  next_section: z.string().optional(),
  next_difficulty: boundedInt(1, 5, 3).optional()
});

export const CodingEvaluationSchema = z.object({
  correctness: boundedInt(0, 10, 5),
  time_complexity: z.string(),
  space_complexity: z.string(),
  readability: boundedInt(0, 10, 5),
  edge_case_handling: z.string(),
  suggested_follow_up: z.string().optional()
});

export const InterviewReportSchema = z.object({
  overall_score: boundedInt(0, 100, 50),
  technical_knowledge: boundedInt(0, 100, 50),
  problem_solving: boundedInt(0, 100, 50),
  coding: boundedInt(0, 100, 50),
  communication: boundedInt(0, 100, 50),
  depth_of_understanding: boundedInt(0, 100, 50),
  role_fit: boundedInt(0, 100, 50),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  evidence: z.array(
    z.object({
      topic: z.string(),
      score: boundedInt(0, 10, 5),
      narrative: z.string() // must reference what the candidate actually said (section 9)
    })
  ),
  study_plan: z.array(
    z.object({
      priority: z.number().int().positive(),
      title: z.string(),
      why: z.string(),
      practice: z.array(z.string())
    })
  )
});

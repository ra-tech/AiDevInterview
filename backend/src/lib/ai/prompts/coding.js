import { z } from 'zod';
import { INJECTION_GUARD, INTERVIEWER_PERSONA, JSON_ONLY_GUARD } from './shared.js';

export const CodingChallengeSchema = z.object({
  title: z.string(),
  statement: z.string(),
  constraints: z.string().optional(),
  function_name: z.string(), // same name used across every language's starter code — required for the execution harness
  examples: z.array(z.object({ input: z.string(), output: z.string(), explanation: z.string().optional() })),
  starter_code: z.record(z.string(), z.string()), // { javascript: "...", python: "..." }
  visible_tests: z.array(z.object({ input: z.string(), expectedOutput: z.string() })),
  hidden_tests: z.array(z.object({ input: z.string(), expectedOutput: z.string() }))
});

export function buildCodingChallengePrompt(input) {
  return {
    system: `${INTERVIEWER_PERSONA}\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nDesign one self-contained coding interview problem appropriate for the difficulty level (1=warm-up, 5=hard). Include at least 3 visible test cases and at least 3 hidden test cases that probe edge cases (empty input, boundary values, duplicates, etc). Provide starter code stubs for each requested language — just the function signature and a comment, not a solution.\n\nCRITICAL for automated grading — the harness that runs submissions splices "input" directly into a function call as literal source code, so:\n- Use the EXACT SAME function_name in every language's starter code.\n- Each test's "input" must be a comma-separated list of literal arguments in the TARGET LANGUAGE's own syntax, written exactly as they'd appear between the parentheses of a call to function_name — e.g. for a two-argument function: "3, [1, 2, 3]" (so the harness can build "function_name(3, [1, 2, 3])"). For a single string argument: "\\"leetcode\\"" (quotes included, so the harness can build "function_name(\\"leetcode\\")").\n- Each test's "expectedOutput" must be the JSON-stringified return value (e.g. a returned string "l" is written as the plain text l with no quotes; a returned array [1,2] is written as [1,2]) — this must match exactly what JSON.stringify would print for that value with surrounding quotes stripped for plain strings, since that's how the harness compares output.\n- Keep the function's parameter and return types to primitives, arrays, and plain objects only — no custom classes, no functions-as-arguments, nothing that can't round-trip through JSON.\n\nReturn JSON: { title, statement, constraints?, function_name, examples: [{input, output, explanation?}], starter_code: {<language>: <code>}, visible_tests: [{input, expectedOutput}], hidden_tests: [{input, expectedOutput}] }.`,
    user: `Target role: ${input.targetRole}\nRelevant skills: ${input.skills.join(', ')}\nDifficulty: ${input.difficulty}/5\nLanguages to provide starter code for: ${input.languages.join(', ')}`
  };
}

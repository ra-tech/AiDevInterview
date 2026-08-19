/**
 * Deterministic, zero-cost provider used by AI_PROVIDER=mock and the seed script. No LLM
 * calls — every method returns a plausible, schema-valid response synchronously.
 */
export class MockAIProvider {
  async extractJobDescription(rawText) {
    return {
      role: 'Software Engineer',
      required_skills: ['JavaScript', 'React'],
      preferred_skills: ['TypeScript', 'Node.js'],
      responsibilities: ['Build and maintain web applications'],
      experience_expectations: ['1-3 years of professional experience'],
      important_keywords: rawText.split(/\s+/).slice(0, 5)
    };
  }

  async generateInterviewPlan(input) {
    const per = Math.max(3, Math.floor(input.durationMinutes / (input.skills.length + 2)));
    return {
      target_role: input.targetRole,
      duration_minutes: input.durationMinutes,
      sections: [
        { type: 'introduction', duration: 3 },
        ...input.skills.map((s) => ({ type: s.toLowerCase().replace(/\s+/g, '_'), duration: per })),
        { type: 'candidate_questions', duration: 4 }
      ]
    };
  }

  async generateQuestion(input) {
    return {
      section: input.currentSection,
      type: input.history.length === 0 ? 'introduction' : 'conceptual',
      prompt:
        input.history.length === 0
          ? 'Tell me a bit about a recent project you worked on and your role in it.'
          : `Let's talk about ${input.currentSection.replace(/_/g, ' ')}. Can you walk me through a concept you consider important there, and why?`,
      difficulty: input.targetDifficulty
    };
  }

  async evaluateAnswer(input) {
    const length = input.answer.trim().length;
    const score = Math.min(9, Math.max(2, Math.round(length / 40)));
    return {
      technical_accuracy: score,
      problem_solving: score,
      communication: Math.min(9, score + 1),
      depth_of_understanding: score,
      covered_concepts: ['(mock) core concept'],
      missed_concepts: score < 6 ? ['(mock) edge cases'] : [],
      explanation: 'Mock evaluation generated without a live model call.',
      suggested_answer: 'A stronger answer would cover trade-offs and a concrete example.',
      sufficient_evidence: length > 60,
      vague_or_evasive: length < 20
    };
  }

  async generateFollowUp(input) {
    if (input.evaluation.sufficient_evidence) {
      return { action: 'change_topic', next_prompt: '' };
    }
    return {
      action: 'ask_follow_up',
      next_prompt: 'Can you go a bit deeper on that — specifically, how would it behave in an edge case?',
      next_section: input.currentSection,
      next_difficulty: input.question.length % 5 || 3
    };
  }

  async generateCodingChallenge(input) {
    const lang = input.languages[0] ?? 'javascript';
    return {
      title: 'First Non-Repeating Character',
      statement: 'Implement a function that returns the first non-repeating character in a string, or an empty string if none exists.',
      constraints: '1 <= s.length <= 10^5',
      function_name: 'firstNonRepeating',
      examples: [{ input: '"leetcode"', output: '"l"' }],
      starter_code: { [lang]: 'function firstNonRepeating(s) {\n  // your code here\n}' },
      visible_tests: [
        { input: '"leetcode"', expectedOutput: 'l' },
        { input: '"aabb"', expectedOutput: '' }
      ],
      hidden_tests: [
        { input: '""', expectedOutput: '' },
        { input: '"a"', expectedOutput: 'a' },
        { input: '"aabbccd"', expectedOutput: 'd' }
      ]
    };
  }

  async evaluateCodingSolution(input) {
    return {
      correctness: input.hiddenTotal ? Math.round((input.hiddenPassed / input.hiddenTotal) * 10) : 5,
      time_complexity: 'O(n)',
      space_complexity: 'O(1)',
      readability: 7,
      edge_case_handling: 'Handles the visible cases; unicode/empty-input behavior untested by mock.',
      suggested_follow_up: 'What happens if the input is empty?'
    };
  }

  async generateFinalReport(input) {
    const avg = (n) => Math.round(n * 10);
    return {
      overall_score: avg(input.performanceModel.technical_accuracy),
      technical_knowledge: avg(input.performanceModel.technical_accuracy),
      problem_solving: avg(input.performanceModel.problem_solving),
      coding: avg(input.performanceModel.coding),
      communication: avg(input.performanceModel.communication),
      depth_of_understanding: avg(input.performanceModel.depth_of_understanding),
      role_fit: avg((input.performanceModel.technical_accuracy + input.performanceModel.depth_of_understanding) / 2),
      strengths: ['(mock) Communicated clearly across most answers'],
      weaknesses: ['(mock) Could go deeper on edge cases'],
      evidence: input.transcript.slice(0, 3).map((t) => ({
        topic: t.section,
        score: t.evaluation.technical_accuracy,
        narrative: `Mock evidence generated from the recorded answer to: "${t.question.slice(0, 60)}..."`
      })),
      study_plan: [
        {
          priority: 1,
          title: '(mock) Revisit core fundamentals',
          why: 'Generated without a live model call — replace AI_PROVIDER=groq/gemini/anthropic for real feedback.',
          practice: ['Review the topics marked as missed concepts in your question review.']
        }
      ]
    };
  }
}

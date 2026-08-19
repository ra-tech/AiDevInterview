import { INJECTION_GUARD, INTERVIEWER_PERSONA, JSON_ONLY_GUARD, wrapUntrusted } from './shared.js';

// 1. JD extraction ------------------------------------------------------
export function buildJDExtractionPrompt(rawText) {
  return {
    system: `You extract structured hiring signal from a raw job description.\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nReturn JSON: { role, required_skills[], preferred_skills[], responsibilities[], experience_expectations[], important_keywords[] }.`,
    user: `Job description:\n${wrapUntrusted('JOB_DESCRIPTION', rawText)}`
  };
}

// 2. Interview planning ---------------------------------------------------
export function buildInterviewPlanPrompt(input) {
  const jdBlock = input.jdExtraction
    ? `Extracted job description signal:\n${JSON.stringify(input.jdExtraction, null, 2)}`
    : 'No job description was provided.';
  const historyBlock =
    input.previousReports && input.previousReports.length > 0
      ? `This candidate has prior interview history:\n${JSON.stringify(input.previousReports, null, 2)}\nWeight the plan toward previously demonstrated weaknesses, without ignoring core fundamentals.`
      : 'This is the candidate\'s first interview — no history to weight against.';
  const resumeBlock = input.resumeText
    ? `\n\nThe candidate's resume:\n${wrapUntrusted('RESUME', input.resumeText)}\nYou may use this to sanity-check section relevance (e.g. don't plan a deep systems-design section for someone with no backend experience listed), but the resume mainly matters for individual question phrasing later, not the plan structure itself.`
    : '';

  return {
    system: `You design the internal section plan for a technical interview. This plan is never shown to the candidate.\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nReturn JSON: { target_role, duration_minutes, sections: [{ type, duration }] }. Section durations must sum to duration_minutes. Always include an "introduction" section first and end with "candidate_questions". Choose section types from the candidate's selected skills (e.g. "javascript", "react", "system_design", "coding", "dbms") plus JD-driven topics when relevant.`,
    user: `Target role: ${input.targetRole}\nExperience level: ${input.experienceLevel}\nSelected skills: ${input.skills.join(', ')}\nTotal duration: ${input.durationMinutes} minutes\n\n${jdBlock}\n\n${historyBlock}${resumeBlock}`
  };
}

// 3. Question generation ---------------------------------------------------
export function buildQuestionPrompt(input) {
  const historyBlock = input.history.length
    ? input.history
        .map((h, i) => `Q${i + 1}: ${h.prompt}\nA${i + 1}: ${h.answer ?? '(not yet answered)'}`)
        .join('\n\n')
    : '(no questions asked yet — this is the opening question)';

  const jdBlock = input.jdExtraction
    ? `\n\nThis interview is targeted at a specific job description. Where it fits naturally with the current section, lean the question toward what this JD actually asks for — its required/preferred skills, responsibilities, and keywords — rather than a generic version of the topic:\nRequired skills: ${input.jdExtraction.required_skills.join(', ') || '(none listed)'}\nPreferred skills: ${input.jdExtraction.preferred_skills.join(', ') || '(none listed)'}\nResponsibilities: ${input.jdExtraction.responsibilities.join('; ') || '(none listed)'}\nKeywords: ${input.jdExtraction.important_keywords.join(', ') || '(none listed)'}\nDo not force a JD connection where the current section has nothing to do with it — general engineering fundamentals still matter.`
    : '';

  const resumeBlock = input.resumeText
    ? `\n\nThe candidate's resume:\n${wrapUntrusted('RESUME', input.resumeText)}\nFor the introduction section especially, ask about a SPECIFIC project, role, or line item actually listed here rather than a generic "tell me about yourself" — e.g. reference a named project, technology, or company. For other sections, only reference the resume where it naturally sharpens the question; don't force it.`
    : '';

  return {
    system: `${INTERVIEWER_PERSONA}\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nGenerate exactly ONE next question for the current section. Never repeat a question already asked. Calibrate difficulty (1=foundational, 5=expert edge-cases/trade-offs) to the requested target difficulty.${jdBlock}${resumeBlock}\n\nReturn JSON: { section, type, prompt, difficulty }. type must be one of introduction | conceptual | coding | behavioral | candidate_questions.`,
    user: `Interview plan:\n${JSON.stringify(input.plan, null, 2)}\n\nCurrent section: ${input.currentSection}\nTarget difficulty: ${input.targetDifficulty}/5\n\nConversation so far:\n${wrapUntrusted('CONVERSATION_HISTORY', historyBlock)}`
  };
}

// 4. Answer evaluation ---------------------------------------------------
export function buildAnswerEvaluationPrompt(input) {
  return {
    system: `You evaluate a candidate's spoken/written interview answer on its semantic quality — never on keyword matching alone. Be exacting but fair; do not be swayed by confident phrasing that lacks substance, and do not penalize concise correct answers for being short.\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nReturn JSON: { technical_accuracy (0-10), problem_solving (0-10), communication (0-10), depth_of_understanding (0-10), covered_concepts[], missed_concepts[], explanation, suggested_answer, sufficient_evidence (bool — true if you have enough signal on this concept to move on), vague_or_evasive (bool) }.`,
    user: `Section: ${input.section}\nQuestion asked:\n${wrapUntrusted('QUESTION', input.question)}\n\nCandidate's answer:\n${wrapUntrusted('CANDIDATE_ANSWER', input.answer)}\n\nCandidate's running performance model:\n${JSON.stringify(input.performanceModel, null, 2)}`
  };
}

// 5. Follow-up decision ---------------------------------------------------
export function buildFollowUpPrompt(input) {
  return {
    system: `${INTERVIEWER_PERSONA}\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nDecide whether to probe deeper on the same concept or move to a new topic, then write the actual next question. Ask a follow-up when the answer was vague, partially correct, or when digging in would reveal meaningfully more signal. Change topic when you already have sufficient evidence (see the evaluation) or when further probing here would be redundant. When asking a follow-up on a vague answer, prefer a concrete scenario the candidate must reason through over restating the original question.\n\nReturn JSON: { action: "ask_follow_up" | "change_topic", next_prompt, next_section?, next_difficulty? }.`,
    user: `Current section: ${input.currentSection}\nQuestion:\n${wrapUntrusted('QUESTION', input.question)}\n\nAnswer:\n${wrapUntrusted('CANDIDATE_ANSWER', input.answer)}\n\nEvaluation of that answer:\n${JSON.stringify(input.evaluation, null, 2)}\n\nPerformance model so far:\n${JSON.stringify(input.performanceModel, null, 2)}\n\nInterview plan:\n${JSON.stringify(input.plan, null, 2)}`
  };
}

// 6. Coding solution evaluation ---------------------------------------------------
export function buildCodingEvaluationPrompt(input) {
  return {
    system: `You review a candidate's code submission the way a senior engineer would in a live interview: correctness, algorithmic choice, complexity, readability, and edge-case handling. Base every judgment on the actual code shown, not on assumptions.\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nALWAYS include suggested_follow_up — this is not optional in practice. It becomes the interviewer's next actual spoken question, so phrase it as a direct question to the candidate (e.g. "Your implementation runs in O(n²) here — can you reduce the complexity?" or "What happens if the input contains Unicode characters?"), referencing something specific and real about THIS submission (its actual complexity, a specific line, a specific untested edge case) — never a generic or templated question. If the solution is already excellent with nothing meaningful to probe, ask the candidate to justify a specific design decision they made instead of inventing a flaw.\n\nReturn JSON: { correctness (0-10), time_complexity, space_complexity, readability (0-10), edge_case_handling, suggested_follow_up }.`,
    user: `Problem statement:\n${input.problemStatement}\n\nLanguage: ${input.language}\nVisible tests: ${input.visiblePassed}/${input.visibleTotal} passed\nHidden tests: ${input.hiddenPassed}/${input.hiddenTotal} passed\n\nSubmitted code:\n${wrapUntrusted('SUBMITTED_CODE', input.code)}`
  };
}

// 7. Final report ---------------------------------------------------
export function buildFinalReportPrompt(input) {
  const transcriptBlock = input.transcript
    .map(
      (t, i) =>
        `[${t.section}] Q${i + 1}: ${t.question}\nA${i + 1}: ${t.answer}\nScored: technical=${t.evaluation.technical_accuracy}, problem_solving=${t.evaluation.problem_solving}, depth=${t.evaluation.depth_of_understanding}\nCovered: ${t.evaluation.covered_concepts.join(', ') || '(none)'}\nMissed: ${t.evaluation.missed_concepts.join(', ') || '(none)'}`
    )
    .join('\n\n');

  const codingBlock = input.codingSubmissions.length
    ? input.codingSubmissions
        .map((c) => `Problem: ${c.problem}\nCorrectness: ${c.evaluation.correctness}/10, Time: ${c.evaluation.time_complexity}, Space: ${c.evaluation.space_complexity}`)
        .join('\n\n')
    : '(no coding challenges in this interview)';

  return {
    system: `You write the final evaluation report for a completed technical interview. Every strength and weakness MUST cite something the candidate actually said or did — never assert a conclusion the transcript doesn't support (spec section 9: "the report must not feel like arbitrary AI scoring"). The study plan must be derived only from demonstrated weaknesses, never generic advice.\n${INJECTION_GUARD}\n${JSON_ONLY_GUARD}\n\nReturn JSON: { overall_score (0-100), technical_knowledge (0-100), problem_solving (0-100), coding (0-100), communication (0-100), depth_of_understanding (0-100), role_fit (0-100), strengths[], weaknesses[], evidence: [{ topic, score (0-10), narrative }], study_plan: [{ priority, title, why, practice[] }] }.`,
    user: `Target role: ${input.targetRole}\n\nFull transcript:\n${wrapUntrusted('TRANSCRIPT', transcriptBlock)}\n\nCoding submissions:\n${wrapUntrusted('CODING_SUBMISSIONS', codingBlock)}\n\nFinal performance model:\n${JSON.stringify(input.performanceModel, null, 2)}`
  };
}

import { prisma } from '../../db.js';
import { getAIProvider } from '../ai/provider.js';
import { assertTransition } from './state-machine.js';
import { EMPTY_PERFORMANCE_MODEL, nextDifficulty, updatePerformanceModel } from './skill-model.js';

/**
 * This module implements the loop from spec section 30:
 *
 *   Ask Question -> Receive Answer -> Evaluate Answer -> Update Skill Model
 *   -> Decide (follow-up vs change topic) -> Generate Next Question
 *
 * Every step persists to Postgres before calling the AI provider for the
 * next one (section 23: "Persist candidate answers before requesting AI
 * evaluation" — so a failed AI call never loses what the candidate wrote).
 */

const MAP_QTYPE = {
  introduction: 'INTRODUCTION',
  conceptual: 'CONCEPTUAL',
  coding: 'CODING',
  behavioral: 'BEHAVIORAL',
  candidate_questions: 'CANDIDATE_QUESTIONS'
};

export async function startInterview(interviewId) {
  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: { jobDescription: true, resume: true, user: { include: { interviews: { include: { report: true } } } } }
  });

  assertTransition(interview.state, 'PLANNING');
  await prisma.interview.update({ where: { id: interviewId }, data: { state: 'PLANNING' } });

  try {
    const provider = getAIProvider();

    const jdExtraction = interview.jobDescription?.extracted;
    const previousReports = interview.user.interviews
      .filter((i) => i.report)
      .map((i) => ({ overallScore: i.report.overallScore, weaknesses: i.report.weaknesses }));

    const plan = await provider.generateInterviewPlan({
      targetRole: interview.targetRole.replace(/_/g, ' '),
      experienceLevel: interview.experienceLevel.replace(/_/g, ' '),
      skills: interview.skills,
      durationMinutes: interview.durationMinutes,
      jdExtraction: jdExtraction ?? null,
      previousReports,
      resumeText: interview.resume?.rawText ?? null
    });

    await prisma.interviewPlan.create({
      data: { interviewId, sections: plan.sections, raw: plan }
    });

    assertTransition('PLANNING', 'IN_PROGRESS');
    await prisma.interview.update({
      where: { id: interviewId },
      data: { state: 'IN_PROGRESS', startedAt: new Date() }
    });
  } catch (err) {
    // Planning failed (bad/missing API key, model error, etc). Revert to CREATED so the
    // candidate can simply retry "Begin Interview" once the underlying issue is fixed,
    // instead of getting permanently stuck at PLANNING with no valid state transition out.
    await prisma.interview.update({ where: { id: interviewId }, data: { state: 'CREATED' } });
    throw err;
  }

  return generateNextQuestion(interviewId);
}

/** Generates and persists the next question given everything asked/answered so far. */
export async function generateNextQuestion(interviewId) {
  const interview = await prisma.interview.findUniqueOrThrow({
    where: { id: interviewId },
    include: {
      plan: true,
      jobDescription: true,
      resume: true,
      questions: { include: { answer: { include: { evaluation: true } } }, orderBy: { sequence: 'asc' } }
    }
  });

  if (interview.state !== 'IN_PROGRESS') {
    throw new Error(`Cannot generate a question while interview is in state ${interview.state}`);
  }
  if (!interview.plan) throw new Error('Interview has no plan — call startInterview first.');

  const plan = { sections: interview.plan.sections };
  const provider = getAIProvider();
  const jdExtraction = interview.jobDescription?.extracted;

  const performanceModel = interview.questions.reduce((model, q) => {
    if (q.answer?.evaluation) return updatePerformanceModel(model, mapEvaluation(q.answer.evaluation));
    return model;
  }, EMPTY_PERFORMANCE_MODEL);

  const answeredCount = interview.questions.filter((q) => q.answer).length;
  const currentSectionIndex = pickCurrentSectionIndex(plan, answeredCount);
  const currentSection = plan.sections[currentSectionIndex]?.type ?? 'wrap_up';

  const lastDifficulty = interview.questions.at(-1)?.difficulty ?? 3;
  const targetDifficulty = nextDifficulty(performanceModel, lastDifficulty);

  const question = await provider.generateQuestion({
    plan,
    currentSection,
    targetDifficulty,
    history: interview.questions.map((q) => ({ prompt: q.prompt, answer: q.answer?.content ?? null })),
    jdExtraction: jdExtraction ?? null,
    resumeText: interview.resume?.rawText ?? null
  });

  return prisma.interviewQuestion.create({
    data: {
      interviewId,
      sequence: interview.questions.length + 1,
      section: question.section,
      type: MAP_QTYPE[question.type] ?? 'CONCEPTUAL',
      prompt: question.prompt,
      difficulty: question.difficulty
    }
  });
}

/** Persists the candidate's answer (immutable, section 21), then evaluates it. Answer is saved BEFORE the AI call so nothing is lost if evaluation fails (section 23). */
export async function submitAnswer(questionId, content) {
  const existing = await prisma.candidateAnswer.findUnique({ where: { questionId } });
  if (existing) throw new Error('This question has already been answered and cannot be edited.');

  const answer = await prisma.candidateAnswer.create({ data: { questionId, content } });

  const question = await prisma.interviewQuestion.findUniqueOrThrow({
    where: { id: questionId },
    include: { interview: { include: { questions: { include: { answer: { include: { evaluation: true } } } } } } }
  });

  const performanceModel = question.interview.questions.reduce((model, q) => {
    if (q.answer?.evaluation) return updatePerformanceModel(model, mapEvaluation(q.answer.evaluation));
    return model;
  }, EMPTY_PERFORMANCE_MODEL);

  const provider = getAIProvider();
  const evaluation = await provider.evaluateAnswer({
    question: question.prompt,
    answer: content,
    section: question.section,
    performanceModel
  });

  await prisma.answerEvaluation.create({
    data: {
      answerId: answer.id,
      technicalAccuracy: evaluation.technical_accuracy,
      problemSolving: evaluation.problem_solving,
      communication: evaluation.communication,
      depthOfUnderstanding: evaluation.depth_of_understanding,
      coveredConcepts: evaluation.covered_concepts,
      missedConcepts: evaluation.missed_concepts,
      explanation: evaluation.explanation,
      suggestedAnswer: evaluation.suggested_answer,
      raw: evaluation
    }
  });

  return { answer, evaluation };
}

/** Section 3-4 decision point: follow up on the same concept, or move to a new topic/question. */
export async function decideNext(interviewId, questionId) {
  const question = await prisma.interviewQuestion.findUniqueOrThrow({
    where: { id: questionId },
    include: { answer: { include: { evaluation: true } }, interview: { include: { plan: true, questions: { include: { answer: { include: { evaluation: true } } } } } } }
  });
  if (!question.answer || !question.answer.evaluation) {
    throw new Error('Cannot decide next step before the answer is evaluated.');
  }

  const plan = { sections: question.interview.plan.sections };
  const evaluation = mapEvaluation(question.answer.evaluation);

  const performanceModel = question.interview.questions.reduce((model, q) => {
    if (q.answer?.evaluation) return updatePerformanceModel(model, mapEvaluation(q.answer.evaluation));
    return model;
  }, EMPTY_PERFORMANCE_MODEL);

  const provider = getAIProvider();
  const decision = await provider.generateFollowUp({
    question: question.prompt,
    answer: question.answer.content,
    evaluation,
    performanceModel,
    plan,
    currentSection: question.section
  });

  if (decision.action === 'ask_follow_up') {
    return prisma.interviewQuestion.create({
      data: {
        interviewId,
        sequence: question.interview.questions.length + 1,
        section: question.section,
        type: 'FOLLOW_UP',
        prompt: decision.next_prompt,
        parentId: question.id,
        difficulty: question.difficulty
      }
    });
  }

  // change_topic: fall through to the normal generator, which recomputes section/difficulty
  return generateNextQuestion(interviewId);
}

export async function completeInterview(interviewId) {
  assertTransition('IN_PROGRESS', 'COMPLETED');
  return prisma.interview.update({
    where: { id: interviewId },
    data: { state: 'COMPLETED', completedAt: new Date() }
  });
}

// ---- helpers ----

function mapEvaluation(e) {
  return {
    technical_accuracy: e.technicalAccuracy,
    problem_solving: e.problemSolving,
    communication: e.communication,
    depth_of_understanding: e.depthOfUnderstanding,
    covered_concepts: e.coveredConcepts,
    missed_concepts: e.missedConcepts,
    explanation: e.explanation,
    suggested_answer: e.suggestedAnswer ?? '',
    sufficient_evidence: true,
    vague_or_evasive: false
  };
}

function pickCurrentSectionIndex(plan, answeredCount) {
  // Simple proportional mapping from "questions answered so far" to plan sections,
  // weighted by each section's planned duration. Good enough for Phase 1; Phase 3
  // can replace this with actual elapsed-time tracking against the interview clock.
  const totalDuration = plan.sections.reduce((s, sec) => s + sec.duration, 0);
  const totalQuestions = Math.max(1, Math.round(totalDuration / 4)); // ~4 min/question heuristic
  const progress = Math.min(1, answeredCount / totalQuestions);

  let cumulative = 0;
  for (let i = 0; i < plan.sections.length; i++) {
    cumulative += plan.sections[i].duration;
    if (progress <= cumulative / totalDuration) return i;
  }
  return plan.sections.length - 1;
}

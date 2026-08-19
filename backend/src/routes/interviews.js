import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth } from '../auth/middleware.js';
import { CreateInterviewSchema, SubmitAnswerSchema } from '../lib/validation/schemas.js';
import { getAIProvider } from '../lib/ai/provider.js';
import { AIProviderError } from '../lib/ai/providers/errors.js';
import { startInterview, submitAnswer, decideNext, completeInterview } from '../lib/interview/orchestrator.js';
import { assertTransition } from '../lib/interview/state-machine.js';
import { EMPTY_PERFORMANCE_MODEL, nextDifficulty, updatePerformanceModel } from '../lib/interview/skill-model.js';
import { getCodeRunner } from '../lib/coderunner/mock-runner.js';
import { isHarnessSupported } from '../lib/coderunner/harness.js';
import { DEFAULT_MEMORY_LIMIT_MB, DEFAULT_TIMEOUT_MS, sanitizeSubmission } from '../lib/coderunner/types.js';
import { track } from '../lib/analytics.js';

const router = Router();
router.use(requireAuth); // every interview route requires a logged-in user

const SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'python', 'java', 'cpp'];
const FALLBACK_ROLE = 'FULL_STACK_DEVELOPER';
const FALLBACK_LEVEL = 'ENTRY_LEVEL';
const FALLBACK_SKILLS = ['JavaScript', 'React', 'REST APIs'];

// ---------- Dashboard aggregation (static route — must be registered before /:id) ----------

router.get('/meta/dashboard', async (req, res) => {
  const userId = req.userId;

  const interviews = await prisma.interview.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { report: true }
  });

  // Trend needs the FULL chronological history, not just the 10-item recent list above —
  // spec section 11 explicitly asks for "score trend" across all interviews.
  const allScoredInterviews = await prisma.interview.findMany({
    where: { userId, report: { isNot: null } },
    orderBy: { createdAt: 'asc' },
    include: { report: true }
  });

  const skillScores = await prisma.skillScore.findMany({ where: { userId } });

  res.json({ interviews, allScoredInterviews, skillScores });
});

// ---------- List / Create ----------

router.get('/', async (req, res) => {
  const interviews = await prisma.interview.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: 'desc' },
    include: { report: true, jobDescription: true }
  });
  res.json(interviews);
});

router.post('/', async (req, res) => {
  const parsed = CreateInterviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { targetRole, experienceLevel, skills, durationMinutes, jobDescriptionText, resumeText } = parsed.data;
  const userId = req.userId;

  let jobDescriptionId;
  if (jobDescriptionText && jobDescriptionText.trim().length > 0) {
    try {
      const provider = getAIProvider();
      const extracted = await provider.extractJobDescription(jobDescriptionText);
      const jd = await prisma.jobDescription.create({ data: { userId, rawText: jobDescriptionText, extracted } });
      jobDescriptionId = jd.id;
    } catch (err) {
      // Section 23: a failed AI call must never lose the candidate's setup —
      // fall back to storing the raw JD without extraction rather than failing the whole request.
      const jd = await prisma.jobDescription.create({ data: { userId, rawText: jobDescriptionText } });
      jobDescriptionId = jd.id;
      console.error('JD extraction failed, stored raw text only:', err instanceof AIProviderError ? err.message : err);
    }
  }

  // No AI extraction step for resumes — raw text is passed directly as grounding context.
  let resumeId;
  if (resumeText && resumeText.trim().length > 0) {
    const resume = await prisma.resume.create({ data: { userId, rawText: resumeText } });
    resumeId = resume.id;
  }

  const interview = await prisma.interview.create({
    data: { userId, targetRole, experienceLevel, skills, durationMinutes, jobDescriptionId, resumeId }
  });

  await track('interview_created', {
    userId,
    interviewId: interview.id,
    metadata: { targetRole, durationMinutes, hasJobDescription: !!jobDescriptionId, hasResume: !!resumeId }
  });

  res.status(201).json(interview);
});

// ---------- Demo interview (static route — must be registered before /:id) ----------

router.post('/demo', async (req, res) => {
  const userId = req.userId;
  const profile = await prisma.candidateProfile.findUnique({ where: { userId } });

  let targetRole = profile?.targetRole ?? undefined;
  let experienceLevel = profile?.experienceLevel ?? undefined;
  let skills = profile?.primarySkills?.length ? profile.primarySkills : undefined;
  let source = profile?.targetRole ? 'profile' : 'fallback';

  if (!targetRole || !experienceLevel || !skills) {
    const lastInterview = await prisma.interview.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    if (lastInterview) {
      targetRole = targetRole ?? lastInterview.targetRole;
      experienceLevel = experienceLevel ?? lastInterview.experienceLevel;
      skills = skills ?? (lastInterview.skills.length ? lastInterview.skills : undefined);
      source = 'previous_interview';
    }
  }

  targetRole = targetRole ?? FALLBACK_ROLE;
  experienceLevel = experienceLevel ?? FALLBACK_LEVEL;
  skills = skills ?? FALLBACK_SKILLS;

  const lastResume = await prisma.resume.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });

  const interview = await prisma.interview.create({
    data: { userId, targetRole, experienceLevel, skills, durationMinutes: 15, resumeId: lastResume?.id }
  });

  await track('interview_created', {
    userId,
    interviewId: interview.id,
    metadata: { targetRole: interview.targetRole, durationMinutes: interview.durationMinutes, demo: true, source }
  });

  try {
    await startInterview(interview.id);
    await track('interview_started', { userId, interviewId: interview.id, metadata: { demo: true } });
  } catch (err) {
    if (err instanceof AIProviderError) {
      const detail = process.env.NODE_ENV !== 'production' ? `: ${err.message}` : '';
      return res.status(502).json({ error: `The AI interviewer is temporarily unavailable. Please try again${detail}.` });
    }
    throw err;
  }

  res.status(201).json({ id: interview.id });
});

// ---------- Single interview: get / start / delete ----------

async function loadOwnedInterview(id, userId) {
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      plan: true,
      questions: { orderBy: { sequence: 'asc' }, include: { answer: { include: { evaluation: true } } } }
    }
  });
  if (!interview || interview.userId !== userId) return null;
  return interview;
}

router.get('/:id', async (req, res) => {
  const interview = await loadOwnedInterview(req.params.id, req.userId);
  if (!interview) return res.status(404).json({ error: 'Not found' });

  // Section 21: never leak scores/evaluations while the interview is still running.
  const sanitized =
    interview.state === 'IN_PROGRESS' || interview.state === 'CODING_CHALLENGE'
      ? { ...interview, questions: interview.questions.map((q) => ({ ...q, answer: q.answer ? { ...q.answer, evaluation: null } : null })) }
      : interview;

  res.json(sanitized);
});

/** Starts the interview (CREATED -> PLANNING -> IN_PROGRESS, first question generated). */
router.post('/:id', async (req, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

  try {
    const firstQuestion = await startInterview(req.params.id);
    await track('interview_started', { userId: req.userId, interviewId: req.params.id, metadata: { targetRole: interview.targetRole } });

    // The client needs the plan's sections immediately to render the Interview Progress
    // sidebar — merged onto the question response rather than changing its shape.
    const plan = await prisma.interviewPlan.findUnique({ where: { interviewId: req.params.id } });
    res.status(201).json({ ...firstQuestion, planSections: plan?.sections ?? [] });
  } catch (err) {
    if (err instanceof AIProviderError) {
      const detail = process.env.NODE_ENV !== 'production' ? `: ${err.message}` : '';
      return res.status(502).json({ error: `The AI interviewer is temporarily unavailable. Please try again${detail}.` });
    }
    console.error('Failed to start interview', err);
    res.status(500).json({ error: 'Something went wrong starting the interview. Please try again.' });
  }
});

/** Permanently removes an interview and everything under it via cascading FK deletes. */
router.delete('/:id', async (req, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

  await prisma.interview.delete({ where: { id: req.params.id } });
  res.json({ deleted: true });
});

// ---------- Answer submission ----------

const AnswerBodySchema = SubmitAnswerSchema.extend({ questionId: z.string().min(1) });

router.post('/:id/answer', async (req, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  if (interview.state !== 'IN_PROGRESS') {
    return res.status(409).json({ error: `Interview is not accepting answers in state ${interview.state}` });
  }

  const parsed = AnswerBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const question = await prisma.interviewQuestion.findUnique({ where: { id: parsed.data.questionId } });
  if (!question || question.interviewId !== req.params.id) {
    return res.status(404).json({ error: 'Question not found in this interview' });
  }

  try {
    // Answer is persisted inside submitAnswer() BEFORE the AI evaluation call (section 23).
    await submitAnswer(question.id, parsed.data.content);
    await track('answer_submitted', { userId: req.userId, interviewId: req.params.id, metadata: { section: question.section } });
    const next = await decideNext(req.params.id, question.id);
    res.json({ nextQuestion: next });
  } catch (err) {
    // Guards against duplicate submissions — the second click hits this, not a generic 500.
    if (err instanceof Error && err.message.includes('already been answered')) {
      return res.status(409).json({ error: 'This question was already answered.' });
    }
    if (err instanceof AIProviderError) {
      console.error('AI provider failed during answer submission:', err.message, err.cause ?? '');
      const detail = process.env.NODE_ENV !== 'production' ? ` (${err.message})` : '';
      return res.status(502).json({ error: `Your answer was saved, but the interviewer is temporarily unavailable. Please retry.${detail}` });
    }
    throw err;
  }
});

// ---------- Coding challenge: generate ----------

router.post('/:id/coding', async (req, res) => {
  const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: { questions: { include: { answer: { include: { evaluation: true } } }, orderBy: { sequence: 'asc' } } }
  });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

  try {
    assertTransition(interview.state, 'CODING_CHALLENGE');
  } catch {
    return res.status(409).json({ error: `Cannot start a coding challenge from state ${interview.state}` });
  }

  const performanceModel = interview.questions.reduce((model, q) => {
    if (!q.answer?.evaluation) return model;
    return updatePerformanceModel(model, {
      technical_accuracy: q.answer.evaluation.technicalAccuracy,
      problem_solving: q.answer.evaluation.problemSolving,
      communication: q.answer.evaluation.communication,
      depth_of_understanding: q.answer.evaluation.depthOfUnderstanding,
      covered_concepts: q.answer.evaluation.coveredConcepts,
      missed_concepts: q.answer.evaluation.missedConcepts,
      explanation: q.answer.evaluation.explanation,
      suggested_answer: q.answer.evaluation.suggestedAnswer ?? '',
      sufficient_evidence: true,
      vague_or_evasive: false
    });
  }, EMPTY_PERFORMANCE_MODEL);

  const difficulty = nextDifficulty(performanceModel, 3);
  const relevantSkills = interview.skills.filter((s) => SUPPORTED_LANGUAGES.includes(s.toLowerCase()));
  let languages = relevantSkills.length ? relevantSkills.map((s) => s.toLowerCase()) : ['javascript'];

  // When running against the real Judge0 executor, only offer languages the harness can
  // actually execute — no point letting a candidate write Java they can never Run/Submit.
  if (process.env.CODE_RUNNER === 'judge0') {
    const executable = languages.filter((l) => isHarnessSupported(l));
    languages = executable.length ? executable : ['javascript'];
  }

  const provider = getAIProvider();
  let generated;
  try {
    generated = await provider.generateCodingChallenge({
      targetRole: interview.targetRole.replace(/_/g, ' '),
      skills: interview.skills,
      difficulty,
      languages
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      return res.status(502).json({ error: 'Could not generate a coding challenge right now. Please retry.' });
    }
    throw err;
  }

  const result = await prisma.$transaction(async (tx) => {
    const question = await tx.interviewQuestion.create({
      data: {
        interviewId: req.params.id,
        sequence: interview.questions.length + 1,
        section: 'coding',
        type: 'CODING',
        prompt: generated.title,
        difficulty
      }
    });

    const challenge = await tx.codingChallenge.create({
      data: {
        interviewId: req.params.id,
        questionId: question.id,
        title: generated.title,
        statement: generated.statement,
        constraints: generated.constraints,
        functionName: generated.function_name,
        examples: generated.examples,
        starterCode: generated.starter_code,
        visibleTests: generated.visible_tests,
        hiddenTests: generated.hidden_tests // never sent to the client
      }
    });

    await tx.interview.update({ where: { id: req.params.id }, data: { state: 'CODING_CHALLENGE' } });

    return { question, challenge };
  });

  await track('coding_problem_started', { userId: req.userId, interviewId: req.params.id, metadata: { title: result.challenge.title, difficulty } });

  res.json({
    questionId: result.question.id,
    challengeId: result.challenge.id,
    title: result.challenge.title,
    statement: result.challenge.statement,
    constraints: result.challenge.constraints,
    examples: result.challenge.examples,
    starterCode: result.challenge.starterCode,
    visibleTests: result.challenge.visibleTests
    // hiddenTests intentionally omitted (spec section 6)
  });
});

// ---------- Coding challenge: run / submit ----------

const CodeBodySchema = z.object({
  language: z.enum(['javascript', 'typescript', 'python', 'java', 'cpp']),
  code: z.string().max(20000)
});

router.post('/:id/coding/:challengeId/run', async (req, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

  const challenge = await prisma.codingChallenge.findUnique({ where: { id: req.params.challengeId } });
  if (!challenge || challenge.interviewId !== req.params.id) return res.status(404).json({ error: 'Not found' });

  const parsed = CodeBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const sanitized = sanitizeSubmission(parsed.data.code);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.reason });

  const runner = getCodeRunner();
  let result;
  try {
    result = await runner.run({
      language: parsed.data.language,
      code: parsed.data.code,
      tests: challenge.visibleTests, // ONLY visible tests for "Run Code"
      functionName: challenge.functionName,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      memoryLimitMb: DEFAULT_MEMORY_LIMIT_MB
    });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Code execution failed for this language.' });
  }

  await track('code_executed', { userId: req.userId, interviewId: req.params.id, metadata: { language: parsed.data.language, passed: result.passedCount, total: result.totalCount } });

  res.json(result);
});

router.post('/:id/coding/:challengeId/submit', async (req, res) => {
  const interview = await prisma.interview.findUnique({ where: { id: req.params.id } });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });

  const challenge = await prisma.codingChallenge.findUnique({ where: { id: req.params.challengeId } });
  if (!challenge || challenge.interviewId !== req.params.id) return res.status(404).json({ error: 'Not found' });

  const parsed = CodeBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const sanitized = sanitizeSubmission(parsed.data.code);
  if (!sanitized.ok) return res.status(400).json({ error: sanitized.reason });

  const runner = getCodeRunner();
  let visibleResult, hiddenResult;
  try {
    [visibleResult, hiddenResult] = await Promise.all([
      runner.run({ language: parsed.data.language, code: parsed.data.code, tests: challenge.visibleTests, functionName: challenge.functionName, timeoutMs: DEFAULT_TIMEOUT_MS, memoryLimitMb: DEFAULT_MEMORY_LIMIT_MB }),
      runner.run({ language: parsed.data.language, code: parsed.data.code, tests: challenge.hiddenTests, functionName: challenge.functionName, timeoutMs: DEFAULT_TIMEOUT_MS, memoryLimitMb: DEFAULT_MEMORY_LIMIT_MB })
    ]);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Code execution failed for this language.' });
  }

  // Persist the submission BEFORE calling the AI reviewer (section 23).
  const submission = await prisma.codeSubmission.create({
    data: {
      codingChallengeId: challenge.id,
      language: parsed.data.language,
      code: parsed.data.code,
      passedVisible: visibleResult.passedCount,
      totalVisible: visibleResult.totalCount,
      passedHidden: hiddenResult.passedCount,
      totalHidden: hiddenResult.totalCount
    }
  });

  const provider = getAIProvider();
  try {
    const review = await provider.evaluateCodingSolution({
      problemStatement: challenge.statement,
      language: parsed.data.language,
      code: parsed.data.code,
      visiblePassed: visibleResult.passedCount,
      visibleTotal: visibleResult.totalCount,
      hiddenPassed: hiddenResult.passedCount,
      hiddenTotal: hiddenResult.totalCount
    });

    await prisma.codeSubmission.update({ where: { id: submission.id }, data: { aiReview: review } });

    if (interview.state === 'CODING_CHALLENGE') {
      assertTransition('CODING_CHALLENGE', 'IN_PROGRESS');
      await prisma.interview.update({ where: { id: req.params.id }, data: { state: 'IN_PROGRESS' } });
    }

    // Spec section 8: surface the AI's follow-up as an actual next interview question.
    if (review.suggested_follow_up && review.suggested_follow_up.trim().length > 0) {
      const questionCount = await prisma.interviewQuestion.count({ where: { interviewId: req.params.id } });
      await prisma.interviewQuestion.create({
        data: {
          interviewId: req.params.id,
          sequence: questionCount + 1,
          section: 'coding',
          type: 'FOLLOW_UP',
          parentId: challenge.questionId,
          prompt: review.suggested_follow_up,
          difficulty: 3
        }
      });
    }

    await track('coding_problem_submitted', {
      userId: req.userId,
      interviewId: req.params.id,
      metadata: { language: parsed.data.language, passedVisible: visibleResult.passedCount, totalVisible: visibleResult.totalCount }
    });

    res.json({
      passedVisible: visibleResult.passedCount,
      totalVisible: visibleResult.totalCount,
      passedHidden: hiddenResult.passedCount,
      totalHidden: hiddenResult.totalCount,
      review
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      return res.status(502).json({
        passedVisible: visibleResult.passedCount,
        totalVisible: visibleResult.totalCount,
        error: 'Your submission was saved and scored against tests, but the AI code review is temporarily unavailable.'
      });
    }
    throw err;
  }
});

// ---------- Report ----------

router.get('/:id/report', async (req, res) => {
  const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: {
      report: true,
      questions: { include: { answer: { include: { evaluation: true } } }, orderBy: { sequence: 'asc' } }
    }
  });
  if (!interview || interview.userId !== req.userId) return res.status(404).json({ error: 'Not found' });
  if (!interview.report) return res.status(404).json({ error: 'Report not generated yet' });

  await track('report_viewed', { userId: req.userId, interviewId: req.params.id, metadata: { overallScore: interview.report.overallScore } });

  res.json(interview);
});

router.post('/:id/report', async (req, res) => {
  const userId = req.userId;
  const interview = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: {
      questions: { include: { answer: { include: { evaluation: true } } }, orderBy: { sequence: 'asc' } },
      codingChallenges: { include: { submissions: true, question: true } }
    }
  });
  if (!interview || interview.userId !== userId) return res.status(404).json({ error: 'Not found' });

  if (interview.state === 'IN_PROGRESS' || interview.state === 'CODING_CHALLENGE') {
    await completeInterview(req.params.id);
  } else if (interview.state !== 'COMPLETED') {
    return res.status(409).json({ error: `Cannot generate report from state ${interview.state}` });
  }

  const answeredQuestions = interview.questions.filter((q) => q.answer?.evaluation);

  // Guard against generating a report from zero evidence — see orchestrator/README notes on
  // why an empty transcript reliably produces an inflated, made-up-looking score otherwise.
  if (answeredQuestions.length === 0) {
    const report = await prisma.$transaction(async (tx) => {
      const created = await tx.interviewReport.create({
        data: {
          interviewId: req.params.id,
          overallScore: 0,
          technicalKnowledge: 0,
          problemSolving: 0,
          coding: 0,
          communication: 0,
          depthOfUnderstanding: 0,
          roleFit: 0,
          strengths: [],
          weaknesses: ['No questions were answered during this interview, so there is no evidence to evaluate.'],
          evidence: [],
          studyPlan: [
            {
              priority: 1,
              title: 'Complete an interview',
              why: 'This interview ended before any question was answered.',
              practice: ['Start a new interview and answer at least the opening question to get real, evidence-based feedback.']
            }
          ]
        }
      });
      assertTransition('COMPLETED', 'EVALUATED');
      await tx.interview.update({ where: { id: req.params.id }, data: { state: 'EVALUATED' } });
      return created;
    });

    await track('interview_completed', { userId, interviewId: req.params.id, metadata: { overallScore: 0, noAnswers: true } });
    return res.status(201).json(report);
  }

  const performanceModel = answeredQuestions.reduce(
    (model, q) =>
      updatePerformanceModel(model, {
        technical_accuracy: q.answer.evaluation.technicalAccuracy,
        problem_solving: q.answer.evaluation.problemSolving,
        communication: q.answer.evaluation.communication,
        depth_of_understanding: q.answer.evaluation.depthOfUnderstanding,
        covered_concepts: q.answer.evaluation.coveredConcepts,
        missed_concepts: q.answer.evaluation.missedConcepts,
        explanation: q.answer.evaluation.explanation,
        suggested_answer: q.answer.evaluation.suggestedAnswer ?? '',
        sufficient_evidence: true,
        vague_or_evasive: false
      }),
    EMPTY_PERFORMANCE_MODEL
  );

  const provider = getAIProvider();
  let output;
  try {
    output = await provider.generateFinalReport({
      targetRole: interview.targetRole.replace(/_/g, ' '),
      transcript: answeredQuestions.map((q) => ({
        question: q.prompt,
        answer: q.answer.content,
        section: q.section,
        evaluation: {
          technical_accuracy: q.answer.evaluation.technicalAccuracy,
          problem_solving: q.answer.evaluation.problemSolving,
          communication: q.answer.evaluation.communication,
          depth_of_understanding: q.answer.evaluation.depthOfUnderstanding,
          covered_concepts: q.answer.evaluation.coveredConcepts,
          missed_concepts: q.answer.evaluation.missedConcepts,
          explanation: q.answer.evaluation.explanation,
          suggested_answer: q.answer.evaluation.suggestedAnswer ?? '',
          sufficient_evidence: true,
          vague_or_evasive: false
        }
      })),
      codingSubmissions: interview.codingChallenges.flatMap((c) =>
        c.submissions.map((s) => ({
          problem: c.title,
          evaluation: s.aiReview ?? { correctness: 0, time_complexity: 'unknown', space_complexity: 'unknown', readability: 0, edge_case_handling: 'not evaluated' }
        }))
      ),
      performanceModel
    });
  } catch (err) {
    if (err instanceof AIProviderError) {
      return res.status(502).json({ error: 'The AI interviewer could not generate the report right now. Your interview data is saved — please retry.' });
    }
    throw err;
  }

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.interviewReport.create({
      data: {
        interviewId: req.params.id,
        overallScore: output.overall_score,
        technicalKnowledge: output.technical_knowledge,
        problemSolving: output.problem_solving,
        coding: output.coding,
        communication: output.communication,
        depthOfUnderstanding: output.depth_of_understanding,
        roleFit: output.role_fit,
        strengths: output.strengths,
        weaknesses: output.weaknesses,
        evidence: output.evidence,
        studyPlan: output.study_plan,
        raw: output
      }
    });

    // Roll evidence topics into SkillScore for the progress dashboard (section 11).
    await tx.skillScore.createMany({
      data: output.evidence.map((e) => ({ userId, interviewId: req.params.id, topic: e.topic, score: e.score * 10 }))
    });

    assertTransition('COMPLETED', 'EVALUATED');
    await tx.interview.update({ where: { id: req.params.id }, data: { state: 'EVALUATED' } });

    return created;
  });

  await track('interview_completed', { userId, interviewId: req.params.id, metadata: { overallScore: report.overallScore } });

  res.status(201).json(report);
});

export default router;

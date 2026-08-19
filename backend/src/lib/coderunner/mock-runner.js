import { JudgeZeroRunner } from './judge0-runner.js';

/**
 * Local-dev / demo-mode runner. Does NOT execute the submitted code at all
 * (per section 7: never run arbitrary user code inside the primary app) —
 * a crude heuristic check instead, so the UI and rest of the pipeline can
 * be exercised end-to-end without a sandbox or a Judge0 instance to talk to.
 */
export class MockCodeRunner {
  async run(request) {
    const results = request.tests.map((t) => {
      const looksRight =
        request.code.includes(t.expectedOutput.trim()) || /return|print|console\.log/.test(request.code);
      return {
        input: t.input,
        expectedOutput: t.expectedOutput,
        actualOutput: looksRight ? t.expectedOutput : '(mock runner: no real execution occurred)',
        passed: looksRight
      };
    });

    return {
      results,
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length
    };
  }
}

let cached = null;

export function getCodeRunner() {
  if (cached) return cached;
  const kind = process.env.CODE_RUNNER ?? 'mock';
  cached = kind === 'judge0' ? new JudgeZeroRunner() : new MockCodeRunner();
  return cached;
}

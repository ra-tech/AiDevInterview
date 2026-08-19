import { buildHarness, isHarnessSupported, normalizeOutput } from './harness.js';

/**
 * Judge0 CE language IDs. These are the long-standing, widely-documented CE
 * IDs — stable across most CE deployments, but not guaranteed identical on
 * every self-hosted instance. If submissions start failing with a
 * language-related error, GET {JUDGE0_BASE_URL}/languages against your
 * specific instance and update this map.
 */
const LANGUAGE_IDS = {
  javascript: 63, // JavaScript (Node.js)
  typescript: 74, // TypeScript
  python: 71 // Python 3
  // java / cpp intentionally omitted — see harness.js for why they're not wired up yet.
};

/**
 * Real code execution via Judge0's HTTP API — candidate code never runs in
 * this process, only inside Judge0's own sandboxed workers. Works against:
 *   - The public, unauthenticated ce.judge0.com instance (fine for light
 *     development use; it's rate-limited and not meant for production load)
 *   - RapidAPI's Judge0 CE (needs JUDGE0_API_KEY, sent as X-RapidAPI-Key)
 *   - A self-hosted Judge0 instance (set JUDGE0_BASE_URL, no key needed)
 */
export class JudgeZeroRunner {
  constructor(baseUrl = process.env.JUDGE0_BASE_URL ?? 'https://ce.judge0.com', apiKey = process.env.JUDGE0_API_KEY || undefined) {
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async run(request) {
    if (!isHarnessSupported(request.language)) {
      throw new Error(
        `JudgeZeroRunner does not yet support "${request.language}" — only javascript, typescript, and python have an execution harness. See src/lib/coderunner/harness.js.`
      );
    }
    const languageId = LANGUAGE_IDS[request.language];
    if (!languageId) {
      throw new Error(`No Judge0 language ID configured for "${request.language}".`);
    }

    const results = [];
    for (const test of request.tests) {
      const program = buildHarness(request.language, request.code, request.functionName, test.input);
      const result = await this.submitOne(program, languageId, request.timeoutMs);
      results.push(this.toTestResult(test.input, test.expectedOutput, result));
    }

    const compileError = results.find((r) => r.stderr?.startsWith('COMPILE_ERROR:'))?.stderr;

    return {
      results,
      passedCount: results.filter((r) => r.passed).length,
      totalCount: results.length,
      compileError: compileError?.replace('COMPILE_ERROR:', '').trim()
    };
  }

  async submitOne(sourceCode, languageId, timeoutMs) {
    const controller = new AbortController();
    // A little headroom over the per-test timeout for network/queueing latency, on top of the
    // cpu_time_limit we pass to Judge0 itself (which is the real enforcement mechanism —
    // this AbortController is a client-side backstop, not the actual sandboxing boundary).
    const abortTimer = setTimeout(() => controller.abort(), timeoutMs + 5000);

    try {
      const res = await fetch(`${this.baseUrl}/submissions?base64_encoded=false&wait=true`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-RapidAPI-Key': this.apiKey, 'X-RapidAPI-Host': new URL(this.baseUrl).host } : {})
        },
        body: JSON.stringify({
          source_code: sourceCode,
          language_id: languageId,
          cpu_time_limit: Math.max(1, Math.ceil(timeoutMs / 1000)),
          wall_time_limit: Math.max(2, Math.ceil((timeoutMs / 1000) * 2))
        })
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Judge0 request failed (${res.status}): ${body.slice(0, 300)}`);
      }

      return await res.json();
    } finally {
      clearTimeout(abortTimer);
    }
  }

  toTestResult(input, expectedOutput, response) {
    // Judge0 status IDs: 3 = Accepted (ran successfully, exit code 0). Everything else is some
    // flavor of failure — compile error, runtime error, time limit exceeded, etc. Full table:
    // https://github.com/judge0/judge0/blob/master/docs/api/statuses.md
    const statusId = response.status?.id;

    if (statusId === 6) {
      // Compile Error
      return {
        input,
        expectedOutput,
        actualOutput: '',
        passed: false,
        stderr: `COMPILE_ERROR:${response.compile_output ?? 'Unknown compile error'}`
      };
    }

    if (statusId === 5) {
      // Time Limit Exceeded
      return { input, expectedOutput, actualOutput: '', passed: false, timedOut: true };
    }

    if (statusId !== 3) {
      // Runtime error, memory limit exceeded, internal error, etc.
      return {
        input,
        expectedOutput,
        actualOutput: '',
        passed: false,
        stderr: response.stderr ?? response.message ?? response.status?.description ?? 'Execution failed'
      };
    }

    const actualOutput = normalizeOutput(response.stdout ?? '');
    const expected = normalizeOutput(expectedOutput);

    return {
      input,
      expectedOutput,
      actualOutput,
      passed: actualOutput === expected
    };
  }
}

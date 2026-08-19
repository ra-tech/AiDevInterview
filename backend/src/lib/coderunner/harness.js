/**
 * Judge0 (and most sandboxed execution services) runs whole programs via
 * stdin/stdout — it has no concept of "call this one function and grab its
 * return value." Our coding challenges, on the other hand, are LeetCode-style
 * function stubs (`function firstNonRepeating(s) { ... }`), matching what
 * the spec's example ("Implement a function that returns...") describes.
 *
 * This module bridges the two: given the candidate's submitted code, the
 * challenge's function_name, and one test case's `input` (a literal,
 * language-syntax argument list — see the coding-challenge generation
 * prompt, which requires the model to produce inputs in exactly this
 * shape), it produces a complete program that calls the function and
 * prints its return value in a normalized textual form, so a plain string
 * comparison against `expectedOutput` (also normalized) is a valid check.
 *
 * Deliberately scoped: fully implemented for JavaScript, TypeScript, and
 * Python, since those are interpreted and the harness is a straightforward
 * source-level wrap. Java and C++ need a compiled harness that correctly
 * parses arbitrary literal argument text into typed values, which is a
 * meaningfully bigger project — buildHarness() throws a clear, honest
 * error for those rather than shipping something that silently gets edge
 * cases wrong. See the README "Known limitations" note.
 */

const HARNESS_SUPPORTED_LANGUAGES = ['javascript', 'typescript', 'python'];

export function isHarnessSupported(language) {
  return HARNESS_SUPPORTED_LANGUAGES.includes(language);
}

export function buildHarness(language, code, functionName, input) {
  switch (language) {
    case 'javascript':
    case 'typescript':
      // Print with JSON.stringify so arrays/objects/strings all normalize the same way on
      // both sides of the comparison (see normalizeOutput below, which strips the quotes
      // JSON.stringify puts around a plain string result to match the prompt's convention).
      return `${code}\n\ntry {\n  const __result = ${functionName}(${input});\n  console.log(JSON.stringify(__result === undefined ? null : __result));\n} catch (__err) {\n  console.error(String(__err && __err.stack ? __err.stack : __err));\n  process.exit(1);\n}`;

    case 'python':
      return [
        code,
        '',
        'import json, sys, traceback',
        'try:',
        `    __result = ${functionName}(${input})`,
        '    print(json.dumps(__result))',
        'except Exception:',
        '    traceback.print_exc(file=sys.stderr)',
        '    sys.exit(1)'
      ].join('\n');

    default:
      throw new Error(
        `No execution harness for language "${language}". Currently supported: ${HARNESS_SUPPORTED_LANGUAGES.join(', ')}. ` +
          `Java/C++ need a compiled, type-aware argument parser not yet implemented here — see harness.js.`
      );
  }
}

/**
 * Normalizes a harness's raw stdout for comparison against expectedOutput.
 * The coding-challenge prompt asks the model for expectedOutput as the
 * "JSON-stringified return value with surrounding quotes stripped for
 * plain strings" — so a returned string "l" is written as the bare text
 * l, while a returned array [1,2] is written as [1,2]. This function
 * applies the same quote-stripping to the harness's actual stdout so the
 * two sides are comparable with a plain string equality check.
 */
export function normalizeOutput(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'string') return parsed;
    } catch {
      // fall through — not valid JSON, compare as-is
    }
  }
  return trimmed;
}

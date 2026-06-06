export interface BashCleanResult {
  cleaned: string;
  originalChars: number;
  cleanedChars: number;
  removedLineCount: number;
  estimatedTokensSaved: number;
}

export interface BashCleanOptions {
  extraLinePatterns?: RegExp[];
  keepLines?: RegExp[];
  collapseDuplicates?: boolean;
}

const ANSI_REGEX = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const CARRIAGE_RETURN_PROGRESS = /\r(?!\n)/g;

const DEFAULT_NOISE_PATTERNS: RegExp[] = [
  /^npm warn /i,
  /^npm WARN /,
  /^npm notice/i,
  /^npm http /i,
  /^npm info /i,
  /^npm verb /i,
  /^npm timing /i,
  /^npm sill /i,
  /^npm fund/i,
  /^npm audit report/i,
  /^added \d+ packages? in /i,
  /^changed \d+ packages? in /i,
  /^removed \d+ packages? in /i,
  /^\s*\d+ vulnerabilit(y|ies)/i,
  /^\s*found \d+ vulnerabilit/i,
  /^Downloading from /,
  /^Downloaded from /,
  /^Progress \(\d+\):/,
  /^\d+%\s*\[=*>?\s*\]/,
  /^<=*[- ]+=*>?\s*\d+%/,
  /^Resolving dependencies\.\.\./i,
  /^Fetching .+\.\.\./i,
  /^warning .+ is deprecated/i,
  /^Note: .* deprecated/,
  /^Picked up _JAVA_OPTIONS:/,
  /^Picked up JAVA_TOOL_OPTIONS:/,
  /^WARNING: An illegal reflective access operation/,
  /^WARNING: Please consider reporting this/,
  /^WARNING: Use --illegal-access=warn/,
  /^WARNING: All illegal access operations/,
  /^Note: .* uses or overrides a deprecated API/,
  /^Note: Recompile with -Xlint:deprecation/,
  /^Note: Some input files use unchecked or unsafe operations/,
  /^Note: Recompile with -Xlint:unchecked/,
  /^OpenJDK 64-Bit Server VM warning:/,
  /^debugger listening on /i,
  /^For help, see: https?:\/\//,
];

export function cleanBashOutput(output: string, opts?: BashCleanOptions): BashCleanResult {
  const originalChars = output.length;

  // 1. Strip ANSI escape sequences
  let cleaned = output.replace(ANSI_REGEX, '');

  // 2. Collapse \r-based progress updates: keep only the final segment of each line
  cleaned = cleaned
    .split('\n')
    .map((line) => {
      if (!line.includes('\r')) return line;
      const segments = line.split(CARRIAGE_RETURN_PROGRESS);
      return segments[segments.length - 1] ?? '';
    })
    .join('\n');

  const lines = cleaned.split('\n');
  const noisePatterns = [...DEFAULT_NOISE_PATTERNS, ...(opts?.extraLinePatterns ?? [])];
  const keepPatterns = opts?.keepLines ?? [];
  const collapseDuplicates = opts?.collapseDuplicates ?? true;

  const kept: string[] = [];
  let removed = 0;
  let lastLine: string | undefined;

  for (const raw of lines) {
    const line = raw;
    if (keepPatterns.some((p) => p.test(line))) {
      pushKept(line);
      continue;
    }
    if (noisePatterns.some((p) => p.test(line))) {
      removed += 1;
      continue;
    }
    pushKept(line);
  }

  function pushKept(line: string): void {
    if (collapseDuplicates && line.trim() !== '' && line === lastLine) {
      removed += 1;
      return;
    }
    kept.push(line);
    lastLine = line;
  }

  // 3. Trim leading/trailing blank lines
  while (kept.length && kept[0]?.trim() === '') kept.shift();
  while (kept.length && kept[kept.length - 1]?.trim() === '') kept.pop();

  const finalText = kept.join('\n');
  const cleanedChars = finalText.length;
  const estimatedTokensSaved = Math.max(0, Math.ceil((originalChars - cleanedChars) / 4));

  return {
    cleaned: finalText,
    originalChars,
    cleanedChars,
    removedLineCount: removed,
    estimatedTokensSaved,
  };
}

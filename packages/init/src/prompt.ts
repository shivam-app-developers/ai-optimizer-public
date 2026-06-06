import { createInterface } from 'node:readline/promises';

export interface PromptOptions {
  /** Default answer if the user just hits enter. */
  defaultYes?: boolean;
  /** Skip the prompt entirely (used by --yes / --no flags). */
  preset?: boolean;
}

/**
 * readline-based Y/n confirmation. Pass `preset` to skip interaction
 * (the CLI passes true for --yes, false for --no).
 */
export async function confirm(question: string, opts: PromptOptions = {}): Promise<boolean> {
  if (opts.preset !== undefined) return opts.preset;
  if (!process.stdin.isTTY) return Boolean(opts.defaultYes);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const suffix = opts.defaultYes ? ' [Y/n] ' : ' [y/N] ';
    const answer = (await rl.question(question + suffix)).trim().toLowerCase();
    if (answer === '') return Boolean(opts.defaultYes);
    return answer === 'y' || answer === 'yes';
  } finally {
    rl.close();
  }
}

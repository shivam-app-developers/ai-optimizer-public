#!/usr/bin/env node
import('../dist/cli.js')
  .then((m) => m.main(process.argv.slice(2)))
  .catch((err) => {
    process.stderr.write(`[ai-optimizer-import-context-mode] fatal: ${err?.stack ?? err}\n`);
    process.exit(1);
  });

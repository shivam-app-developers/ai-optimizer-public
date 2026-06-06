#!/usr/bin/env node
import { main } from '../dist/cli.js';

main().catch((err) => {
  process.stderr.write(`[ai-optimizer] ${err?.stack ?? err}\n`);
  process.exit(1);
});

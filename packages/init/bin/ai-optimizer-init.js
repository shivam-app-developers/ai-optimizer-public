#!/usr/bin/env node
import('../dist/cli.js')
  .then((m) => m.main())
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });

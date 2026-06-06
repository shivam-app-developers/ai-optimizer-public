#!/usr/bin/env node
// Minimal LSP-like stdio server used in tests. Speaks Content-Length framing.
// On didOpen of a *.fake file, publishes 2 diagnostics on lines 5 and 12.

import process from 'node:process';

let buffer = Buffer.alloc(0);

function write(message) {
  const body = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(body, 'utf-8')}\r\n\r\n`;
  process.stdout.write(header + body);
}

function publishDiagnostics(uri) {
  write({
    jsonrpc: '2.0',
    method: 'textDocument/publishDiagnostics',
    params: {
      uri,
      diagnostics: [
        {
          range: {
            start: { line: 4, character: 2 },
            end: { line: 4, character: 10 },
          },
          severity: 1,
          message: 'Undefined name "foo"',
          source: 'fake-lsp',
          code: 'F401',
        },
        {
          range: {
            start: { line: 11, character: 0 },
            end: { line: 11, character: 5 },
          },
          severity: 2,
          message: 'Unused variable',
          source: 'fake-lsp',
        },
      ],
    },
  });
}

function dispatch(msg) {
  if (msg.method === 'initialize') {
    write({ jsonrpc: '2.0', id: msg.id, result: { capabilities: {} } });
  } else if (msg.method === 'initialized') {
    // no-op
  } else if (msg.method === 'textDocument/didOpen') {
    setImmediate(() => publishDiagnostics(msg.params.textDocument.uri));
  } else if (msg.method === 'textDocument/didChange') {
    setImmediate(() => publishDiagnostics(msg.params.textDocument.uri));
  } else if (msg.method === 'shutdown') {
    write({ jsonrpc: '2.0', id: msg.id, result: null });
  } else if (msg.method === 'exit') {
    process.exit(0);
  }
}

process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString('utf-8');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const len = Number(match[1]);
    const total = headerEnd + 4 + len;
    if (buffer.length < total) return;
    const body = buffer.slice(headerEnd + 4, total).toString('utf-8');
    buffer = buffer.slice(total);
    try {
      dispatch(JSON.parse(body));
    } catch {
      // ignore
    }
  }
});

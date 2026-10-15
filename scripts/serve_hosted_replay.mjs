// Local HTTP adapter for checking the same handler used by the Vercel function.
import { createServer } from 'node:http';
import { handle } from '../apps/web/deployment/replay.mjs';
const port = Number(process.argv[2] ?? 8001);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
createServer(async (req, res) => {
  try {
    const response = await handle(new Request('http://127.0.0.1:' + port + req.url, { method: req.method }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { code: 'replay_failed', message: 'Replay could not be served.', retryable: false } }));
  }
}).listen(port, '127.0.0.1', () => console.log('Synthetic replay listening on ' + port));

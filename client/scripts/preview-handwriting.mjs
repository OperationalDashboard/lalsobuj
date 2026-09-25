// Loopback-only development preview. Explicit image path is served in memory;
// never copied into public/dist, uploaded to a provider, or stored in the repo.
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const sample = process.argv[2] ? await readFile(resolve(process.argv[2])) : null;
const server = await createServer({
  server: { host: '127.0.0.1', port: 5187, strictPort: true, proxy: {} },
  plugins: [{ name: 'local-handwriting-sample', configureServer(server) {
    server.middlewares.use('/__handwriting_test_sheet', (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      if (!sample) { res.statusCode = 404; res.end('No sample configured'); return; }
      res.setHeader('Content-Type', 'image/jpeg'); res.end(sample);
    });
  } }],
});
await server.listen();
console.log('Local test page: http://127.0.0.1:5187/handwriting-preview.html');

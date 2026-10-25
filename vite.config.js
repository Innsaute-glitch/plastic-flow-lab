import { defineConfig } from 'vite';

// Dev: mount the API middleware (server/api.js, owned by Task 2) inside Vite,
// so `npm run dev` is a single process. Prod: server/index.js serves dist/ + API.
export default defineConfig({
  server: { port: 5173 },
  plugins: [
    {
      name: 'api-middleware',
      async configureServer(server) {
        try {
          const { handleApi } = await import('./server/api.js');
          server.middlewares.use((req, res, next) =>
            req.url.startsWith('/api/') ? handleApi(req, res, next) : next()
          );
        } catch (err) {
          console.warn('[server] api middleware not loaded:', err.message);
        }
      },
    },
  ],
});

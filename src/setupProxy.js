const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // SSE endpoints need special proxy config: no timeouts, no buffering
  const sseRoutes = [
    '/api/reporting-stream',
    '/api/home-metrics',
    '/api/ccl-date',
    '/api/enquiries-unified/stream',
    '/api/logs/stream',
  ];

  app.use(
    sseRoutes,
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      ws: false,
      timeout: 0,
      proxyTimeout: 0,
      selfHandleResponse: false,
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader('Cache-Control', 'no-cache, no-transform');
        proxyReq.setHeader('Connection', 'keep-alive');
      },
      onProxyRes: (proxyRes) => {
        try {
          proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          proxyRes.headers['x-accel-buffering'] = 'no';
          delete proxyRes.headers['content-length'];
        } catch { /* ignore */ }
      },
      onError: (err, req, res) => {
        console.error(`SSE proxy error for ${req.url}:`, err.message);
        try { res.writeHead(502); res.end('SSE proxy error'); } catch { /* ignore */ }
      },
    })
  );

  // Everything → Express server on port 8080
  // (Azure Functions on 7072 phased out — all routes migrated to Express)
  app.use(
    ['/api', '/ccls'],
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      ws: false,
      timeout: 0,
      proxyTimeout: 0,
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url}:`, err.message);
        try { res.writeHead(502); res.end('Proxy error'); } catch { /* ignore */ }
      },
    })
  );
};

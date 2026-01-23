const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Dedicated SSE proxy first to ensure correct behavior for streaming endpoints
  app.use(
    '/api/reporting-stream',
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
        // Ensure proxies and browsers don't buffer SSE
        try {
          proxyRes.headers['cache-control'] = 'no-cache, no-transform';
          proxyRes.headers['x-accel-buffering'] = 'no';
          // Remove content-length if any (SSE is streamed)
          delete proxyRes.headers['content-length'];
        } catch { /* ignore */ }
      },
      onError: (err, req, res) => {
        console.error(`SSE proxy error for ${req.url}:`, err.message);
        // Do NOT fallback to other backends for SSE
        try { res.writeHead(502); res.end('SSE proxy error'); } catch { /* ignore */ }
      },
    })
  );
  // Dedicated SSE proxy for home metrics streaming
  app.use(
    '/api/home-metrics',
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

  // Dedicated SSE proxy for CCL Date streaming
  app.use(
    '/api/ccl-date',
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

  // Dedicated SSE proxy for enquiries streaming
  app.use(
    '/api/enquiries-unified/stream',
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
  // Routes that go to the Express server (port 8080)
  const expressRoutes = [
    '/api/matters',
    // unified endpoints
    '/api/matters-unified',
    '/api/enquiries-unified',
    '/api/enquiries',
    '/api/clio-contacts',
    '/api/clio-matters',
    '/api/keys',
    '/api/refresh',
    '/api/matter-requests',
    '/api/opponents',
    '/api/risk-assessments',
    '/api/bundle',
    '/api/ccl',
    '/api/enquiry-emails',
    '/api/pitches',
    '/api/documents',
    '/api/demo-documents',
    '/api/instructions',
    '/api/verify-id',
    '/api/sendEmail', // Centralized server email route
    '/api/attendance', // Attendance routes with annual leave integration
    '/api/rate-changes',
    '/api/ccl-date',
  '/api/reporting-stream', // Streaming datasets endpoint
  '/api/home-metrics',     // Home metrics SSE endpoint
  '/api/home-wip',         // Standalone WIP metrics endpoint
  '/api/home-enquiries',   // Standalone enquiry metrics endpoint
    '/ccls'
  ];

  // Azure Functions routes (port 7072 - api folder TypeScript functions)
  const azureFunctionRoutes = [
    '/getSnippetEdits',
    '/getWIPClio',
    '/getRecovered',
    '/getPOID6Years',
    '/getFutureBookings',
    '/getTransactions',
    '/getOutstandingClientBalances',
    '/getSnippetBlocks',
    '/insertAttendance',
    '/insertNotableCaseInfo',
    '/insertDeal'  // Added for deal capture
  ];

  // Decoupled Azure Functions routes - REMOVED (folder deleted Dec 2024)
  // Port 7071 no longer used

  // Pre-create fallback proxies to avoid adding new listeners per error
  const fallbackToFunctions = createProxyMiddleware({
    target: 'http://localhost:7072',
    changeOrigin: true,
    onProxyRes: (proxyRes, req, res) => {
      try { res.setHeader('x-dev-proxy-target', 'functions-7072'); } catch { /* ignore */ }
    }
  });
  const fallbackToExpress = createProxyMiddleware({
    target: 'http://localhost:8080',
    changeOrigin: true,
    onProxyRes: (proxyRes, req, res) => {
      try { res.setHeader('x-dev-proxy-target', 'express-8080'); } catch { /* ignore */ }
    }
  });

  // Proxy Express server routes to port 8080
  app.use(
    expressRoutes,
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      ws: false,
      timeout: 0,       // Do not timeout HTTP requests (SSE)
      proxyTimeout: 0,  // Do not timeout proxy connections
      onProxyRes: (proxyRes, req, res) => {
        try { res.setHeader('x-dev-proxy-target', 'express-8080'); } catch { /* ignore */ }
      },
      onProxyReq: (proxyReq, req, res) => {
        // Ensure proxies do not transform SSE responses
        if (req.url.startsWith('/api/reporting-stream')) {
          proxyReq.setHeader('Cache-Control', 'no-cache, no-transform');
        }
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Express server):`, err.message);
        // Fallback to Azure Functions if Express server fails
        console.log('Attempting fallback to Azure Functions...');
        fallbackToFunctions(req, res);
      }
    })
  );

  // Proxy Azure Functions routes to port 7072 (api folder)
  app.use(
    azureFunctionRoutes,
    createProxyMiddleware({
      target: 'http://localhost:7072',
      changeOrigin: true,
      pathRewrite: {
        '^/(.*)': '/api/$1', // Rewrite /getAttendance to /api/getAttendance
      },
      onProxyRes: (proxyRes, req, res) => {
        try { res.setHeader('x-dev-proxy-target', 'functions-7072'); } catch { /* ignore */ }
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Azure Functions):`, err.message);
        // Fallback to Express server if Azure Functions fails
        console.log('Attempting fallback to Express server...');
        fallbackToExpress(req, res);
      }
    })
  );

  // Catch-all for any other /api routes - try Express server first, then Azure Functions
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      onProxyRes: (proxyRes, req, res) => {
        try { res.setHeader('x-dev-proxy-target', 'express-8080'); } catch { /* ignore */ }
      },
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Express server):`, err.message);
        console.log('Attempting fallback to Azure Functions...');
        fallbackToFunctions(req, res);
      }
    })
  );
};

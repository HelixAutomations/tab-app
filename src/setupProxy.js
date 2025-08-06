const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  // Routes that go to the Express server (port 8080)
  const expressRoutes = [
    '/api/getMatters',
    '/api/matters',
    '/api/getAllMatters',
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
    '/ccls'
  ];

  // Azure Functions routes (port 7071)
  const azureFunctionRoutes = [
    '/getSnippetEdits',
    '/getAttendance',
    '/getWIPClio',
    '/getRecovered',
    '/getPOID6Years',
    '/getFutureBookings',
    '/getTransactions',
    '/getOutstandingClientBalances',
    '/getSnippetBlocks',
    '/getAnnualLeave'
  ];

  // Proxy Express server routes to port 8080
  app.use(
    expressRoutes,
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Express server):`, err.message);
        // Fallback to Azure Functions if Express server fails
        console.log('Attempting fallback to Azure Functions...');
        const fallbackProxy = createProxyMiddleware({
          target: 'http://localhost:7071',
          changeOrigin: true,
        });
        fallbackProxy(req, res);
      }
    })
  );

  // Proxy Azure Functions routes to port 7071
  app.use(
    azureFunctionRoutes,
    createProxyMiddleware({
      target: 'http://localhost:7071',
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Azure Functions):`, err.message);
        // Fallback to Express server if Azure Functions fails
        console.log('Attempting fallback to Express server...');
        const fallbackProxy = createProxyMiddleware({
          target: 'http://localhost:8080',
          changeOrigin: true,
        });
        fallbackProxy(req, res);
      }
    })
  );

  // Catch-all for any other /api routes - try Express server first, then Azure Functions
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:8080',
      changeOrigin: true,
      onError: (err, req, res) => {
        console.error(`Proxy error for ${req.url} (Express server):`, err.message);
        console.log('Attempting fallback to Azure Functions...');
        const fallbackProxy = createProxyMiddleware({
          target: 'http://localhost:7071',
          changeOrigin: true,
        });
        fallbackProxy(req, res);
      }
    })
  );
};

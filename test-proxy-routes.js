// Test script to verify proxy routes are working
const fetch = require('node-fetch');

async function testProxyRoutes() {
    const baseUrl = 'http://localhost:8080';
    
    const testRoutes = [
        { path: '/api/matters', method: 'GET' },
        { path: '/getSnippetEdits', method: 'GET' },
        { path: '/api/getMatters', method: 'POST' },
        { path: '/getFutureBookings', method: 'GET' },
        { path: '/getTransactions', method: 'GET' }
    ];
    
    console.log('Testing proxy routes...\n');
    
    for (const route of testRoutes) {
        try {
            const response = await fetch(`${baseUrl}${route.path}`, {
                method: route.method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: route.method === 'POST' ? JSON.stringify({}) : undefined
            });
            
            console.log(`${route.method} ${route.path}: ${response.status} ${response.statusText}`);
            
        } catch (error) {
            console.log(`${route.method} ${route.path}: ERROR - ${error.message}`);
        }
    }
}

// Run test if file is executed directly
if (require.main === module) {
    testProxyRoutes();
}

module.exports = testProxyRoutes;

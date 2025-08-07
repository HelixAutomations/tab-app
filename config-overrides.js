const path = require('path');

module.exports = function override(config, env) {
  // Reduce HMR noise in development
  if (env === 'development') {
    config.devServer = {
      ...config.devServer,
      hot: true,
      liveReload: false,
      // Reduce polling frequency
      watchOptions: {
        poll: 2000, // Check for changes every 2 seconds instead of constantly
        aggregateTimeout: 300,
        ignored: /node_modules/
      }
    };
  }
  
  return config;
};

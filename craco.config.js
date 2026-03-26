const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = {
  webpack: {
    configure: (config) => {
      config.module.rules.push({
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      });

      if (process.env.ANALYZE === 'true') {
        config.plugins.push(new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: 'bundle-report.html',
          openAnalyzer: true,
        }));
      }

      return config;
    }
  }
};

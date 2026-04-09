const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  eslint: {
    enable: !isDev, // skip ESLint during dev — saves ~30-60s per rebuild
  },
  webpack: {
    configure: (config) => {
      config.module.rules.push({
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      });

      // Split vendor code into separate chunks for better caching.
      // Vendor bundles rarely change, so browsers keep them cached across deploys.
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          ...config.optimization?.splitChunks,
          chunks: 'all',
          cacheGroups: {
            ...(config.optimization?.splitChunks?.cacheGroups || {}),
            fluentui: {
              test: /[\\/]node_modules[\\/]@fluentui[\\/]/,
              name: 'vendor-fluentui',
              chunks: 'all',
              priority: 20,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendor',
              chunks: 'all',
              priority: 10,
            },
          },
        },
      };

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

const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  eslint: {
    enable: !isDev, // skip ESLint during dev — saves ~30-60s per rebuild
  },
  webpack: {
    configure: (config) => {
      // In dev, remove ForkTsCheckerWebpackPlugin — the IDE handles type checking
      // and the plugin can delay webpack-dev-server responses.
      if (isDev) {
        config.plugins = config.plugins.filter(
          (p) => !p.constructor.name.includes('ForkTsChecker')
        );

        // Persistent filesystem cache. Cold-start rebuild times drop
        // dramatically (often 10x) after the first build because webpack
        // skips re-parsing unchanged modules. Cache invalidates when this
        // file changes (buildDependencies). Stored under node_modules/.cache.
        config.cache = {
          type: 'filesystem',
          buildDependencies: { config: [__filename] },
          name: 'helix-hub-dev',
        };

        // Faster source maps for dev. CRA's default `cheap-module-source-map`
        // is heavier than necessary for in-browser debugging — `eval-cheap-
        // module-source-map` builds and rebuilds significantly faster while
        // still mapping back to original TypeScript at the line level.
        config.devtool = 'eval-cheap-module-source-map';
      }

      config.module.rules.push({
        test: /\.m?js/,
        resolve: {
          fullySpecified: false
        }
      });

      // Split vendor code into separate chunks for better caching.
      // Only in production — CRA dev uses a single 'bundle.js' filename
      // that collides with named chunks (causes "Multiple chunks emit to same filename" error).
      if (!isDev) {
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
      }

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

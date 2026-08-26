import esbuild from 'esbuild';

const options = {
  bundle: true,
  entryPoints: ['src/extension.ts'],
  external: ['vscode'],
  format: 'cjs',
  outfile: 'dist/extension.js',
  platform: 'node',
  sourcemap: true,
  target: 'node20',
};

if (process.argv.includes('--watch')) {
  const watchReporter = {
    name: 'watch-reporter',
    setup(build) {
      build.onStart(() => {
        console.log('[watch] build started');
      });
      build.onEnd(() => {
        console.log('[watch] build finished');
      });
    },
  };
  const context = await esbuild.context({ ...options, plugins: [watchReporter] });
  await context.watch();
} else {
  await esbuild.build(options);
}

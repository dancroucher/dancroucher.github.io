import esbuild from 'esbuild';

const builds = [
  { entryPoints: ['src/tapes/index.tsx'], outfile: 'public/dist/tapes.js' },
  { entryPoints: ['src/mixtape/index.tsx'], outfile: 'public/dist/mixtape.js' },
];

const ctxs = await Promise.all(
  builds.map(cfg =>
    esbuild.context({
      ...cfg,
      bundle: true,
      format: 'esm',
      target: 'es2020',
      minify: false,
      sourcemap: false,
      jsx: 'automatic',
      jsxImportSource: 'react',
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'info',
    })
  )
);

await Promise.all(ctxs.map(c => c.watch()));
console.log('Watching src/tapes and src/mixtape for changes...');

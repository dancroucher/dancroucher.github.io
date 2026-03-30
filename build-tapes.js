import esbuild from 'esbuild';

const builds = [
  {
    entryPoints: ['src/tapes/index.tsx'],
    outfile: 'public/dist/tapes.js',
  },
  {
    entryPoints: ['src/mixtape/index.tsx'],
    outfile: 'public/dist/mixtape.js',
  },
];

await Promise.all(
  builds.map(cfg =>
    esbuild.build({
      ...cfg,
      bundle: true,
      format: 'esm',
      target: 'es2020',
      minify: false,
      sourcemap: false,
      jsx: 'automatic',
      jsxImportSource: 'react',
      define: {
        'process.env.NODE_ENV': '"production"',
      },
    })
  )
);

console.log('Tapes bundle built → public/dist/tapes.js');
console.log('Mixtape bundle built → public/dist/mixtape.js');

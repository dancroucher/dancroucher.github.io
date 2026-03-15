import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/tapes/index.tsx'],
  bundle: true,
  outfile: 'public/dist/tapes.js',
  format: 'esm',
  target: 'es2020',
  minify: true,
  sourcemap: false,
  jsx: 'automatic',
  jsxImportSource: 'react',
  define: {
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('Tapes bundle built → public/dist/tapes.js');

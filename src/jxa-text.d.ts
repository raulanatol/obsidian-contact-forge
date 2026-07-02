// esbuild loads .js under contacts/jxa as raw text; declare that for TS.
declare module '*.js' {
  const src: string;
  export default src;
}

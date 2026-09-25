// pdf-parse v1's top-level index.js runs a self-test that reads a bundled
// sample PDF — that fs.readFileSync path breaks inside Vercel's serverless
// bundle. Importing from the deep path skips the self-test but @types/pdf-parse
// only declares the top-level module, hence this tiny shim.
declare module 'pdf-parse/lib/pdf-parse.js' {
  const parse: (buffer: Buffer) => Promise<{ text: string }>;
  export default parse;
}

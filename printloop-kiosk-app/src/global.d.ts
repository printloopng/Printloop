declare module 'ipp' {
  interface Printer {
    execute(operation: string, msg: any, cb: (err: unknown, res: any) => void): void;
  }

  function Printer(uri: string, opts?: Record<string, unknown>): Printer;

  export { Printer };
  export default { Printer };
}

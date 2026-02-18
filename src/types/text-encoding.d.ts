declare module 'text-encoding' {
  export class TextDecoder {
    constructor(label?: string, options?: { fatal?: boolean });
    decode(input?: BufferSource): string;
  }
  export class TextEncoder {
    constructor();
    encode(input?: string): Uint8Array;
  }
}

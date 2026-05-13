declare module "@usebruno/lang" {
  // Package ships without types; shape varies by .bru content.
  export function bruToJsonV2(content: string): any
  export function collectionBruToJson(content: string): any
}

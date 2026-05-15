declare module "@usebruno/lang" {
  type BrunoObject = Record<string, unknown>
  interface BrunoText {
    trim(): BrunoText
    split(separator: string | RegExp): [string, ...string[]]
  }

  interface BrunoHttpSection extends BrunoObject {
    method?: string
    url?: string
  }

  interface BrunoBodySection extends BrunoObject {
    json?: string
  }

  interface BrunoExampleResponse extends BrunoObject {
    status?: { code?: string | number; text?: string } & BrunoObject
    body?: { content?: string } & BrunoObject
  }

  interface BrunoExample extends BrunoObject {
    response?: BrunoExampleResponse
  }

  interface BrunoRequestJson extends BrunoObject {
    meta?: BrunoObject
    http?: BrunoHttpSection
    grpc?: BrunoObject
    ws?: BrunoObject
    params?: BrunoObject[]
    headers?: BrunoObject[]
    metadata?: BrunoObject[]
    auth?: BrunoObject
    body?: BrunoBodySection
    vars?: BrunoObject
    assertions?: BrunoObject[]
    script?: BrunoObject
    tests?: string
    settings?: BrunoObject
    docs?: BrunoText
    examples: [BrunoExample, ...BrunoExample[]]
  }

  interface BrunoCollectionJson extends BrunoObject {
    meta?: BrunoObject
    query?: BrunoObject[]
    headers?: BrunoObject[]
    auth?: BrunoObject
    vars?: BrunoObject
    script?: BrunoObject
    tests?: string
    docs?: string
  }

  interface BrunoEnvJson extends BrunoObject {
    variables?: BrunoObject[]
    color?: string
  }

  export function bruToJsonV2(content: string): BrunoRequestJson
  export function jsonToBruV2(jsonData: BrunoObject): string

  export function bruToEnvJsonV2(content: string): BrunoEnvJson
  export function envJsonToBruV2(jsonData: BrunoObject): string

  export function collectionBruToJson(content: string): BrunoCollectionJson
  export function jsonToCollectionBru(jsonData: BrunoObject): string

  export function dotenvToJson(content: string): Record<string, string>
}

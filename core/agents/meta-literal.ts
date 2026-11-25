// The `export const meta = {...}` at the top of a Claude Code Workflow script, read as data. The
// Workflow tool requires it to be a pure literal, so a small parser covers it and nothing in the
// script runs: objects, arrays, quoted strings (a template string without ${}), numbers, true,
// false, null, bare keys, trailing commas and comments.

type Value =
  string | number | boolean | null | Value[] | { [key: string]: Value }

class LiteralError extends Error {}

function parseLiteral(text: string, start: number): Value {
  let at = start

  const fail = (what: string): never => {
    throw new LiteralError(`${what} at character ${at}`)
  }

  const skip = () => {
    for (;;) {
      while (at < text.length && /\s/.test(text[at])) at++
      if (text.startsWith('//', at)) {
        const end = text.indexOf('\n', at)
        at = end === -1 ? text.length : end
      } else if (text.startsWith('/*', at)) {
        const end = text.indexOf('*/', at + 2)
        if (end === -1) fail('an unclosed comment')
        at = end + 2
      } else return
    }
  }

  const string = (): string => {
    const quote = text[at++]
    let out = ''
    while (at < text.length && text[at] !== quote) {
      const char = text[at++]
      if (quote === '`' && char === '$' && text[at] === '{') {
        fail('a template string with ${}')
      }
      if (char !== '\\') {
        out += char
        continue
      }
      const escaped = text[at++]
      const simple: Record<string, string> = {
        n: '\n',
        t: '\t',
        r: '\r',
        b: '\b',
        f: '\f',
        v: '\v',
        '0': '\0',
      }
      if (escaped === 'u') {
        const hex = /^[0-9a-fA-F]{4}/.exec(text.slice(at))
        if (hex === null) fail('a bad \\u escape')
        out += String.fromCharCode(parseInt(hex![0], 16))
        at += 4
      } else if (escaped === '\n') {
        // A line continuation.
      } else out += simple[escaped] ?? escaped
    }
    if (text[at] !== quote) fail('an unclosed string')
    at++
    return out
  }

  const value = (): Value => {
    skip()
    const char = text[at]
    if (char === '{') {
      at++
      const object: Record<string, Value> = {}
      for (;;) {
        skip()
        if (text[at] === '}') {
          at++
          return object
        }
        let key: string
        if (text[at] === '"' || text[at] === "'") key = string()
        else {
          const bare = /^[A-Za-z_$][\w$]*/.exec(text.slice(at))
          if (bare === null) return fail('a key')
          key = bare[0]
          at += key.length
        }
        skip()
        if (text[at] !== ':') fail('a missing :')
        at++
        object[key] = value()
        skip()
        if (text[at] === ',') at++
        else if (text[at] !== '}') fail('a missing , or }')
      }
    }
    if (char === '[') {
      at++
      const array: Value[] = []
      for (;;) {
        skip()
        if (text[at] === ']') {
          at++
          return array
        }
        array.push(value())
        skip()
        if (text[at] === ',') at++
        else if (text[at] !== ']') fail('a missing , or ]')
      }
    }
    if (char === '"' || char === "'" || char === '`') return string()
    const word = /^(true|false|null|-?\d+(\.\d+)?)\b/.exec(text.slice(at))
    if (word === null) return fail('something other than a literal')
    at += word[0].length
    if (word[0] === 'true') return true
    if (word[0] === 'false') return false
    if (word[0] === 'null') return null
    return Number(word[0])
  }

  return value()
}

// The meta object, or why it couldn't be read.
export function readMetaLiteral(
  script: string,
): Record<string, Value> | { problem: string } {
  const found = /^export\s+const\s+meta\s*=\s*/m.exec(script)
  if (found === null) return { problem: 'has no export const meta' }
  try {
    const meta = parseLiteral(script, found.index + found[0].length)
    return typeof meta === 'object' && meta !== null && !Array.isArray(meta)
      ? meta
      : { problem: "meta isn't an object" }
  } catch (error) {
    if (error instanceof LiteralError) {
      return { problem: `meta isn't a pure literal: ${error.message}` }
    }
    throw error
  }
}

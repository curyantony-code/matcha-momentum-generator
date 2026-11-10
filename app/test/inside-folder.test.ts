// Which files the reel-media: protocol serves and drag-out hands to the OS (main/inside-folder.ts).
import { describe, expect, it } from 'vitest'
import { isInsideFolder, isStrictlyInsideFolder } from '../src/main/inside-folder'

describe('isInsideFolder', () => {
  const root = 'C:\\Users\\Zoë\\Documents\\Matcha Momentum Generator'

  it('on Windows, accepts the same folder in any letter case or slash style, as NTFS does', () => {
    expect(isInsideFolder('c:\\users\\zoë\\documents\\matcha momentum generator\\Projects\\a\\export.mp4', root, 'win32')).toBe(true)
    expect(isInsideFolder('C:/Users/Zoë/Documents/Matcha Momentum Generator/Projects/a/export.mp4', root, 'win32')).toBe(true)
    expect(isInsideFolder('C:\\USERS\\ZOË\\DOCUMENTS\\MATCHA MOMENTUM GENERATOR', root, 'win32')).toBe(true)
  })

  it('on Windows, still refuses a sibling with the same prefix and a path that climbs out', () => {
    expect(isInsideFolder('C:\\Users\\Zoë\\Documents\\Matcha Momentum GeneratorEvil\\a.mp4', root, 'win32')).toBe(false)
    expect(isInsideFolder('c:\\users\\zoë\\documents\\matcha momentum generator evil\\a.mp4', root, 'win32')).toBe(false)
    expect(isInsideFolder('C:\\Users\\Zoë\\Documents\\Matcha Momentum Generator\\..\\secret.txt', root, 'win32')).toBe(false)
    expect(isInsideFolder('D:\\Users\\Zoë\\Documents\\Matcha Momentum Generator\\a.mp4', root, 'win32')).toBe(false)
  })

  it('elsewhere, letter case still counts', () => {
    expect(isInsideFolder('/Users/zoe/Matcha Momentum Generator/a.mp4', '/Users/zoe/Matcha Momentum Generator', 'darwin')).toBe(true)
    expect(isInsideFolder('/users/zoe/matcha momentum generator/a.mp4', '/Users/zoe/Matcha Momentum Generator', 'linux')).toBe(false)
    expect(isInsideFolder('/Users/zoe/Matcha Momentum Generator/../x', '/Users/zoe/Matcha Momentum Generator', 'linux')).toBe(false)
  })
})

describe('isStrictlyInsideFolder', () => {
  const root = 'C:\\Users\\Zoë\\Documents\\Matcha Momentum Generator'

  it('on Windows, refuses the root folder itself in any letter case, so drag-out never hands over the whole library', () => {
    expect(isStrictlyInsideFolder('c:\\users\\zoë\\documents\\matcha momentum generator', root, 'win32')).toBe(false)
    expect(isStrictlyInsideFolder('C:/Users/Zoë/Documents/Matcha Momentum Generator/', root, 'win32')).toBe(false)
    expect(isStrictlyInsideFolder('c:\\users\\zoë\\documents\\matcha momentum generator\\Projects\\a\\export.mp4', root, 'win32')).toBe(true)
  })
})

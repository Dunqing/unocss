import { createGenerator } from '@unocss/core'
import presetUno from '@unocss/preset-uno'
import { describe, expect, test } from 'vitest'

describe('refactor theme merge', () => {
  const uno = createGenerator({
    presets: [
      presetUno(),
      {
        name: 'preset-theme-test',
        theme: {
          colors: {},
        },
      },
    ],
  })

  test('config theme', async () => {
    expect(uno.config.theme).toMatchInlineSnapshot(`
      {
        "colors": {},
      }
    `)
  })

  const uno2 = createGenerator({
    presets: [
      presetUno(),
      {
        name: 'preset-theme-test',
        theme: {
          colors: {
            a: '1',
            b: '1',
          },
        },
        extendTheme(theme) {
          return {
            ...theme,
          }
        },
      },
      {
        name: 'preset-theme-test2',
        theme: {

        },
        extendTheme(theme) {
          return {
            ...theme,
            colors: {
              a: '2',
            },
          }
        },
      },
    ],
  })

  test('config theme2', async () => {
    expect(uno2.config.theme).toMatchInlineSnapshot(`
      {
        "colors": {
          "a": "2",
        },
      }
    `)
  })
})

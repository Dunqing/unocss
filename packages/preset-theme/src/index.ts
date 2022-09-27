import type { Preset } from '@unocss/core'
import { mergeDeep } from '@unocss/core'
import type { Theme } from '@unocss/preset-mini'

export interface PresetTheme {
  theme: Record<'dark' | 'light', Theme>
  /**
   * @default --un-preset-theme
   */
  prefix: string
}

const getThemeVal = (theme: any, keys: string[]) => {
  for (const key of keys) {
    theme = theme[key]
    if (theme === undefined)
      return
  }
  return theme
}

export const presetTheme = (options: PresetTheme): Preset<Theme> => {
  const { prefix = '--un-preset-theme' } = options
  const { dark, light } = options.theme
  const themeValues = new Map<string, {
    light?: string
    dark?: string
    original?: string
    var: string
  }>()
  const varsRE = new RegExp(`var\\((${prefix}.*)\\)`)
  const usedTheme: {
    light?: string | undefined
    dark?: string | undefined
    original?: string | undefined
    var: string
  }[] = []

  return {
    name: '@unocss/preset-theme',
    extendTheme(originalTheme) {
      const recursiveTheme = (theme: Record<string, any>, preKeys: string[] = []) => {
        Object.keys(theme).forEach((key) => {
          const val = Reflect.get(theme, key)
          const themeKeys = preKeys.concat(key)

          if (typeof val !== 'object' && !Array.isArray(val)) {
            const varName = `${prefix}-${themeKeys.join('-')}`

            theme[key] = `var(${varName})`
            themeValues.set(varName, {
              light: getThemeVal(light, themeKeys),
              dark: getThemeVal(dark, themeKeys),
              original: getThemeVal(originalTheme, themeKeys),
              var: varName,
            })
          }
          else {
            recursiveTheme(val, themeKeys)
          }
        })
        return theme
      }

      const theme = recursiveTheme(mergeDeep(dark, light))
      mergeDeep(originalTheme, theme)
    },
    preflights: [
      {
        layer: 'theme',
        async getCSS(context) {
          return (await context.generator.generate('')).css
        },
      },
    ],
    postprocess(util) {
      util.entries.forEach(([, val]) => {
        if (typeof val === 'string') {
          const varName = val.match(varsRE)?.[1]
          if (varName) {
            const values = themeValues.get(varName)
            if (values)
              usedTheme.push(values)
          }
        }
      })
    },
  }
}

export default presetTheme

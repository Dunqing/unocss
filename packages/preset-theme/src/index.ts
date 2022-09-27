import type { Preset } from '@unocss/core'
import { mergeDeep } from '@unocss/core'
import type { Theme } from '@unocss/preset-mini'

const PRESET_THEME_RULE = 'PRESET_THEME_RULE'

export interface PresetTheme {
  theme: Record<'dark' | 'light', Theme>
  /**
   * @default --un-preset-theme
   */
  prefix?: string
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
    name: string
  }>()
  const varsRE = new RegExp(`var\\((${prefix}.*)\\)`)
  const usedTheme: {
    light?: string | undefined
    dark?: string | undefined
    original?: string | undefined
    name: string
  }[] = []

  return {
    name: '@unocss/preset-theme',
    extendTheme(originalTheme) {
      const recursiveTheme = (theme: Record<string, any>, preKeys: string[] = []) => {
        Object.keys(theme).forEach((key) => {
          const val = Reflect.get(theme, key)
          const themeKeys = preKeys.concat(key)

          if (typeof val !== 'object' && !Array.isArray(val)) {
            const name = `${prefix}-${themeKeys.join('-')}`

            theme[key] = `var(${name})`
            themeValues.set(name, {
              light: getThemeVal(light, themeKeys),
              dark: getThemeVal(dark, themeKeys),
              original: getThemeVal(originalTheme, themeKeys),
              name,
            })
          }
          else {
            recursiveTheme(val, themeKeys)
          }
        })
        return theme
      }

      Object.assign(originalTheme, mergeDeep(originalTheme, recursiveTheme(mergeDeep(dark, light))))
    },
    rules: [
      [
        new RegExp(`^${PRESET_THEME_RULE}$`),
        (_, context) => {
          const isDark = Array.from(context.variantMatch[3].values()).some(({ name }) => {
            return name === 'dark'
          })
          return usedTheme.reduce((obj, e) => {
            return {
              ...obj,
              [e.name]: (isDark ? e.dark : e.light) ?? e.original,
            }
          }, {})
        },
      ],
    ],
    preflights: [
      {
        layer: 'theme',
        async getCSS(context) {
          const { css } = (await context.generator.generate(`${PRESET_THEME_RULE} dark:${PRESET_THEME_RULE}`, {
            preflights: false,
          }))

          const realCSS = css
            .replace(`.dark\\:${PRESET_THEME_RULE}`, '')
            .replace(`.${PRESET_THEME_RULE}`, 'root ')
            .replace(/\/\*.*layer.*\*\/\s*\n/, '')
          return realCSS
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

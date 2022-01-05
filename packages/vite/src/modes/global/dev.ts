import type { Plugin, ViteDevServer, ResolvedConfig as ViteResolvedConfig } from 'vite'
import type { UnocssPluginContext } from '../../../../plugins-common'
import { LAYER_MARK_ALL, getPath, resolveId } from '../../../../plugins-common'
import { READY_CALLBACK_DEFAULT } from './shared'

const WARN_TIMEOUT = 2000

export function GlobalModeDevPlugin({ uno, tokens, onInvalidate, extract, filter }: UnocssPluginContext): Plugin[] {
  const servers: ViteDevServer[] = []
  let base = ''
  let frontEndUrl: string | undefined

  const tasks: Promise<any>[] = []
  const entries = new Map<string, string>()

  let invalidateTimer: any
  let lastUpdate = Date.now()
  let lastServed = 0
  let resolved = false
  let resolvedWarnTimer: any

  function configResolved(config: ViteResolvedConfig) {
    base = config.base || ''
    if (base === '/')
      base = ''
    else if (base.endsWith('/'))
      base = base.slice(0, base.length - 1)

    // eslint-disable-next-line prefer-const
    let { host, port, https } = config.server
    if (!host || host === '0.0.0.0')
      host = 'localhost'
    if (!port)
      port = 3000
    frontEndUrl = `http${https ? 's' : ''}://${host ?? ''}:${port}`
  }

  function invalidate(timer = 10) {
    for (const server of servers) {
      for (const id of entries.keys()) {
        const mod = server.moduleGraph.getModuleById(id)
        if (!mod)
          continue
        server!.moduleGraph.invalidateModule(mod)
      }
    }
    clearTimeout(invalidateTimer)
    invalidateTimer = setTimeout(sendUpdate, timer)
  }

  function sendUpdate() {
    lastUpdate = Date.now()
    for (const server of servers) {
      server.ws.send({
        type: 'update',
        updates: Array.from(entries.keys()).map(i => ({
          acceptedPath: i,
          path: i,
          timestamp: lastUpdate,
          type: 'js-update',
        })),
      })
    }
  }

  function setWarnTimer() {
    if (!resolved && !resolvedWarnTimer) {
      resolvedWarnTimer = setTimeout(() => {
        if (!resolved) {
          const msg = '[unocss] entry module not found, have you add `import \'uno.css\'` in your main entry?'
          console.warn(msg)
          servers.forEach(({ ws }) => ws.send({
            type: 'error',
            err: { message: msg, stack: '' },
          }))
        }
      }, WARN_TIMEOUT)
    }
  }

  onInvalidate(invalidate)

  return [
    {
      name: 'unocss:global',
      apply: 'serve',
      enforce: 'pre',
      configResolved,
      async configureServer(_server) {
        servers.push(_server)
        _server.middlewares.use(async(req, res, next) => {
          let url = req.url
          if (url && base.length > 0 && url.startsWith(base))
            url = url.slice(base.length)

          setWarnTimer()
          if (url?.startsWith(READY_CALLBACK_DEFAULT)) {
            const servedTime = +url.slice(READY_CALLBACK_DEFAULT.length + 1)
            if (servedTime < lastUpdate)
              invalidate(0)
            res.statusCode = 200
            res.end()
          }
          else {
            return next()
          }
        })
      },
      transform(code, id) {
        if (filter(code, id))
          extract(code, id)
        return null
      },
      transformIndexHtml: {
        enforce: 'pre',
        transform(code, { filename }) {
          extract(code, filename)
        },
      },
      resolveId(id) {
        const entry = resolveId(id)
        if (entry) {
          resolved = true
          entries.set(entry.id, entry.layer)
          return entry.id
        }
      },
      async load(id) {
        const layer = entries.get(getPath(id))
        if (!layer)
          return null

        await Promise.all(tasks)
        const result = await uno.generate(tokens)
        lastServed = Date.now()
        return layer === LAYER_MARK_ALL
          ? result.getLayers(undefined, Array.from(entries.values()))
          : result.getLayer(layer)
      },
    },
    {
      name: 'unocss:global:post',
      configResolved,
      apply(config, env) {
        return env.command === 'serve' && !config.build?.ssr
      },
      enforce: 'post',
      transform(code, id) {
        if (entries.has(getPath(id)) && code.includes('import.meta.hot')) {
          return `${code}
await (async() => {
  const { protocol: pt1, host: h1, port: p1 } = new URL("${frontEndUrl}");
  const { protocol: pt2, host: h2, port: p2 } = new URL(document.location.href);
  if (pt1 !== pt2 || h1 !== h2 || p1 !== p2)
    await fetch("${frontEndUrl}${base}${READY_CALLBACK_DEFAULT}/${lastServed}",{mode:"no-cors"});
  else
    await fetch("${base}${READY_CALLBACK_DEFAULT}/${lastServed}");
})();`
        }
      },
    },
  ]
}

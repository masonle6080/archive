import { createServer } from 'http'
import { randomUUID } from 'crypto'
import type { AddressInfo } from 'net'

// Serves the media library over loopback HTTP. Chromium's media player cannot
// stream or seek over a custom scheme (electron/electron#38749): it treats the
// end of each capped 206 body as the end of the file, and rejects the response
// to a seek's range request. Over http:// the same responses play and seek.
//
// The server listens on 127.0.0.1 only, and every URL starts with a secret
// path that changes each launch, so other local programs cannot guess URLs.

export interface MediaServer {
  /** `http://127.0.0.1:<port>/<secret>/`; append an encoded file name. */
  readonly baseUrl: string
  close(): Promise<void>
}

export async function startMediaServer(
  serve: (request: Request) => Response
): Promise<MediaServer> {
  const secret = randomUUID()

  const server = createServer(async (req, res) => {
    const [, prefix, fileName, ...rest] = (req.url ?? '').split('/')
    if (prefix !== secret || !fileName || rest.length > 0) {
      res.writeHead(404).end()
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end()
      return
    }

    const range = req.headers.range
    const response = serve(
      new Request(`media://${fileName}`, { headers: range ? { range } : {} })
    )
    res.writeHead(response.status, Object.fromEntries(response.headers))
    if (req.method === 'HEAD') {
      res.end()
      return
    }
    res.end(Buffer.from(await response.arrayBuffer()))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const { port } = server.address() as AddressInfo

  return {
    baseUrl: `http://127.0.0.1:${port}/${secret}/`,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve())
        server.closeAllConnections()
      })
  }
}

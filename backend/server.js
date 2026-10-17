import { createServer } from 'node:http'

const port = Number(process.env.PORT ?? 8787)

const server = createServer((request, response) => {
  if (request.url === '/api/health') {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, service: 'our-world-backend' }))
    return
  }

  response.writeHead(404, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, () => {
  console.log(`Our World backend listening on http://localhost:${port}`)
})

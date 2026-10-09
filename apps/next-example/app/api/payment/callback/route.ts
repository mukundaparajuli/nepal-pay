import { handleCallback } from '../../../../src/handler'

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const query = Object.fromEntries(url.searchParams.entries())
  const result = await handleCallback(query)
  return Response.json(result.body, { status: result.status })
}

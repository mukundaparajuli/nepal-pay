import { handleCheckout } from '../../../src/handler'

export async function POST(request: Request): Promise<Response> {
  let input: unknown
  try {
    input = await request.json()
  } catch {
    return Response.json(
      { error: 'INVALID_REQUEST', message: 'invalid JSON body' },
      { status: 400 }
    )
  }
  const result = await handleCheckout(input)
  return Response.json(result.body, { status: result.status })
}

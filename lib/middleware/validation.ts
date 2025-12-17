/**
 * Validation middleware for API routes
 */

import { NextRequest, NextResponse } from 'next/server'
import { z, ZodSchema } from 'zod'

/**
 * Validation error response format
 */
interface ValidationErrorResponse {
  error: string
  details?: Array<{
    field: string
    message: string
  }>
}

/**
 * Validate request body against a Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Validated data or error response
 */
export async function validateBody<T extends ZodSchema>(
  request: NextRequest,
  schema: T
): Promise<
  | { data: z.infer<T>; error: null }
  | { data: null; error: NextResponse<ValidationErrorResponse> }
> {
  try {
    const body = await request.json()
    const data = schema.parse(body)
    return { data, error: null }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        data: null,
        error: NextResponse.json(
          {
            error: 'Validation failed',
            details: error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          { status: 400 }
        ),
      }
    }

    // Handle JSON parsing errors
    return {
      data: null,
      error: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      ),
    }
  }
}

/**
 * Validate URL search params against a Zod schema
 *
 * @param request - Next.js request object
 * @param schema - Zod schema to validate against
 * @returns Validated data or error response
 */
export function validateSearchParams<T extends ZodSchema>(
  request: NextRequest,
  schema: T
):
  | { data: z.infer<T>; error: null }
  | { data: null; error: NextResponse<ValidationErrorResponse> }
{
  try {
    const { searchParams } = new URL(request.url)
    const params = Object.fromEntries(searchParams.entries())
    const data = schema.parse(params)
    return { data, error: null }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        data: null,
        error: NextResponse.json(
          {
            error: 'Validation failed',
            details: error.issues.map((issue) => ({
              field: issue.path.join('.'),
              message: issue.message,
            })),
          },
          { status: 400 }
        ),
      }
    }

    return {
      data: null,
      error: NextResponse.json(
        { error: 'Invalid query parameters' },
        { status: 400 }
      ),
    }
  }
}

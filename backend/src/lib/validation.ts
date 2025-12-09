import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';

/**
 * Kubernetes namespace naming rules:
 * - Must be 63 characters or less
 * - Must start and end with alphanumeric
 * - Can contain lowercase alphanumeric and hyphens
 */
export const namespaceSchema = z
  .string()
  .min(1, 'Namespace cannot be empty')
  .max(63, 'Namespace must be 63 characters or less')
  .regex(
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
    'Namespace must be lowercase alphanumeric with hyphens, starting and ending with alphanumeric'
  );

/**
 * Kubernetes resource name rules:
 * - Must be 253 characters or less
 * - Must start and end with alphanumeric
 * - Can contain lowercase alphanumeric, hyphens, and dots
 */
export const resourceNameSchema = z
  .string()
  .min(1, 'Name cannot be empty')
  .max(253, 'Name must be 253 characters or less')
  .regex(
    /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/,
    'Name must be lowercase alphanumeric with hyphens/dots, starting and ending with alphanumeric'
  );

/**
 * Pagination query parameters
 */
export const paginationSchema = z.object({
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).max(100).optional()),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(0).optional()),
});

/**
 * Common query parameters for deployment routes
 */
export const deploymentQuerySchema = z.object({
  namespace: namespaceSchema.optional(),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(1).max(100).optional()),
  offset: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : undefined))
    .pipe(z.number().int().min(0).optional()),
});

/**
 * Validate request query parameters
 */
export function validateQuery<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return next(createError(`Invalid query parameters: ${errors.join(', ')}`, 400));
    }
    // Store validated data on request
    req.query = result.data as typeof req.query;
    next();
  };
}

/**
 * Validate request params
 */
export function validateParams<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return next(createError(`Invalid path parameters: ${errors.join(', ')}`, 400));
    }
    req.params = result.data as typeof req.params;
    next();
  };
}

/**
 * Validate request body
 */
export function validateBody<T extends z.ZodType>(schema: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`);
      return next(createError(`Invalid request body: ${errors.join(', ')}`, 400));
    }
    req.body = result.data;
    next();
  };
}

export type DeploymentQuery = z.infer<typeof deploymentQuerySchema>;
export type PaginationQuery = z.infer<typeof paginationSchema>;

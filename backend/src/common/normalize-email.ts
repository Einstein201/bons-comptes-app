import type { TransformFnParams } from 'class-transformer';

// Les adresses email sont comparées sans tenir compte de la casse ni des espaces autour.
export function normalizeEmail({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

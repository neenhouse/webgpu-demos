import { parse as parseYaml } from 'yaml';
import { SceneSchema } from './schema';
import type { Scene } from './types';

export interface ParseResult {
  success: true;
  scene: Scene;
}

export interface ParseError {
  success: false;
  errors: FieldError[];
}

export interface FieldError {
  path: string;
  message: string;
}

/**
 * Parse a YAML string into a validated Scene object.
 *
 * 1. Parses YAML text into a plain JS object
 * 2. Validates against the Zod SceneSchema
 * 3. Applies defaults for all optional fields (via Zod .default())
 * 4. Returns a typed Scene or descriptive field-level errors
 */
export function parseScene(yamlText: string): ParseResult | ParseError {
  // Step 1: Parse YAML
  let raw: unknown;
  try {
    raw = parseYaml(yamlText, { schema: 'core' });
  } catch (err) {
    return {
      success: false,
      errors: [
        {
          path: '',
          message: `YAML parse error: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
    };
  }

  // Step 2: Validate with Zod (also applies defaults)
  const result = SceneSchema.safeParse(raw);

  if (!result.success) {
    const errors: FieldError[] = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    return { success: false, errors };
  }

  // Step 3: Return typed scene (defaults already applied by Zod)
  return { success: true, scene: result.data };
}

/**
 * Parse a YAML string and throw on failure.
 * Convenience wrapper for use cases where errors are unexpected.
 */
export function parseSceneOrThrow(yamlText: string): Scene {
  const result = parseScene(yamlText);
  if (!result.success) {
    const messages = result.errors.map(
      (e) => (e.path ? `${e.path}: ${e.message}` : e.message),
    );
    throw new Error(`Scene validation failed:\n${messages.join('\n')}`);
  }
  return result.scene;
}

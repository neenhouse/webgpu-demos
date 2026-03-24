let cached: boolean | null = null;

export async function isWebGPUAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!navigator.gpu) {
    cached = false;
    return false;
  }
  try {
    const adapter = await navigator.gpu.requestAdapter();
    cached = adapter !== null;
  } catch {
    cached = false;
  }
  return cached!;
}

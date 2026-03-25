import type { Prefab } from './types';

export class PrefabRegistry {
  private readonly prefabs = new Map<string, Prefab>();

  register(id: string, prefab: Prefab): void {
    if (this.prefabs.has(id)) {
      throw new Error(`Prefab "${id}" is already registered. Call clear() before re-registering.`);
    }
    this.prefabs.set(id, prefab);
  }

  get(id: string): Prefab | undefined {
    return this.prefabs.get(id);
  }

  has(id: string): boolean {
    return this.prefabs.has(id);
  }

  list(): string[] {
    return Array.from(this.prefabs.keys());
  }

  clear(): void {
    this.prefabs.clear();
  }
}

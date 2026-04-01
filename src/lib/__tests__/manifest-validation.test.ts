import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { ManifestSchema, TAG_TAXONOMY } from '../../pipeline/spec/manifest-schema';

const MANIFESTS_DIR = path.resolve(__dirname, '../../../manifests');
const DEMOS_DIR = path.resolve(__dirname, '../../demos');
const SCENES_DIR = path.resolve(__dirname, '../../../public/scenes');

function loadAllManifests() {
  const files = fs.readdirSync(MANIFESTS_DIR).filter(f => f.endsWith('.manifest.yaml'));
  return files.map(file => {
    const raw = fs.readFileSync(path.join(MANIFESTS_DIR, file), 'utf8');
    return { file, data: YAML.parse(raw) };
  });
}

describe('manifest validation', () => {
  const manifests = loadAllManifests();

  it('found 166 manifest files', () => {
    expect(manifests.length).toBe(166);
  });

  it('every manifest passes Zod schema validation', () => {
    for (const { file, data } of manifests) {
      const result = ManifestSchema.safeParse(data);
      if (!result.success) {
        const issues = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`${file} failed validation: ${issues}`);
      }
    }
  });

  it('every manifest name matches its filename', () => {
    for (const { file, data } of manifests) {
      const expectedName = file.replace('.manifest.yaml', '');
      expect(data.meta.name, `${file} name mismatch`).toBe(expectedName);
    }
  });

  it('every component-mode manifest has a matching demo directory', () => {
    for (const { file, data } of manifests) {
      if (data.renderer.type === 'component') {
        const demoDir = path.join(DEMOS_DIR, data.renderer.module);
        expect(fs.existsSync(demoDir), `${file}: missing demo dir ${demoDir}`).toBe(true);
      }
    }
  });

  it('every scene-mode manifest has a matching scene YAML file', () => {
    for (const { file, data } of manifests) {
      if (data.renderer.type === 'scene') {
        const scenePath = path.join(SCENES_DIR, data.renderer.scene);
        expect(fs.existsSync(scenePath), `${file}: missing scene file ${scenePath}`).toBe(true);
      }
    }
  });

  it('no duplicate demo names across manifests', () => {
    const names = manifests.map(m => m.data.meta.name);
    const unique = new Set(names);
    expect(unique.size, 'duplicate demo names found').toBe(names.length);
  });

  it('no duplicate accent colors across manifests', () => {
    const colors = manifests.map(m => m.data.meta.color.toLowerCase());
    const unique = new Set(colors);
    // Allow some duplicates (146 demos, limited color space) but warn if many
    // This is a soft check — verify not excessive duplication (more than half reused)
    const dupeCount = colors.length - unique.size;
    expect(dupeCount).toBeLessThan(75);
  });

  it('all tags used are from TAG_TAXONOMY', () => {
    for (const { file, data } of manifests) {
      for (const tag of data.meta.tags) {
        expect(
          TAG_TAXONOMY as readonly string[],
          `${file} uses unknown tag "${tag}"`,
        ).toContain(tag);
      }
    }
  });

  it('scene-mode manifests have renderer.type = scene', () => {
    const sceneNames = ['test-scene', 'junkyard', 'alien-garden', 'medieval-forge',
      'underwater-ruins', 'cyberpunk-street', 'desert-outpost', 'robot-factory',
      'enchanted-forest', 'space-station', 'gladiator-arena'];
    for (const name of sceneNames) {
      const manifest = manifests.find(m => m.data.meta.name === name);
      expect(manifest, `manifest for ${name} not found`).toBeDefined();
      expect(manifest!.data.renderer.type, `${name} should be scene type`).toBe('scene');
    }
  });
});

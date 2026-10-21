import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LIGHTING_PRESETS, lightingAtMinute, resolveTimeOfDayId } from '../../src/data/lighting';
import { buildArtSandbox } from '../../src/world/ArtSandbox';
import { AssetLoadError, AssetPipeline, createAutoLod, createInstancedProps } from '../../src/world/assets';
import { createMaterialLibrary, SHARED_MATERIAL_IDS } from '../../src/world/materials';

describe('Prompt 19 — Pipeline de assets, 10 materiais PBR, iluminação e sandbox', () => {
  it('interpola presets de iluminação por hora do dia (manhã, meio-dia, fim de tarde, noite)', () => {
    expect(resolveTimeOfDayId(8 * 60)).toBe('manha');
    expect(resolveTimeOfDayId(12 * 60 + 30)).toBe('meio-dia');
    expect(resolveTimeOfDayId(17 * 60 + 15)).toBe('fim-de-tarde');
    expect(resolveTimeOfDayId(21 * 60)).toBe('noite');

    const noon = lightingAtMinute(12 * 60 + 30);
    const night = lightingAtMinute(20 * 60 + 30);
    expect(noon.sunIntensity).toBeCloseTo(LIGHTING_PRESETS['meio-dia'].sunIntensity, 2);
    expect(noon.streetLightsOn).toBe(false);
    expect(night.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(night.streetLightsOn).toBe(true);

    // Transição suave entre meio-dia e fim de tarde
    const afternoon = lightingAtMinute(15 * 60);
    expect(afternoon.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(afternoon.sunIntensity).toBeGreaterThan(night.sunIntensity);
  });

  it('fornece os 10 materiais compartilhados com cache e desliga mapas extras no nível baixa', () => {
    const lib = createMaterialLibrary('alta');
    expect(SHARED_MATERIAL_IDS).toHaveLength(10);

    for (const id of SHARED_MATERIAL_IDS) {
      const m1 = lib.get(id);
      const m2 = lib.get(id);
      // Cache: mesma instância, sem duplicar material
      expect(m1).toBe(m2);
    }

    const highStats = lib.stats();
    expect(highStats.cachedMaterials).toBe(10);
    expect(highStats.activeMaps).toBeGreaterThan(15);

    lib.setQuality('baixa');
    const lowStats = lib.stats();
    expect(lowStats.quality).toBe('baixa');
    // Em qualidade baixa, roughnessMap e bumpMap são desligados
    expect(lowStats.activeMaps).toBeLessThan(highStats.activeMaps);
    expect(lib.get('concreto').roughnessMap).toBeNull();
    expect(lib.get('concreto').bumpMap).toBeNull();

    lib.dispose();
  });

  it('AssetPipeline faz cache de modelos, reporta progresso e trata erro de rede sem travar', async () => {
    let fetchCalls = 0;
    const progressEvents: number[] = [];

    const pipeline = new AssetPipeline({
      customModelLoader: async (url) => {
        fetchCalls++;
        if (url.includes('falha')) {
          throw new Error('404 Not Found');
        }
        const g = new THREE.Group();
        g.name = `modelo_${url}`;
        return g;
      },
    });

    const off = pipeline.onProgress((p) => {
      progressEvents.push(p.ratio);
    });

    // Duas chamadas concorrentes para o mesmo arquivo só disparam 1 requisição
    const [m1, m2] = await Promise.all([
      pipeline.loadModel('/models/elevador.glb'),
      pipeline.loadModel('/models/elevador.glb'),
    ]);
    expect(fetchCalls).toBe(1);
    expect(m1.name).toBe('modelo_/models/elevador.glb');
    expect(m2).not.toBe(m1); // Clones independentes compartilhando geometria/material

    // Falha de rede tratada com loadSafeModel (nunca trava o jogo)
    const fallbackResult = await pipeline.loadSafeModel('/models/falha.glb', () => {
      const fb = new THREE.Group();
      fb.name = 'fallback_procedural';
      return fb;
    });
    expect(fallbackResult.fromFallback).toBe(true);
    expect(fallbackResult.error).toBeInstanceOf(AssetLoadError);
    expect(fallbackResult.group.name).toBe('fallback_procedural');
    expect(pipeline.getStats().failed).toBe(1);
    expect(progressEvents.length).toBeGreaterThan(1);

    off();
    pipeline.dispose();
  });

  it('cria LOD automático ordenado e lotes InstancedMesh', () => {
    const mat = new THREE.MeshBasicMaterial();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const lod = createAutoLod([
      { distance: 25, object: new THREE.Mesh(geo, mat) },
      { distance: 0, object: new THREE.Mesh(geo, mat) },
      { distance: 10, object: new THREE.Mesh(geo, mat) },
    ]);
    expect(lod.levels.map((l) => l.distance)).toEqual([0, 10, 25]);

    const instanced = createInstancedProps(geo, mat, [
      { position: [0, 0, 0] },
      { position: [2, 0, 1], rotationY: 0.5, scale: 1.2 },
    ]);
    expect(instanced.count).toBe(2);
    geo.dispose();
    mat.dispose();
  });

  it('ArtSandbox (?arte) exibe os 10 materiais e usa menos da metade de draw calls no nível baixa', () => {
    const sandbox = buildArtSandbox('alta', 12 * 60);
    expect(sandbox.showcaseMeshes.size).toBe(10);

    const callsAlta = sandbox.estimateDrawCalls();
    sandbox.setQuality('baixa');
    const callsBaixa = sandbox.estimateDrawCalls();

    expect(callsBaixa).toBeLessThan(callsAlta / 2);
    sandbox.dispose();
  });
});


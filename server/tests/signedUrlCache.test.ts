/**
 * Screenshot links are reused while they have plenty of life left, so a page view does not ask
 * Supabase to sign every screenshot again. Nothing here touches the database or Supabase.
 */
import { describe, expect, it, vi } from 'vitest';
import { SignedUrlCache } from '../src/lib/storage.js';

const TTL = 15 * 60 * 1000;

function setup(sign: (path: string) => Promise<string | null> = async (path) => `https://storage.example/${path}?token=${Math.random()}`, max?: number) {
  let clock = 1_000_000;
  const signer = vi.fn(sign);
  const cache = new SignedUrlCache(signer, TTL, max, () => clock);
  return { cache, signer, advance: (ms: number) => (clock += ms) };
}

describe('Signed screenshot links', () => {
  it('signs a file once and reuses the link on later views', async () => {
    const { cache, signer } = setup();
    const first = await cache.get('p1/a.png');
    expect(await cache.get('p1/a.png')).toBe(first);
    expect(await cache.get('p1/a.png')).toBe(first);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('shares one signing between views that arrive together', async () => {
    const { cache, signer } = setup();
    const [a, b, c] = await Promise.all([cache.get('p1/a.png'), cache.get('p1/a.png'), cache.get('p1/a.png')]);
    expect(new Set([a, b, c]).size).toBe(1);
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it('signs afresh once only half the link’s lifetime is left', async () => {
    const { cache, signer, advance } = setup();
    const first = await cache.get('p1/a.png');
    advance(TTL / 2 - 1000);
    expect(await cache.get('p1/a.png')).toBe(first);
    advance(2000);
    expect(await cache.get('p1/a.png')).not.toBe(first);
    expect(signer).toHaveBeenCalledTimes(2);
  });

  it('never serves a removed file from the cache', async () => {
    const { cache, signer } = setup();
    await cache.get('p1/a.png');
    cache.forget(['p1/a.png']);
    await cache.get('p1/a.png');
    expect(signer).toHaveBeenCalledTimes(2);
  });

  it('keeps each file’s link separate', async () => {
    const { cache } = setup();
    expect(await cache.get('p1/a.png')).not.toBe(await cache.get('p1/b.png'));
  });

  it('does not keep a failed or refused signing, so the next view tries again', async () => {
    const results: Array<() => Promise<string | null>> = [async () => null, async () => Promise.reject(new Error('network down')), async () => 'https://storage.example/ok'];
    const { cache, signer } = setup(() => results.shift()!());
    expect(await cache.get('p1/a.png')).toBeNull();
    await expect(cache.get('p1/a.png')).rejects.toThrow('network down');
    await Promise.resolve();
    expect(await cache.get('p1/a.png')).toBe('https://storage.example/ok');
    expect(signer).toHaveBeenCalledTimes(3);
  });

  it('drops the oldest links once it holds the maximum', async () => {
    const { cache, signer } = setup(undefined, 2);
    await cache.get('a');
    await cache.get('b');
    await cache.get('c');
    expect(cache.size).toBe(2);
    await cache.get('a');
    expect(signer).toHaveBeenCalledTimes(4);
  });
});

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import { HttpError } from './errors.js';

/**
 * Where project images live (FR02). Screenshots use a private bucket and short-lived signed URLs;
 * cover images use a public bucket because every tier, Guests included, sees the card thumbnail.
 */
export interface MediaStorage {
  upload(path: string, data: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  signedUrl(path: string): Promise<string | null>;
  /** Permanent URL of an object in a public bucket. */
  publicUrl(path: string): string;
}

/**
 * Reuses signed URLs, so a page view does not ask Supabase to sign every screenshot again. A link is
 * reused only while more than half its lifetime remains, because the gallery loads images lazily and
 * a page may stay open a while; after that, or once the file is removed, it is signed afresh. In-flight
 * signings are shared, and the oldest entries go first once `max` is reached.
 */
export class SignedUrlCache {
  private entries = new Map<string, { url: Promise<string | null>; reuseUntil: number }>();

  constructor(
    private sign: (path: string) => Promise<string | null>,
    private ttlMs: number,
    private max = 2000,
    private now = () => Date.now(),
  ) {}

  get(path: string): Promise<string | null> {
    const hit = this.entries.get(path);
    if (hit && hit.reuseUntil > this.now()) return hit.url;
    this.entries.delete(path);
    const url = this.sign(path);
    this.entries.set(path, { url, reuseUntil: this.now() + this.ttlMs / 2 });
    // A failed signing is not kept, so the next view tries again.
    const drop = () => {
      if (this.entries.get(path)?.url === url) this.entries.delete(path);
    };
    url.then((u) => u === null && drop(), drop);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return url;
  }

  forget(paths: string[]): void {
    for (const p of paths) this.entries.delete(p);
  }

  get size(): number {
    return this.entries.size;
  }
}

function notConfigured(): never {
  throw new HttpError(
    503,
    'STORAGE_UNAVAILABLE',
    'Image uploads are not configured on this server. Your project can be submitted without images.',
  );
}

class SupabaseStorage implements MediaStorage {
  private client: SupabaseClient | undefined;
  private signed = new SignedUrlCache((path) => this.sign(path), config.media.signedUrlTtlSeconds * 1000);

  constructor(private bucketName: string) {}

  private bucket() {
    if (!config.media.supabaseUrl || !config.media.supabaseServiceKey) notConfigured();
    this.client ??= createClient(config.media.supabaseUrl, config.media.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return this.client.storage.from(this.bucketName);
  }

  async upload(path: string, data: Buffer, contentType: string) {
    const { error } = await this.bucket().upload(path, data, { contentType, upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
  }

  async remove(paths: string[]) {
    if (paths.length === 0) return;
    this.signed.forget(paths);
    const { error } = await this.bucket().remove(paths);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }

  signedUrl(path: string) {
    return this.signed.get(path);
  }

  private async sign(path: string) {
    if (!config.media.supabaseUrl || !config.media.supabaseServiceKey) return null;
    const { data, error } = await this.bucket().createSignedUrl(path, config.media.signedUrlTtlSeconds);
    if (error) {
      console.error(`[storage] Could not sign ${path}: ${error.message}`);
      return null;
    }
    // Accepted exception to "never return storage paths": Supabase's URL includes the object path. The
    // path is a project id and a random UUID, and it is useless without the short-lived token.
    return data.signedUrl;
  }

  publicUrl(path: string) {
    return this.bucket().getPublicUrl(path).data.publicUrl;
  }
}

/** In-memory bucket used by the automated tests. */
export class MemoryStorage implements MediaStorage {
  objects = new Map<string, { data: Buffer; contentType: string }>();
  async upload(path: string, data: Buffer, contentType: string) {
    this.objects.set(path, { data, contentType });
  }
  async remove(paths: string[]) {
    for (const p of paths) this.objects.delete(p);
  }
  async signedUrl(path: string) {
    return this.objects.has(path) ? `memory://${path}?signed=1` : null;
  }
  publicUrl(path: string) {
    return `memory://${path}`;
  }
}

const inMemory = config.media.driver === 'memory';
let current: MediaStorage = inMemory ? new MemoryStorage() : new SupabaseStorage(config.media.bucket);
let covers: MediaStorage = inMemory ? new MemoryStorage() : new SupabaseStorage(config.media.coverBucket);

export function getStorage(): MediaStorage {
  return current;
}

export function setStorage(storage: MediaStorage): void {
  current = storage;
}

export function getCoverStorage(): MediaStorage {
  return covers;
}

export function setCoverStorage(storage: MediaStorage): void {
  covers = storage;
}

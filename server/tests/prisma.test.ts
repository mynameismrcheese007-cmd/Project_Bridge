/**
 * Connection settings that keep the first request after a quiet spell from stalling. Nothing here
 * touches the database.
 */
import { describe, expect, it } from 'vitest';
import { connectionLimit, TX_OPTIONS, URL_DEFAULTS, withTimeouts } from '../src/lib/prisma.js';

const BASE = 'postgresql://user:pass@db.example.com:5432/postgres';

describe('withTimeouts', () => {
  it('adds short socket and pool timeouts so a dead connection is dropped within seconds', () => {
    const url = new URL(withTimeouts(`${BASE}?schema=public&connection_limit=3`)!);
    expect(url.searchParams.get('schema')).toBe('public');
    expect(url.searchParams.get('connection_limit')).toBe('3');
    expect(Number(url.searchParams.get('socket_timeout'))).toBeLessThanOrEqual(10);
    expect(Number(url.searchParams.get('pool_timeout'))).toBeLessThanOrEqual(15);
    expect(url.searchParams.get('connect_timeout')).toBe(URL_DEFAULTS.connect_timeout);
  });

  it('keeps a timeout already set in the URL', () => {
    const url = new URL(withTimeouts(`${BASE}?socket_timeout=20`)!);
    expect(url.searchParams.getAll('socket_timeout')).toEqual(['20']);
    expect(url.searchParams.get('pool_timeout')).toBe(URL_DEFAULTS.pool_timeout);
  });

  it('starts the query string when the URL has none, and leaves a missing URL alone', () => {
    expect(withTimeouts(BASE)).toMatch(/^postgresql:\/\/[^?]+\?socket_timeout=/);
    expect(withTimeouts(undefined)).toBeUndefined();
  });

  it('bounds the worst case for a read well under the old 90 seconds', () => {
    // Three attempts on dead connections plus one wait for a free connection.
    const worst = 3 * Number(URL_DEFAULTS.socket_timeout) + Number(URL_DEFAULTS.pool_timeout);
    expect(worst).toBeLessThanOrEqual(35);
    expect(TX_OPTIONS.maxWait).toBeLessThanOrEqual(Number(URL_DEFAULTS.pool_timeout) * 1000);
  });
});

describe('connectionLimit', () => {
  it('reads connection_limit from the URL', () => {
    expect(connectionLimit(`${BASE}?schema=public&connection_limit=3`)).toBe(3);
    expect(connectionLimit(`${BASE}?connection_limit=5&schema=public`)).toBe(5);
  });

  it('falls back to one connection when the value is missing or invalid', () => {
    expect(connectionLimit(BASE)).toBe(1);
    expect(connectionLimit(`${BASE}?connection_limit=0`)).toBe(1);
    expect(connectionLimit(`${BASE}?connection_limit=abc`)).toBe(1);
    expect(connectionLimit(undefined)).toBe(1);
  });
});

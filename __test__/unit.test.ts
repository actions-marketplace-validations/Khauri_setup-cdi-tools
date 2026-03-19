import { expect, test, describe } from 'bun:test';
import { resolveConfig } from '../src';
import type { PlatformConfig } from '../src';

describe('resolveConfig with headers and token', () => {
  test('headers field is preserved in resolved config', () => {
    const config = {
      template: 'https://example.com/${version}',
      version: '1.0.0',
      headers: { 'X-Custom-Header': 'custom-value' },
    };
    const [resolved] = resolveConfig(config);
    expect(resolved.headers).toEqual({ 'X-Custom-Header': 'custom-value' });
  });

  test('token field is preserved in resolved config', () => {
    const config = {
      template: 'https://example.com/${version}',
      version: '1.0.0',
      token: 'ghp_abc123',
    };
    const [resolved] = resolveConfig(config);
    expect(resolved.token).toBe('ghp_abc123');
  });

  test('both headers and token fields are preserved', () => {
    const config = {
      template: 'https://example.com/${version}',
      version: '1.0.0',
      headers: { Accept: 'application/octet-stream' },
      token: 'ghp_abc123',
    };
    const [resolved] = resolveConfig(config);
    expect(resolved.headers).toEqual({ Accept: 'application/octet-stream' });
    expect(resolved.token).toBe('ghp_abc123');
  });

  test('config without headers or token still works', () => {
    const config = {
      template: 'https://example.com/${version}',
      version: '1.0.0',
    };
    const [resolved] = resolveConfig(config);
    expect(resolved.headers).toBeUndefined();
    expect(resolved.token).toBeUndefined();
  });
});

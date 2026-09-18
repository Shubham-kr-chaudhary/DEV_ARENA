import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../src/index.js';

describe('shared foundation', () => {
  it('exposes the product name', () => {
    expect(APP_NAME).toBe('DevArena');
  });
});

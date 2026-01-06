import { describe, test, expect } from 'bun:test';
import { namespaceSchema, resourceNameSchema } from './validation';

describe('namespaceSchema', () => {
  test('accepts valid namespaces', () => {
    expect(namespaceSchema.safeParse('default').success).toBe(true);
    expect(namespaceSchema.safeParse('my-namespace').success).toBe(true);
    expect(namespaceSchema.safeParse('kube-system').success).toBe(true);
    expect(namespaceSchema.safeParse('test123').success).toBe(true);
    expect(namespaceSchema.safeParse('a').success).toBe(true);
    expect(namespaceSchema.safeParse('a1').success).toBe(true);
  });

  test('rejects empty namespace', () => {
    const result = namespaceSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('empty');
    }
  });

  test('rejects namespace over 63 characters', () => {
    const longName = 'a'.repeat(64);
    const result = namespaceSchema.safeParse(longName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('63');
    }
  });

  test('accepts 63 character namespace', () => {
    const validName = 'a'.repeat(63);
    expect(namespaceSchema.safeParse(validName).success).toBe(true);
  });

  test('rejects uppercase characters', () => {
    expect(namespaceSchema.safeParse('MyNamespace').success).toBe(false);
    expect(namespaceSchema.safeParse('TEST').success).toBe(false);
  });

  test('rejects namespace starting with hyphen', () => {
    expect(namespaceSchema.safeParse('-namespace').success).toBe(false);
  });

  test('rejects namespace ending with hyphen', () => {
    expect(namespaceSchema.safeParse('namespace-').success).toBe(false);
  });

  test('rejects namespace with underscore', () => {
    expect(namespaceSchema.safeParse('my_namespace').success).toBe(false);
  });

  test('rejects namespace with dots', () => {
    expect(namespaceSchema.safeParse('my.namespace').success).toBe(false);
  });

  test('rejects namespace with special characters', () => {
    expect(namespaceSchema.safeParse('my@namespace').success).toBe(false);
    expect(namespaceSchema.safeParse('my namespace').success).toBe(false);
    expect(namespaceSchema.safeParse('my/namespace').success).toBe(false);
  });

  test('rejects namespace starting with number but allows alphanumeric', () => {
    // Numbers are alphanumeric, so starting with number should be valid
    expect(namespaceSchema.safeParse('123-test').success).toBe(true);
    expect(namespaceSchema.safeParse('0namespace').success).toBe(true);
  });
});

describe('resourceNameSchema', () => {
  test('accepts valid resource names', () => {
    expect(resourceNameSchema.safeParse('my-resource').success).toBe(true);
    expect(resourceNameSchema.safeParse('my.resource.name').success).toBe(true);
    expect(resourceNameSchema.safeParse('resource-with-dots.and-hyphens').success).toBe(true);
    expect(resourceNameSchema.safeParse('test123').success).toBe(true);
    expect(resourceNameSchema.safeParse('a').success).toBe(true);
  });

  test('rejects empty name', () => {
    const result = resourceNameSchema.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('empty');
    }
  });

  test('rejects name over 253 characters', () => {
    const longName = 'a'.repeat(254);
    const result = resourceNameSchema.safeParse(longName);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('253');
    }
  });

  test('accepts 253 character name', () => {
    const validName = 'a'.repeat(253);
    expect(resourceNameSchema.safeParse(validName).success).toBe(true);
  });

  test('rejects uppercase characters', () => {
    expect(resourceNameSchema.safeParse('MyResource').success).toBe(false);
    expect(resourceNameSchema.safeParse('TEST').success).toBe(false);
  });

  test('rejects name starting with hyphen', () => {
    expect(resourceNameSchema.safeParse('-resource').success).toBe(false);
  });

  test('rejects name ending with hyphen', () => {
    expect(resourceNameSchema.safeParse('resource-').success).toBe(false);
  });

  test('rejects name starting with dot', () => {
    expect(resourceNameSchema.safeParse('.resource').success).toBe(false);
  });

  test('rejects name ending with dot', () => {
    expect(resourceNameSchema.safeParse('resource.').success).toBe(false);
  });

  test('accepts dots in middle of name', () => {
    expect(resourceNameSchema.safeParse('my.resource.name').success).toBe(true);
  });

  test('rejects name with underscore', () => {
    expect(resourceNameSchema.safeParse('my_resource').success).toBe(false);
  });

  test('rejects name with special characters', () => {
    expect(resourceNameSchema.safeParse('my@resource').success).toBe(false);
    expect(resourceNameSchema.safeParse('my resource').success).toBe(false);
    expect(resourceNameSchema.safeParse('my/resource').success).toBe(false);
  });
});

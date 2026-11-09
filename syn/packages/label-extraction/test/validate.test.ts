import { describe, expect, it } from 'vitest';
import schema from '../../schemas/label-extraction.schema.json';
import { enforceInvariants, readableValue } from '../src';
import { label } from '../../scan-signals/test/helpers';

describe('wire schema stays inside the structured-outputs subset', () => {
  const banned = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength',
    'pattern', 'if', 'then', 'else', 'uniqueItems', 'minItems', 'maxItems', 'default'];
  const walk = (node: unknown, path: string, out: string[]) => {
    if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${path}[${i}]`, out));
    else if (node && typeof node === 'object') {
      const o = node as Record<string, unknown>;
      for (const k of Object.keys(o)) if (banned.includes(k) && path !== '' && !path.endsWith('.properties')) out.push(`${path}.${k}`);
      if (o.type === 'object' && o.additionalProperties !== false) out.push(`${path}: additionalProperties must be false`);
      if (o.type === 'object' && o.properties) {
        const missing = Object.keys(o.properties as object).filter((k) => !(o.required as string[] | undefined)?.includes(k));
        if (missing.length) out.push(`${path}: not required: ${missing.join(',')}`);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`, out);
    }
  };
  it('has no unsupported keywords and every object is closed', () => {
    const problems: string[] = [];
    walk(schema, '', problems);
    expect(problems).toEqual([]);
  });
});

describe('enforceInvariants', () => {
  it('ambiguous date format -> null with reason, never guessed', () => {
    const x = label({ exp: '2027-03' });
    x.fields.expiry_date.format_ambiguous = true;
    const { extraction, corrections } = enforceInvariants(x);
    expect(extraction.fields.expiry_date.value).toBeNull();
    expect(extraction.fields.expiry_date.unreadable_reason).toBe('ambiguous');
    expect(corrections.length).toBe(1);
  });
  it('impossible calendar date and precision mismatch are rejected', () => {
    const x = label({ mfg: '2025-02-30', exp: '2027-01' });
    x.fields.expiry_date.value!.precision = 'day';
    const { extraction } = enforceInvariants(x);
    expect(extraction.fields.manufacture_date.value).toBeNull();
    expect(extraction.fields.expiry_date.value).toBeNull();
  });
  it('confidence is clamped and empty strings become not_present', () => {
    const x = label({ batch: '  ' });
    x.fields.product_name.confidence = 1.7;
    const { extraction } = enforceInvariants(x);
    expect(extraction.fields.product_name.confidence).toBe(1);
    expect(extraction.fields.batch.value).toBeNull();
  });
  it('readableValue drops low-confidence values', () => {
    expect(readableValue({ value: 'X', confidence: 0.84 })).toBeNull();
    expect(readableValue({ value: 'X', confidence: 0.85 })).toBe('X');
  });
  it('does not mutate its input', () => {
    const x = label({ exp: '2027-03' });
    x.fields.expiry_date.format_ambiguous = true;
    enforceInvariants(x);
    expect(x.fields.expiry_date.value).not.toBeNull();
  });
});

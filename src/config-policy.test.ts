/**
 * Compile-time regression coverage for schema-bound config sensitivity.
 */

import './test-entrypoint.js';

import { it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  ConfigField,
  ConfigFieldVisibilityOf
} from './types/index.js';

const secretField: ConfigField<string, 'secret'> = 'credential';
const displaySafeField: ConfigField<string, 'display-safe'> = 'label';
const secretVisibility: ConfigFieldVisibilityOf<typeof secretField> = 'secret';
const displaySafeVisibility: ConfigFieldVisibilityOf<typeof displaySafeField> =
  'display-safe';

// @ts-expect-error A schema-designated secret cannot be display-safe.
const misclassifiedSecret: ConfigFieldVisibilityOf<typeof secretField> =
  'display-safe';

// @ts-expect-error Every config leaf must carry a schema-level designation.
const unclassifiedField: ConfigFieldVisibilityOf<string> = 'display-safe';

it('preserves schema-bound config field values at runtime', () => {
  assert.deepStrictEqual(
    [secretField, displaySafeField, secretVisibility, displaySafeVisibility],
    ['credential', 'label', 'secret', 'display-safe']
  );
  void misclassifiedSecret;
  void unclassifiedField;
});

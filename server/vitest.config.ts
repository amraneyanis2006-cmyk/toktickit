import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // bcrypt cost-12 API tests (e.g. Lab 3 reset-password, ~5.1 s) exceed the
    // 5 s default on a loaded machine. Config only - no test is edited
    // (PR #68 decision, docs/lab-04/tests.md sec 13).
    testTimeout: 15000,
  },
});

import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './lab-02',
  use: {
    baseURL: 'http://localhost:5173', 
  },
  reporter: 'list',
});
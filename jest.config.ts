import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/tests/setup/wallet-chain.ts'],
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
  verbose: true,
  // DB suites clone a database per file; the 5 s default trips on a loaded 2-core runner.
  testTimeout: 30000,
  globalSetup: '<rootDir>/tests/setup/db-template.js',
  reporters: ['default', '<rootDir>/tests/reporters/db-suites-reporter.js'],
};

export default config;

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  moduleNameMapper: {
    '^@data/(.*)$': '<rootDir>/src/data/$1',
    '^@strategy/(.*)$': '<rootDir>/src/strategy/$1',
    '^@execution/(.*)$': '<rootDir>/src/execution/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
  },
};

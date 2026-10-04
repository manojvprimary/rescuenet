/** Jest config: TypeScript via ts-jest; tests live in test/ and import from lambda/. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
};

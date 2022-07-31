module.exports = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  rootDir: 'build',
  testMatch: ['**/__tests__/**/*.js', '**/?(*.)+(spec|test).js'],
  // globalSetup: '<rootDir>/test/globalSetup.js',
  // globalTeardown: '<rootDir>/test/globalTeardown.js',
  // setupFilesAfterEnv: ['<rootDir>/test/setupAfterEnv.js'],
  verbose: true,
  // resolver: 'jest-node-exports-resolver',
}

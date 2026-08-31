'use strict'

module.exports = {
  testEnvironment: 'node',
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/integration/'
  ],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/wwebjs/legacy/**',
    '!src/routes.js'
  ],
  coverageProvider: 'v8',
  coverageReporters: ['text', 'json-summary', 'lcov'],
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 25,
      lines: 25,
      statements: 25
    }
  }
}

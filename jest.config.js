module.exports = {
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/unit/**/*.test.js'],
      collectCoverageFrom: [
        'shared/**/*.js',
        'validator/**/*.js',
        'coordinator/**/*.js',
        'pool/**/*.js',
        'worker/**/*.js',
      ],
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    },
  ],
};

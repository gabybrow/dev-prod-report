module.exports = {
    // The test environment that will be used for testing
    testEnvironment: 'node',

    // The glob patterns Jest uses to detect test files
    testMatch: [
        '**/__tests__/**/*.test.js'
    ],

    // An array of regexp pattern strings that are matched against all test paths
    testPathIgnorePatterns: [
        '/node_modules/'
    ],

    // Indicates whether each individual test should be reported during the run
    verbose: true,

    // Automatically clear mock calls and instances between every test
    clearMocks: true,

    // The directory where Jest should output its coverage files
    coverageDirectory: 'coverage',

    // An array of regexp pattern strings used to skip coverage collection
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/'
    ],

    // A list of reporter names that Jest uses when writing coverage reports
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],

    collectCoverage: true,
    collectCoverageFrom: [
        '*.js',
        '!jest.config.js'
    ],

    // Add setup file for console mocks
    setupFilesAfterEnv: ['./__tests__/setup.js']
}; 
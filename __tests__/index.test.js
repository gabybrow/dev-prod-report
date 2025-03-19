const { Octokit } = require('octokit');
const { calculatePRMetrics, generateReport, setOctokit } = require('../index');
const moment = require('moment');

// Mock Octokit
jest.mock('octokit');

describe('GitHub Report Generator', () => {
    let mockOctokit;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();

        // Setup mock Octokit instance
        mockOctokit = {
            rest: {
                pulls: {
                    list: jest.fn(),
                    listReviews: jest.fn(),
                    listComments: jest.fn()
                },
                issues: {
                    listComments: jest.fn()
                }
            }
        };

        // Set the mock Octokit instance
        setOctokit(mockOctokit);
    });

    describe('calculatePRMetrics', () => {
        it('should calculate correct metrics for PRs within date range', async () => {
            const startDate = '2024-02-01';
            const endDate = '2024-02-07';

            // Mock PR data
            const mockPRs = [
                {
                    number: 1,
                    state: 'open',
                    created_at: '2024-02-01T10:00:00Z',
                    updated_at: '2024-02-01T11:00:00Z',
                    user: { login: 'user1' },
                    comments: 2
                },
                {
                    number: 2,
                    state: 'closed',
                    merged_at: '2024-02-02T10:00:00Z',
                    created_at: '2024-02-01T10:00:00Z',
                    updated_at: '2024-02-02T10:00:00Z',
                    user: { login: 'user2' },
                    comments: 3
                }
            ];

            mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

            const metrics = await calculatePRMetrics('testOwner', 'testRepo', startDate, endDate);

            expect(metrics).toMatchObject({
                newPRs: 2,
                mergedPRs: 1,
                openPRs: 1,
                avgTimeToMerge: expect.any(Number),
                contributors: {
                    user1: expect.any(Object),
                    user2: expect.any(Object)
                }
            });

            // Verify contributor metrics
            expect(metrics.contributors.user1).toMatchObject({
                newPRs: 1,
                openPRs: 1,
                mergedPRs: 0
            });

            expect(metrics.contributors.user2).toMatchObject({
                newPRs: 1,
                openPRs: 0,
                mergedPRs: 1
            });
        });

        it('should handle empty PR list', async () => {
            mockOctokit.rest.pulls.list.mockResolvedValue({ data: [] });

            const metrics = await calculatePRMetrics(
                'testOwner',
                'testRepo',
                '2024-02-01',
                '2024-02-07'
            );

            expect(metrics).toMatchObject({
                newPRs: 0,
                mergedPRs: 0,
                openPRs: 0,
                avgTimeToMerge: 0,
                contributors: {}
            });
        });
    });

    describe('generateReport', () => {
        it('should generate a correctly formatted report', async () => {
            const mockMetrics = {
                newPRs: 2,
                mergedPRs: 1,
                openPRs: 1,
                avgTimeToMerge: 24,
                contributors: {
                    'user1': { newPRs: 1, mergedPRs: 0, openPRs: 1, comments: 2 },
                    'user2': { newPRs: 1, mergedPRs: 1, openPRs: 0, comments: 3 }
                }
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);

            // Check report structure
            expect(report).toContain('# GitHub Activity Report');
            expect(report).toContain('## Summary');
            expect(report).toContain('## Contributors');

            // Check metrics are included
            expect(report).toContain(`New PRs: ${mockMetrics.newPRs}`);
            expect(report).toContain(`Merged PRs: ${mockMetrics.mergedPRs}`);
            expect(report).toContain(`Open PRs: ${mockMetrics.openPRs}`);

            // Check contributor table
            expect(report).toMatch(/\|.*user1.*\|/);
            expect(report).toMatch(/\|.*user2.*\|/);
        });

        it('should handle report with no contributors', async () => {
            const mockMetrics = {
                newPRs: 0,
                mergedPRs: 0,
                openPRs: 0,
                avgTimeToMerge: 0,
                contributors: {}
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);

            expect(report).toContain('# GitHub Activity Report');
            expect(report).toContain('## Summary');
            expect(report).toContain('New PRs: 0');
            expect(report).toContain('Merged PRs: 0');
            expect(report).toContain('Open PRs: 0');
        });
    });
}); 
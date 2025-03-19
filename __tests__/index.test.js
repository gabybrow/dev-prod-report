const { Octokit } = require('octokit');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Mock modules
jest.mock('octokit');
jest.mock('fs');
jest.mock('path');

// Set required environment variables
process.env.GITHUB_TOKEN = 'test-token';
process.env.GITHUB_ORG = 'test-owner';
process.env.REPOSITORIES = 'repo1,repo2';

const {
    calculatePRMetrics,
    generateReport,
    setOctokit,
    _internal: {
        fetchPRs,
        fetchPRDetails,
        ensureReportDirectories,
        getLastWeekDate,
        getReportFilename
    }
} = require('../index');

describe('GitHub Report Generator', () => {
    let mockOctokit;
    const originalEnv = process.env;

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
        process.env = { ...originalEnv };

        // Setup mock Octokit instance with both rest and request methods
        mockOctokit = {
            request: jest.fn(),
            rest: {
                pulls: {
                    list: jest.fn(),
                    listReviews: jest.fn(),
                    listReviewComments: jest.fn()
                },
                issues: {
                    listComments: jest.fn()
                }
            }
        };

        // Set the mock Octokit instance
        setOctokit(mockOctokit);

        // Mock path.join to return predictable paths
        path.join.mockImplementation((...args) => args.join('/'));
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('Environment Setup', () => {
        it('should validate required environment variables', () => {
            jest.resetModules();
            delete process.env.GITHUB_TOKEN;
            delete process.env.GITHUB_ORG;
            delete process.env.REPOSITORIES;

            expect(() => {
                require('../index');
            }).toThrow('GITHUB_ORG and REPOSITORIES must be set in .env file');
        });

        it('should handle empty repositories list', () => {
            jest.resetModules();
            process.env.GITHUB_TOKEN = 'test-token';
            process.env.GITHUB_ORG = 'test-owner';
            process.env.REPOSITORIES = '';

            expect(() => {
                require('../index');
            }).toThrow('GITHUB_ORG and REPOSITORIES must be set in .env file');
        });
    });

    describe('Directory Management', () => {
        it('should create report directories if they don\'t exist', () => {
            const date = moment('2024-02-01');
            fs.existsSync.mockReturnValue(false);

            ensureReportDirectories(date);

            expect(fs.mkdirSync).toHaveBeenCalledTimes(3);
            expect(fs.mkdirSync).toHaveBeenCalledWith('reports', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('reports/2024', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('reports/2024/02-February', { recursive: true });
        });

        it('should not create directories if they exist', () => {
            const date = moment('2024-02-01');
            fs.existsSync.mockReturnValue(true);

            ensureReportDirectories(date);

            expect(fs.mkdirSync).not.toHaveBeenCalled();
        });

        it('should generate correct report filename', () => {
            const date = moment('2024-02-01');
            const filename = getReportFilename(date);
            expect(filename).toBe('weekly-report-2024-02-01.md');
        });
    });

    describe('PR Fetching', () => {
        it('should fetch PRs with correct parameters', async () => {
            const lastWeekDate = getLastWeekDate().format();
            mockOctokit.rest.pulls.list.mockResolvedValueOnce({ data: [] });

            await fetchPRs('test-repo');

            expect(mockOctokit.rest.pulls.list).toHaveBeenCalledWith({
                owner: process.env.GITHUB_ORG,
                repo: 'test-repo',
                state: 'all',
                sort: 'updated',
                direction: 'desc',
                per_page: 100,
                since: lastWeekDate
            });
        });

        it('should handle PR fetch errors gracefully', async () => {
            mockOctokit.request.mockRejectedValue(new Error('API Error'));
            const result = await fetchPRs('test-repo');
            expect(result).toEqual([]);
        });

        it('should handle rate limiting errors', async () => {
            mockOctokit.request.mockRejectedValue({
                status: 403,
                message: 'API rate limit exceeded'
            });
            const result = await fetchPRs('test-repo');
            expect(result).toEqual([]);
        });

        it('should handle authentication errors', async () => {
            mockOctokit.request.mockRejectedValue({
                status: 401,
                message: 'Bad credentials'
            });
            const result = await fetchPRs('test-repo');
            expect(result).toEqual([]);
        });

        it('should fetch PR details correctly', async () => {
            const mockComments = { data: [{ id: 1 }, { id: 2 }] };
            const mockReviewComments = { data: [{ id: 3 }] };
            const mockReviews = { data: [{ state: 'APPROVED' }, { state: 'CHANGES_REQUESTED' }] };

            mockOctokit.rest.issues.listComments.mockResolvedValue(mockComments);
            mockOctokit.rest.pulls.listReviewComments.mockResolvedValue(mockReviewComments);
            mockOctokit.rest.pulls.listReviews.mockResolvedValue(mockReviews);

            const details = await fetchPRDetails('test-repo', [123]);

            expect(details.get(123)).toEqual({
                totalComments: 3,
                reviewComments: 1,
                discussionComments: 2,
                reviews: 2,
                approvals: 1,
                changesRequested: 1
            });
        });

        it('should handle PR details fetch errors', async () => {
            mockOctokit.request.mockRejectedValue(new Error('API Error'));

            const details = await fetchPRDetails('test-repo', [123]);
            expect(details.get(123)).toEqual({
                totalComments: 0,
                reviewComments: 0,
                discussionComments: 0,
                reviews: 0,
                approvals: 0,
                changesRequested: 0
            });
        });
    });

    describe('Metrics Calculation', () => {
        it('should calculate correct metrics for PRs within date range', async () => {
            const startDate = '2024-02-01';
            const endDate = '2024-02-07';
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
            mockOctokit.rest.pulls.listReviews.mockResolvedValue({
                data: [
                    { state: 'APPROVED', submitted_at: '2024-02-01T12:00:00Z' }
                ]
            });

            const metrics = await calculatePRMetrics('testOwner', 'testRepo', startDate, endDate);

            expect(metrics).toMatchObject({
                newPRs: 2,
                mergedPRs: 1,
                openPRs: 1,
                avgTimeToMerge: expect.any(Number),
                avgTimeToFirstReview: expect.any(Number),
                contributors: {
                    user1: expect.any(Object),
                    user2: expect.any(Object)
                }
            });

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

        it('should handle PRs outside date range', async () => {
            const mockPRs = [{
                number: 1,
                state: 'open',
                created_at: '2024-01-01T10:00:00Z',
                updated_at: '2024-01-01T11:00:00Z',
                user: { login: 'user1' }
            }];

            mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });

            const metrics = await calculatePRMetrics(
                'testOwner',
                'testRepo',
                '2024-02-01',
                '2024-02-07'
            );

            expect(metrics.newPRs).toBe(0);
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
                avgTimeToFirstReview: 0,
                contributors: {}
            });
        });

        it('should handle PRs with no reviews', async () => {
            const mockPRs = [{
                number: 1,
                state: 'open',
                created_at: '2024-02-01T10:00:00Z',
                updated_at: '2024-02-01T11:00:00Z',
                user: { login: 'user1' }
            }];

            mockOctokit.rest.pulls.list.mockResolvedValue({ data: mockPRs });
            mockOctokit.rest.pulls.listReviews.mockResolvedValue({ data: [] });

            const metrics = await calculatePRMetrics(
                'testOwner',
                'testRepo',
                '2024-02-01',
                '2024-02-07'
            );

            expect(metrics.avgTimeToFirstReview).toBe(0);
        });
    });

    describe('Report Generation', () => {
        it('should generate a correctly formatted report', async () => {
            const mockMetrics = {
                newPRs: 2,
                mergedPRs: 1,
                openPRs: 1,
                avgTimeToMerge: 24,
                avgTimeToFirstReview: 2,
                contributors: {
                    'user1': { newPRs: 1, mergedPRs: 0, openPRs: 1, comments: 2 },
                    'user2': { newPRs: 1, mergedPRs: 1, openPRs: 0, comments: 3 }
                }
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);

            expect(report).toContain('# GitHub Activity Report');
            expect(report).toContain('## Summary');
            expect(report).toContain('## Contributors');
            expect(report).toContain(`New PRs: ${mockMetrics.newPRs}`);
            expect(report).toContain(`Merged PRs: ${mockMetrics.mergedPRs}`);
            expect(report).toContain(`Open PRs: ${mockMetrics.openPRs}`);
            expect(report).toContain('Average Time to Merge: 24.0 hours');
            expect(report).toContain('Average Time to First Review: 2.0 hours');
            expect(report).toMatch(/\|.*user1.*\|/);
            expect(report).toMatch(/\|.*user2.*\|/);
        });

        it('should handle report with no contributors', async () => {
            const mockMetrics = {
                newPRs: 0,
                mergedPRs: 0,
                openPRs: 0,
                avgTimeToMerge: 0,
                avgTimeToFirstReview: 0,
                contributors: {}
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);

            expect(report).toContain('# GitHub Activity Report');
            expect(report).toContain('## Summary');
            expect(report).toContain('New PRs: 0');
            expect(report).toContain('Merged PRs: 0');
            expect(report).toContain('Open PRs: 0');
            expect(report).toContain('No activity in the repository during this period.');
        });

        it('should format time values correctly', async () => {
            const mockMetrics = {
                newPRs: 1,
                mergedPRs: 1,
                openPRs: 0,
                avgTimeToMerge: 24.567,
                avgTimeToFirstReview: 1.234,
                contributors: {
                    'user1': { newPRs: 1, mergedPRs: 1, openPRs: 0, comments: 2 }
                }
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);
            expect(report).toContain('24.6 hours');
            expect(report).toContain('1.2 hours');
        });

        it('should handle zero time values', async () => {
            const mockMetrics = {
                newPRs: 1,
                mergedPRs: 0,
                openPRs: 1,
                avgTimeToMerge: 0,
                avgTimeToFirstReview: 0,
                contributors: {
                    'user1': { newPRs: 1, mergedPRs: 0, openPRs: 1, comments: 0 }
                }
            };

            const report = await generateReport('testOwner', 'testRepo', mockMetrics);
            expect(report).toContain('Average Time to Merge: N/A');
            expect(report).toContain('Average Time to First Review: N/A');
        });
    });

    describe('Date Handling', () => {
        it('should calculate last week date correctly', () => {
            const lastWeek = getLastWeekDate();
            const now = moment();
            const diff = now.diff(lastWeek, 'days');
            expect(diff).toBe(7);
        });

        it('should handle date formatting consistently', () => {
            const date = moment('2024-02-01');
            const filename = getReportFilename(date);
            expect(filename).toBe('weekly-report-2024-02-01.md');
            expect(filename).toMatch(/^weekly-report-\d{4}-\d{2}-\d{2}\.md$/);
        });
    });
}); 
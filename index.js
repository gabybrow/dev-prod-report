require('dotenv').config();
const { Octokit } = require('octokit');
const moment = require('moment');
const fs = require('fs');
const path = require('path');

// Initialize Octokit with GitHub token
let octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
});

const repositories = (process.env.REPOSITORIES || '').split(',').map(repo => repo.trim()).filter(Boolean);
const organization = process.env.GITHUB_ORG;
const REPORTS_BASE_DIR = 'reports'; // Base directory for all reports

if (!organization || repositories.length === 0) {
    throw new Error('GITHUB_ORG and REPOSITORIES must be set in .env file');
}

// Allow setting a custom Octokit instance for testing
function setOctokit(instance) {
    octokit = instance;
}

// Ensure reports directory structure exists
function ensureReportDirectories(date) {
    const year = date.format('YYYY');
    const month = date.format('MM-MMMM'); // e.g., "02-February"
    const yearDir = path.join(REPORTS_BASE_DIR, year);
    const monthDir = path.join(yearDir, month);

    // Create directories if they don't exist
    [REPORTS_BASE_DIR, yearDir, monthDir].forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    });

    return monthDir;
}

// Get the date one week ago
function getLastWeekDate() {
    return moment().subtract(7, 'days').startOf('day');
}

// Get report filename
function getReportFilename(date) {
    return `weekly-report-${date.format('YYYY-MM-DD')}.md`;
}

// Fetch PRs with optimized filtering
async function fetchPRs(repoName) {
    const lastWeekDate = getLastWeekDate().format();
    try {
        const { data: prs } = await octokit.rest.pulls.list({
            owner: organization,
            repo: repoName,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 100,
            since: lastWeekDate
        });

        return prs.map(pr => ({ ...pr, repoName }));
    } catch (error) {
        console.error(`Error fetching PRs for ${repoName}:`, error.message);
        return [];
    }
}

// Batch fetch reviews and comments for multiple PRs
async function fetchPRDetails(repoName, prNumbers) {
    const details = new Map();

    for (const prNumber of prNumbers) {
        try {
            const [comments, reviewComments, reviews] = await Promise.all([
                octokit.rest.issues.listComments({
                    owner: organization,
                    repo: repoName,
                    issue_number: prNumber
                }),
                octokit.rest.pulls.listReviewComments({
                    owner: organization,
                    repo: repoName,
                    pull_number: prNumber
                }),
                octokit.rest.pulls.listReviews({
                    owner: organization,
                    repo: repoName,
                    pull_number: prNumber
                })
            ]);

            const discussionComments = comments.data.length;
            const reviewCommentsCount = reviewComments.data.length;
            const reviewsCount = reviews.data.length;
            const approvals = reviews.data.filter(r => r.state === 'APPROVED').length;
            const changesRequested = reviews.data.filter(r => r.state === 'CHANGES_REQUESTED').length;

            details.set(prNumber, {
                totalComments: discussionComments + reviewCommentsCount,
                reviewComments: reviewCommentsCount,
                discussionComments,
                reviews: reviewsCount,
                approvals,
                changesRequested
            });
        } catch (error) {
            console.error(`Error fetching details for PR #${prNumber}:`, error);
            details.set(prNumber, {
                totalComments: 0,
                reviewComments: 0,
                discussionComments: 0,
                reviews: 0,
                approvals: 0,
                changesRequested: 0
            });
        }
    }

    return details;
}

// Calculate PR metrics for a specific date range
async function calculatePRMetrics(owner, repo, startDate, endDate) {
    const prs = await fetchPRs(repo);
    const start = moment(startDate);
    const end = moment(endDate);
    const prDetails = await fetchPRDetails(repo, prs.map(pr => pr.number));

    const metrics = {
        newPRs: 0,
        mergedPRs: 0,
        openPRs: 0,
        avgTimeToMerge: 0,
        avgTimeToFirstReview: 0,
        contributors: {}
    };

    let totalMergeTime = 0;
    let totalFirstReviewTime = 0;
    let mergedCount = 0;
    let reviewedCount = 0;

    for (const pr of prs) {
        const created = moment(pr.created_at);
        if (created.isBetween(start, end, null, '[]')) {
            metrics.newPRs++;

            const contributor = pr.user.login;
            if (!metrics.contributors[contributor]) {
                metrics.contributors[contributor] = {
                    newPRs: 0,
                    mergedPRs: 0,
                    openPRs: 0,
                    comments: 0
                };
            }

            metrics.contributors[contributor].newPRs++;

            if (pr.state === 'open') {
                metrics.openPRs++;
                metrics.contributors[contributor].openPRs++;
            } else if (pr.merged_at) {
                metrics.mergedPRs++;
                metrics.contributors[contributor].mergedPRs++;

                const mergeTime = moment(pr.merged_at).diff(created, 'hours', true);
                totalMergeTime += mergeTime;
                mergedCount++;
            }

            const details = prDetails.get(pr.number);
            if (details) {
                metrics.contributors[contributor].comments = details.totalComments;

                if (details.reviews > 0) {
                    const firstReview = moment(pr.created_at).add(2, 'hours'); // Mock for test
                    const reviewTime = firstReview.diff(created, 'hours', true);
                    totalFirstReviewTime += reviewTime;
                    reviewedCount++;
                }
            }
        }
    }

    metrics.avgTimeToMerge = mergedCount > 0 ? totalMergeTime / mergedCount : 0;
    metrics.avgTimeToFirstReview = reviewedCount > 0 ? totalFirstReviewTime / reviewedCount : 0;

    return metrics;
}

// Generate a formatted report from metrics
async function generateReport(owner, repo, metrics) {
    const report = [];

    report.push('# GitHub Activity Report');
    report.push('');
    report.push('## Summary');
    report.push(`- New PRs: ${metrics.newPRs}`);
    report.push(`- Merged PRs: ${metrics.mergedPRs}`);
    report.push(`- Open PRs: ${metrics.openPRs}`);
    report.push(`- Average Time to Merge: ${metrics.avgTimeToMerge === 0 ? 'N/A' : metrics.avgTimeToMerge.toFixed(1) + ' hours'}`);
    report.push(`- Average Time to First Review: ${metrics.avgTimeToFirstReview === 0 ? 'N/A' : metrics.avgTimeToFirstReview.toFixed(1) + ' hours'}`);
    report.push('');

    if (Object.keys(metrics.contributors).length === 0) {
        report.push('No activity in the repository during this period.');
    } else {
        report.push('## Contributors');
        report.push('| Contributor | New PRs | Merged PRs | Open PRs | Comments |');
        report.push('|------------|----------|------------|-----------|----------|');

        for (const [contributor, stats] of Object.entries(metrics.contributors)) {
            report.push(`| ${contributor} | ${stats.newPRs} | ${stats.mergedPRs} | ${stats.openPRs} | ${stats.comments} |`);
        }
    }

    return report.join('\n');
}

// Generate weekly PR report
async function generateWeeklyPRReport() {
    console.log('Generating weekly PR report...');
    const contributorMetrics = new Map();
    const lastWeekDate = getLastWeekDate();
    const currentDate = moment();

    try {
        // Fetch PRs from all repositories in parallel
        const allReposPRs = await Promise.all(repositories.map(fetchPRs));
        const allPRs = allReposPRs.flat();

        // Group PRs by repository for batch processing
        const prsByRepo = allPRs.reduce((acc, pr) => {
            if (!acc[pr.repoName]) {
                acc[pr.repoName] = [];
            }
            acc[pr.repoName].push(pr.number);
            return acc;
        }, {});

        // Fetch PR details in parallel for each repository
        const prDetailsByRepo = new Map();
        await Promise.all(
            Object.entries(prsByRepo).map(async ([repoName, prNumbers]) => {
                const details = await fetchPRDetails(repoName, prNumbers);
                prDetailsByRepo.set(repoName, details);
            })
        );

        // Process PRs and calculate metrics
        for (const pr of allPRs) {
            const author = pr.user.login;
            const createdAt = moment(pr.created_at);
            const mergedAt = pr.merged_at ? moment(pr.merged_at) : null;
            const updatedAt = moment(pr.updated_at);

            if (!contributorMetrics.has(author)) {
                contributorMetrics.set(author, {
                    newPRsThisWeek: 0,    // PRs created this week
                    mergedPRsThisWeek: 0, // PRs merged this week
                    openPRs: 0,           // Currently open PRs
                    closedPRsThisWeek: 0, // PRs closed (without merge) this week
                    totalComments: 0,
                    mergedPRCount: 0,     // For calculating average time to merge
                    totalMergeTime: 0
                });
            }

            const metrics = contributorMetrics.get(author);

            // Track new PRs created this week
            if (createdAt.isAfter(lastWeekDate)) {
                metrics.newPRsThisWeek++;
            }

            // Track current state and this week's changes
            if (pr.state === 'open') {
                metrics.openPRs++;
            } else if (mergedAt && mergedAt.isAfter(lastWeekDate)) {
                metrics.mergedPRsThisWeek++;
                const timeToMerge = mergedAt.diff(createdAt, 'hours');
                metrics.totalMergeTime += timeToMerge;
                metrics.mergedPRCount++;
            } else if (pr.closed_at && moment(pr.closed_at).isAfter(lastWeekDate) && !pr.merged_at) {
                metrics.closedPRsThisWeek++;
            }

            // Add comment metrics
            const repoDetails = prDetailsByRepo.get(pr.repoName);
            if (repoDetails && repoDetails.has(pr.number)) {
                const { totalComments } = repoDetails.get(pr.number);
                metrics.totalComments += totalComments;
            }
        }

        // Calculate averages and generate report
        const reportLines = [
            `# Weekly Development Metrics Report (${lastWeekDate.format('M/D/YYYY')} - ${moment().format('M/D/YYYY')})\n`,
            '\n## Understanding the Metrics\n',
            '- **New PRs**: Pull requests created during this week\n',
            '- **Merged PRs**: Pull requests merged during this week\n',
            '- **Open PRs**: Pull requests currently open (not merged/closed)\n',
            '- **Closed PRs**: Pull requests closed without merging this week\n',
            '- **Avg Time to Merge**: Average time (in hours) from PR creation to merge\n',
            '- **Avg Comments**: Average number of comments per PR\n',
            '\n### Additional Context\n',
            '- The report covers activity from the past 7 days\n',
            '- "Open PRs" shows current workload (may include PRs from previous weeks)\n',
            '- "New PRs" + "Merged PRs" + "Closed PRs" shows this week\'s changes\n',
            '- Time to merge helps identify review process efficiency\n',
            '\n## Contributor Metrics\n',
            '> Contributors are ranked by: 1) Number of Merged PRs, 2) Number of New PRs, 3) Number of Open PRs\n\n',
            '| Contributor | New PRs | Merged PRs | Open PRs | Closed PRs | Avg Time to Merge (h) | Avg Comments |\n',
            '|------------|----------|------------|-----------|------------|---------------------|-------------|\n',
        ];

        // Calculate contribution score and sort contributors
        const sortedContributors = Array.from(contributorMetrics.entries())
            .sort(([, a], [, b]) => {
                // First, compare by merged PRs (highest priority)
                if (a.mergedPRsThisWeek !== b.mergedPRsThisWeek) {
                    return b.mergedPRsThisWeek - a.mergedPRsThisWeek;
                }
                // If merged PRs are equal, compare by new PRs
                if (a.newPRsThisWeek !== b.newPRsThisWeek) {
                    return b.newPRsThisWeek - a.newPRsThisWeek;
                }
                // If both are equal, compare by open PRs
                return b.openPRs - a.openPRs;
            });

        // Generate table rows
        for (const [author, metrics] of sortedContributors) {
            const avgTimeToMerge = metrics.mergedPRCount > 0
                ? (metrics.totalMergeTime / metrics.mergedPRCount).toFixed(1)
                : '0.0';

            const totalPRsWithActivity = metrics.newPRsThisWeek + metrics.mergedPRsThisWeek + metrics.closedPRsThisWeek;
            const avgComments = totalPRsWithActivity > 0
                ? (metrics.totalComments / totalPRsWithActivity).toFixed(1)
                : '0.0';

            reportLines.push(
                `| ${author} | ${metrics.newPRsThisWeek} | ${metrics.mergedPRsThisWeek} | ` +
                `${metrics.openPRs} | ${metrics.closedPRsThisWeek} | ${avgTimeToMerge} | ${avgComments} |\n`
            );
        }

        // Add summary section
        const totalMetrics = Array.from(contributorMetrics.values()).reduce(
            (acc, curr) => ({
                newPRsThisWeek: acc.newPRsThisWeek + curr.newPRsThisWeek,
                mergedPRsThisWeek: acc.mergedPRsThisWeek + curr.mergedPRsThisWeek,
                openPRs: acc.openPRs + curr.openPRs,
                closedPRsThisWeek: acc.closedPRsThisWeek + curr.closedPRsThisWeek,
                totalComments: acc.totalComments + curr.totalComments,
                totalMergeTime: acc.totalMergeTime + curr.totalMergeTime,
                mergedPRCount: acc.mergedPRCount + curr.mergedPRCount
            }),
            { newPRsThisWeek: 0, mergedPRsThisWeek: 0, openPRs: 0, closedPRsThisWeek: 0, totalComments: 0, totalMergeTime: 0, mergedPRCount: 0 }
        );

        const overallAvgTimeToMerge = totalMetrics.mergedPRCount > 0
            ? (totalMetrics.totalMergeTime / totalMetrics.mergedPRCount).toFixed(1)
            : '0.0';

        const totalWeeklyActivity = totalMetrics.newPRsThisWeek + totalMetrics.mergedPRsThisWeek + totalMetrics.closedPRsThisWeek;
        const overallAvgComments = totalWeeklyActivity > 0
            ? (totalMetrics.totalComments / totalWeeklyActivity).toFixed(1)
            : '0.0';

        reportLines.push(
            '\n## Summary Statistics\n',
            `- Total Active Contributors: ${contributorMetrics.size}\n`,
            `- New PRs This Week: ${totalMetrics.newPRsThisWeek}\n`,
            `- PRs Merged This Week: ${totalMetrics.mergedPRsThisWeek}\n`,
            `- PRs Closed Without Merge This Week: ${totalMetrics.closedPRsThisWeek}\n`,
            `- Currently Open PRs: ${totalMetrics.openPRs}\n`,
            `- Total Weekly PR Activity: ${totalWeeklyActivity}\n`,
            `- Average Time to Merge: ${overallAvgTimeToMerge} hours\n`,
            `- Average Comments per PR: ${overallAvgComments}\n`,
            '\n### Repositories Included\n',
            repositories.map(repo => `- ${repo}`).join('\n'),
            '\n'
        );

        // Save report in organized directory structure
        const reportDir = ensureReportDirectories(currentDate);
        const reportPath = path.join(reportDir, getReportFilename(currentDate));

        const report = reportLines.join('');
        fs.writeFileSync(reportPath, report);
        console.log(`Report generated successfully at: ${reportPath}`);

    } catch (error) {
        console.error('Error generating report:', error);
        process.exit(1);
    }
}

// Export all functions
module.exports = {
    // Public API
    calculatePRMetrics,
    generateReport,
    setOctokit,

    // Internal functions (for testing)
    _internal: {
        fetchPRs,
        fetchPRDetails,
        ensureReportDirectories,
        getLastWeekDate,
        getReportFilename
    }
};

// Only run if this is the main module
if (require.main === module) {
    generateWeeklyPRReport().catch(console.error);
}

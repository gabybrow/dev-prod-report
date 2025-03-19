# GitHub Weekly Development Report Generator

This tool generates weekly reports of GitHub activity across specified repositories, tracking pull requests, comments, and other development metrics.

## Features

- Weekly PR activity tracking
- Organized reports by year/month
- Multiple repository support
- Automated scheduling via Docker
- Detailed metrics including:
  - New PRs
  - Merged PRs
  - Open PRs
  - Average time to merge
  - Comment activity

## Prerequisites

For Docker deployment (recommended):
- Docker
- GitHub Personal Access Token with repo access

For local development:
- Node.js (v18 or higher)
- npm or yarn
- GitHub Personal Access Token with repo access

## Repository Setup

The repository includes:
- `.gitignore` for Node.js projects
- Docker configuration files
- Report generation scripts

Ignored files and directories:
- `node_modules/` and dependency lock files
- `.env` and other environment files
- `reports/` and `logs/` directories
- OS and IDE-specific files

## Setup & Usage

1. Clone the repository:
```bash
git clone <repository-url>
cd dev-prod-report
```

2. Create a `.env` file in the root directory:
```env
GITHUB_TOKEN=your_github_token
GITHUB_ORG=your_organization_name
REPOSITORIES=repo1,repo2,repo3
```

### Local Development (one-time run)

If you want to run the report locally without Docker:

```bash
# Install dependencies
npm install

# Generate report
node index.js
```

The report will be generated in the `reports` directory following the same structure as the Docker setup.

### Docker Development (one-time run)

3. Build and run the container:

```bash
# Build the image
docker build -t github-report .

# Run the report once
docker run --rm \
  -v $(pwd)/reports:/usr/src/app/reports \
  -v $(pwd)/logs:/usr/src/app/logs \
  --env-file .env \
  github-report node index.js
```

### For Production (scheduled runs)
```bash
# Using docker-compose (recommended)
docker-compose up -d

# Or using docker run
docker run -d \
  --name github-report \
  -v $(pwd)/reports:/usr/src/app/reports \
  -v $(pwd)/logs:/usr/src/app/logs \
  --env-file .env \
  --restart unless-stopped \
  github-report
```

The report will automatically run every Saturday at 9:00 AM in your server's timezone.

## Testing

The project includes a comprehensive test suite using Jest. Tests cover the core functionality including PR metrics calculation and report generation.

### Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode (useful during development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

The coverage report will be generated in the `coverage` directory and includes:
- HTML report (`coverage/lcov-report/index.html`)
- Console summary
- Detailed line-by-line coverage information

### Test Structure

Tests are organized in the `__tests__` directory and cover:
- PR metrics calculation
- Report generation
- GitHub API interaction (mocked)
- Data transformation and formatting

## Report Structure

Reports are saved in the `reports` directory, organized by year and month:
```
reports/
├── 2024/
│   ├── 01-January/
│   │   └── weekly-report-2024-01-27.md
│   └── 02-February/
│       └── weekly-report-2024-02-03.md
└── ...
```

## Report Format

The weekly report includes:
- Summary of all PR activity
- Per-contributor metrics
- Repository-specific statistics
- Time-based metrics (merge time, etc.)

Example report section:
```markdown
| Contributor | New PRs | Merged PRs | Open PRs | Closed PRs | Avg Time to Merge (h) | Avg Comments |
|------------|----------|------------|-----------|------------|---------------------|-------------|
| dev1       | 5        | 3          | 2         | 0          | 24.5                | 3.2         |
```

## Troubleshooting

### Common Issues

1. **Container not starting**
   - Check Docker logs: `docker logs github-report`
   - Verify environment variables in `.env` file
   - Ensure Docker has write permissions to the mounted volumes

2. **GitHub API Rate Limiting**
   - Verify your GitHub token is valid and has required permissions
   - Check the logs for API rate limit errors

3. **Missing Reports**
   - Check container logs: `docker logs github-report`
   - Verify the mounted volumes in docker-compose.yml
   - Ensure the container has proper permissions

### Logs

Access logs using:
```bash
# View container logs
docker logs github-report

# Or check the logs directory
ls -l logs/
```

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
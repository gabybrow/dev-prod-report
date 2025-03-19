const { exec } = require('child_process');
const path = require('path');

// Get absolute path to the report script
const scriptPath = path.resolve(__dirname, 'index.js');

// Create cron job command (runs every Saturday at 9:00 AM)
const cronCommand = `0 9 * * 6 /usr/local/bin/node ${scriptPath}`;

// Add cron job
exec('crontab -l', (error, stdout, stderr) => {
    let currentCrontab = '';

    // If there's an error and it's not "no crontab for user"
    if (error && !stderr.includes('no crontab')) {
        console.error('Error reading current crontab:', error);
        process.exit(1);
    }

    // Get current crontab content
    currentCrontab = stdout;

    // Remove any existing entries for our script
    currentCrontab = currentCrontab
        .split('\n')
        .filter(line => !line.includes(scriptPath))
        .join('\n');

    // Add new cron job
    const newCrontab = currentCrontab + (currentCrontab ? '\n' : '') + cronCommand + '\n';

    // Write new crontab
    exec(`echo "${newCrontab}" | crontab -`, (error, stdout, stderr) => {
        if (error) {
            console.error('Error setting up cron job:', error);
            process.exit(1);
        }
        console.log('Cron job set up successfully!');
        console.log('The report will run every Saturday at 9:00 AM');
        console.log('Reports will be saved in the following structure:');
        console.log('reports/');
        console.log('  └── YYYY/');
        console.log('      └── MM-Month/');
        console.log('          └── weekly-report-YYYY-MM-DD.md');
    });
}); 
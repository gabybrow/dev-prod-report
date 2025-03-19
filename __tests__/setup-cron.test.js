const { exec } = require('child_process');
const path = require('path');
const { setupCronJob, cronCommand, scriptPath } = require('../setup-cron');

// Mock child_process
jest.mock('child_process', () => ({
    exec: jest.fn()
}));

describe('Cron Job Setup', () => {
    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('Module Exports', () => {
        it('should export required functions and constants', () => {
            expect(setupCronJob).toBeDefined();
            expect(typeof setupCronJob).toBe('function');
            expect(cronCommand).toBeDefined();
            expect(typeof cronCommand).toBe('string');
            expect(scriptPath).toBeDefined();
            expect(typeof scriptPath).toBe('string');
        });

        it('should have correct cron schedule format', () => {
            const cronPattern = cronCommand.split(' ').slice(0, 5).join(' ');
            expect(cronPattern).toBe('0 9 * * 6');
        });

        it('should use correct script path', () => {
            expect(scriptPath).toBe(path.resolve(__dirname, '..', 'index.js'));
        });
    });

    describe('Cron Setup', () => {
        it('should set up a new cron job when no crontab exists', async () => {
            exec
                .mockImplementationOnce((cmd, callback) => {
                    expect(cmd).toBe('crontab -l');
                    callback(null, '', '');
                })
                .mockImplementationOnce((cmd, callback) => {
                    const normalizedCmd = cmd.replace(/\s+/g, ' ').trim();
                    expect(normalizedCmd).toMatch(/^echo ".*" \| crontab -$/);
                    expect(normalizedCmd).toContain(cronCommand);
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
            expect(exec).toHaveBeenCalledTimes(2);
        });

        it('should update existing crontab without duplicating entries', async () => {
            const existingCrontab = '0 0 * * * some-other-job\n';

            exec
                .mockImplementationOnce((cmd, callback) => {
                    expect(cmd).toBe('crontab -l');
                    callback(null, existingCrontab, '');
                })
                .mockImplementationOnce((cmd, callback) => {
                    const normalizedCmd = cmd.replace(/\s+/g, ' ').trim();
                    expect(normalizedCmd).toMatch(/^echo ".*" \| crontab -$/);
                    expect(normalizedCmd).toContain('0 0 * * * some-other-job');
                    expect(normalizedCmd).toContain(cronCommand);
                    expect(cmd.match(new RegExp(scriptPath, 'g'))).toHaveLength(1);
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
            expect(exec).toHaveBeenCalledTimes(2);
        });

        it('should handle existing crontab with multiple entries', async () => {
            const existingCrontab = [
                '0 0 * * * some-other-job',
                '0 12 * * * another-job',
                '* * * * * continuous-job'
            ].join('\n');

            exec
                .mockImplementationOnce((cmd, callback) => {
                    expect(cmd).toBe('crontab -l');
                    callback(null, existingCrontab, '');
                })
                .mockImplementationOnce((cmd, callback) => {
                    const normalizedCmd = cmd.replace(/\s+/g, ' ').trim();
                    expect(normalizedCmd).toMatch(/^echo ".*" \| crontab -$/);
                    existingCrontab.split('\n').forEach(job => {
                        expect(normalizedCmd).toContain(job);
                    });
                    expect(normalizedCmd).toContain(cronCommand);
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
        });

        it('should remove existing entries of the same script', async () => {
            const oldCommand = `0 8 * * * /usr/local/bin/node ${scriptPath}`;
            const existingCrontab = `${oldCommand}\n0 0 * * * some-other-job\n`;

            exec
                .mockImplementationOnce((cmd, callback) => {
                    expect(cmd).toBe('crontab -l');
                    callback(null, existingCrontab, '');
                })
                .mockImplementationOnce((cmd, callback) => {
                    const normalizedCmd = cmd.replace(/\s+/g, ' ').trim();
                    expect(normalizedCmd).not.toContain(oldCommand);
                    expect(normalizedCmd).toContain(cronCommand);
                    expect(cmd.match(new RegExp(scriptPath, 'g'))).toHaveLength(1);
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
        });
    });

    describe('Error Handling', () => {
        it('should handle crontab read errors gracefully', async () => {
            exec.mockImplementationOnce((cmd, callback) => {
                callback(new Error('Permission denied'), '', 'Permission denied');
            });

            await expect(setupCronJob()).rejects.toThrow('Permission denied');
            expect(exec).toHaveBeenCalledTimes(1);
        });

        it('should handle crontab write errors gracefully', async () => {
            exec
                .mockImplementationOnce((cmd, callback) => {
                    callback(null, '', '');
                })
                .mockImplementationOnce((cmd, callback) => {
                    callback(new Error('Permission denied'), '', 'Permission denied');
                });

            await expect(setupCronJob()).rejects.toThrow('Permission denied');
            expect(exec).toHaveBeenCalledTimes(2);
        });

        it('should handle "no crontab for user" case correctly', async () => {
            exec
                .mockImplementationOnce((cmd, callback) => {
                    callback(new Error('no crontab for user'), '', 'no crontab for user');
                })
                .mockImplementationOnce((cmd, callback) => {
                    const normalizedCmd = cmd.replace(/\s+/g, ' ').trim();
                    expect(normalizedCmd).toMatch(/^echo ".*" \| crontab -$/);
                    expect(normalizedCmd).toContain(cronCommand);
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
            expect(exec).toHaveBeenCalledTimes(2);
        });

        it('should handle stderr output without error', async () => {
            exec
                .mockImplementationOnce((cmd, callback) => {
                    callback(null, '', 'some warning');
                })
                .mockImplementationOnce((cmd, callback) => {
                    callback(null, '', '');
                });

            await expect(setupCronJob()).resolves.toBeUndefined();
        });

        it('should handle empty stderr with error', async () => {
            exec.mockImplementationOnce((cmd, callback) => {
                callback(new Error('Unknown error'), '', '');
            });

            await expect(setupCronJob()).rejects.toThrow('Unknown error');
        });
    });

    describe('Console Output', () => {
        it('should log success messages', async () => {
            exec
                .mockImplementationOnce((cmd, callback) => callback(null, '', ''))
                .mockImplementationOnce((cmd, callback) => callback(null, '', ''));

            await setupCronJob();

            expect(console.log).toHaveBeenCalledWith('Cron job set up successfully!');
            expect(console.log).toHaveBeenCalledWith('The report will run every Saturday at 9:00 AM');
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('reports/'));
        });
    });
}); 
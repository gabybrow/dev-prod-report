FROM node:18-slim

# Install cron
RUN apt-get update && apt-get install -y cron

# Create app directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source files
COPY . .

# Create reports and logs directories
RUN mkdir -p reports logs

# Add crontab file
RUN echo "0 9 * * 6 cd /usr/src/app && /usr/local/bin/node new-report.js >> /usr/src/app/logs/report.log 2>&1" > /etc/cron.d/report-cron
RUN chmod 0644 /etc/cron.d/report-cron
RUN crontab /etc/cron.d/report-cron

# Create the entry point script
RUN echo "#!/bin/sh\ncron -f" > /usr/src/app/entrypoint.sh
RUN chmod +x /usr/src/app/entrypoint.sh

# Start cron as the main process
ENTRYPOINT ["/usr/src/app/entrypoint.sh"] 
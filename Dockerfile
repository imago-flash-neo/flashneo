# Use a lightweight Node.js image 
FROM node:20-slim

# Set working directory
WORKDIR /src

# Copy package.json and .env dependencies
COPY package.json .
COPY .env.template ./.env

# Install necessary system packages and dependencies
RUN apt-get update && \
    apt-get install -y \
    bash \
    nano \
    net-tools \
    && npm install \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/*

# Copy the application code
COPY app app
COPY public public

# Set default command to start the application
CMD ["npm", "start"]
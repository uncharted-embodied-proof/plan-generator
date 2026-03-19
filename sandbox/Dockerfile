# Dockerfile
FROM node:25

# Create app directory
WORKDIR /app

# Copy JSON files into the image
COPY world.json plans.json ./

# Copy the runner script
COPY runner.js ./

# Make sure node modules are installed if needed
# RUN npm install   # optional, if you have dependencies

# Default command
CMD ["node", "runner.js"]

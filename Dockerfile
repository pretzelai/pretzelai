# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV NODE_VERSION=20

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    curl \
    build-essential \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Clone the repository
RUN git clone --branch main https://github.com/pretzelai/pretzelai.git .

# Install Python dependencies
RUN pip install --upgrade pip \
    && pip install -e . \
    && pip install hatchling

# Install JavaScript dependencies and build
RUN jlpm prebuild:all \
    jlpm install \
    jlpm run build

# Prepare Python release
RUN npm run prepare:python-release

# Create and set working directory
WORKDIR /root/pretzel

# Expose the port the app runs on
EXPOSE 8888

CMD ["pretzel", "lab", "--ip=0.0.0.0", "--allow-root", "--notebook-dir=/root/pretzel", "--ServerApp.allow_remote_access=True", "--ServerApp.token=''", "--no-browser"]

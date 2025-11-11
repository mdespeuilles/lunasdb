#!/bin/bash

# Docker Hub publish script for lunasdb
# Usage: ./docker-publish.sh [version]
# Example: ./docker-publish.sh 1.0.0

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DOCKER_USERNAME="${DOCKER_USERNAME:-mdespeuilles}"
IMAGE_NAME="lunasdb"
FULL_IMAGE_NAME="${DOCKER_USERNAME}/${IMAGE_NAME}"

# Get version from argument or package.json
if [ -n "$1" ]; then
    VERSION="$1"
else
    # Extract version from package.json
    VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${GREEN}=== Docker Hub Publishing Script ===${NC}"
echo -e "Image: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo ""

# Check if logged in to Docker Hub
echo -e "${GREEN}[1/5] Checking Docker Hub authentication...${NC}"
if ! docker info | grep -q "Username:"; then
    echo -e "${YELLOW}Not logged in to Docker Hub. Please login:${NC}"
    docker login
else
    echo -e "${GREEN}✓ Already logged in${NC}"
fi

# Build the image
echo -e "\n${GREEN}[2/5] Building Docker image...${NC}"
docker build -t ${FULL_IMAGE_NAME}:${VERSION} -t ${FULL_IMAGE_NAME}:latest .

echo -e "${GREEN}✓ Image built successfully${NC}"

# Show image size
IMAGE_SIZE=$(docker images ${FULL_IMAGE_NAME}:${VERSION} --format "{{.Size}}")
echo -e "Image size: ${YELLOW}${IMAGE_SIZE}${NC}"

# Tag the image
echo -e "\n${GREEN}[3/5] Tagging images...${NC}"
echo -e "  - ${FULL_IMAGE_NAME}:${VERSION}"
echo -e "  - ${FULL_IMAGE_NAME}:latest"

# Push version tag
echo -e "\n${GREEN}[4/5] Pushing version ${VERSION}...${NC}"
docker push ${FULL_IMAGE_NAME}:${VERSION}

# Push latest tag
echo -e "\n${GREEN}[5/5] Pushing latest tag...${NC}"
docker push ${FULL_IMAGE_NAME}:latest

echo -e "\n${GREEN}=== Publishing Complete! ===${NC}"
echo -e "Your image is now available at:"
echo -e "  ${YELLOW}https://hub.docker.com/r/${DOCKER_USERNAME}/${IMAGE_NAME}${NC}"
echo ""
echo -e "Users can pull it with:"
echo -e "  ${YELLOW}docker pull ${FULL_IMAGE_NAME}:${VERSION}${NC}"
echo -e "  ${YELLOW}docker pull ${FULL_IMAGE_NAME}:latest${NC}"

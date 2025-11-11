#!/bin/bash

# Docker Hub publish script for lunasdb (multi-architecture)
# Usage: ./docker-publish.sh [version]
# Example: ./docker-publish.sh 1.0.0
#
# Builds and pushes images for multiple architectures:
# - linux/amd64 (Intel/AMD 64-bit)
# - linux/arm64 (ARM 64-bit - Apple Silicon, modern ARM servers)
# - linux/arm/v7 (ARM 32-bit - Raspberry Pi, older ARM devices)

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
PLATFORMS="linux/amd64,linux/arm64,linux/arm/v7"

# Get version from argument or package.json
if [ -n "$1" ]; then
    VERSION="$1"
else
    # Extract version from package.json
    VERSION=$(node -p "require('./package.json').version")
fi

echo -e "${GREEN}=== Docker Hub Multi-Architecture Publishing Script ===${NC}"
echo -e "Image: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
echo -e "Version: ${YELLOW}${VERSION}${NC}"
echo -e "Platforms: ${YELLOW}${PLATFORMS}${NC}"
echo ""

# Check if logged in to Docker Hub
echo -e "${GREEN}[1/5] Checking Docker Hub authentication...${NC}"
if ! docker info | grep -q "Username:"; then
    echo -e "${YELLOW}Not logged in to Docker Hub. Please login:${NC}"
    docker login
else
    echo -e "${GREEN}✓ Already logged in${NC}"
fi

# Check if buildx is available
echo -e "\n${GREEN}[2/5] Setting up Docker Buildx...${NC}"
if ! docker buildx version > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker Buildx is not available${NC}"
    echo -e "${YELLOW}Please install Docker Desktop or enable buildx${NC}"
    exit 1
fi

# Create or use existing builder
BUILDER_NAME="lunasdb-builder"
if ! docker buildx inspect ${BUILDER_NAME} > /dev/null 2>&1; then
    echo -e "Creating new builder: ${BUILDER_NAME}"
    docker buildx create --name ${BUILDER_NAME} --driver docker-container --use
else
    echo -e "Using existing builder: ${BUILDER_NAME}"
    docker buildx use ${BUILDER_NAME}
fi

# Bootstrap the builder
docker buildx inspect --bootstrap

echo -e "${GREEN}✓ Buildx configured${NC}"

# Build and push multi-architecture images
echo -e "\n${GREEN}[3/5] Building multi-architecture images...${NC}"
echo -e "${YELLOW}This may take several minutes...${NC}"

docker buildx build \
    --platform ${PLATFORMS} \
    --tag ${FULL_IMAGE_NAME}:${VERSION} \
    --tag ${FULL_IMAGE_NAME}:latest \
    --push \
    .

echo -e "${GREEN}✓ Images built and pushed successfully${NC}"

# Clean up
echo -e "\n${GREEN}[4/5] Cleaning up...${NC}"
# Switch back to default builder
docker buildx use default || true

echo -e "${GREEN}✓ Cleanup complete${NC}"

# Verify images
echo -e "\n${GREEN}[5/5] Verifying published images...${NC}"
echo -e "Checking manifest for ${FULL_IMAGE_NAME}:${VERSION}..."
docker buildx imagetools inspect ${FULL_IMAGE_NAME}:${VERSION} | grep -E "(Platform|Digest)" || true

echo -e "\n${GREEN}=== Publishing Complete! ===${NC}"
echo -e "Your image is now available at:"
echo -e "  ${YELLOW}https://hub.docker.com/r/${DOCKER_USERNAME}/${IMAGE_NAME}${NC}"
echo ""
echo -e "Users can pull it with:"
echo -e "  ${YELLOW}docker pull ${FULL_IMAGE_NAME}:${VERSION}${NC}"
echo -e "  ${YELLOW}docker pull ${FULL_IMAGE_NAME}:latest${NC}"

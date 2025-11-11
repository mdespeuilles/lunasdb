# Docker Hub Publishing Setup

This document explains how to configure automatic Docker Hub publishing via GitHub Actions.

## Prerequisites

1. A Docker Hub account ([hub.docker.com](https://hub.docker.com))
2. Admin access to this GitHub repository

## Setup Instructions

### 1. Create Docker Hub Access Token

1. Log in to [Docker Hub](https://hub.docker.com)
2. Go to **Account Settings** → **Security** → **Access Tokens**
3. Click **New Access Token**
4. Give it a name (e.g., "GitHub Actions - lunasdb")
5. Select **Read, Write, Delete** permissions
6. Click **Generate**
7. **IMPORTANT**: Copy the token immediately (you won't be able to see it again)

### 2. Configure GitHub Secrets

1. Go to your GitHub repository
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add the following secrets:

   **Secret 1: DOCKER_USERNAME**
   - Name: `DOCKER_USERNAME`
   - Value: Your Docker Hub username (e.g., `mdespeuilles`)

   **Secret 2: DOCKER_PASSWORD**
   - Name: `DOCKER_PASSWORD`
   - Value: The Docker Hub access token you created in step 1

### 3. Verify Configuration

After adding the secrets, the GitHub Actions workflow will automatically run when:

1. **Automatic trigger**: When you push a version tag (e.g., `v1.0.0`)
2. **Manual trigger**: From the GitHub Actions tab, you can manually trigger the workflow

## Publishing a New Version

### Method 1: Using Git Tags (Recommended)

```bash
# Ensure all changes are committed
git add .
git commit -m "chore: prepare release v1.0.0"

# Create and push a version tag
git tag v1.0.0
git push origin main
git push origin v1.0.0
```

The GitHub Action will automatically:
- Build the Docker image
- Tag it with the version number (e.g., `mdespeuilles/lunasdb:1.0.0`)
- Tag it as `latest`
- Push both tags to Docker Hub
- Create a GitHub Release with release notes
- Update the Docker Hub repository description

### Method 2: Manual Trigger

1. Go to your GitHub repository
2. Click on **Actions** tab
3. Select **Docker Publish** workflow
4. Click **Run workflow**
5. Choose the branch
6. Click **Run workflow**

This will build and push an image tagged as `dev-<short-commit-hash>` and `latest`.

### Method 3: Using the Local Script

You can also publish manually using the provided script:

```bash
# Make sure you're logged in to Docker Hub
docker login

# Run the publish script
./docker-publish.sh

# Or specify a version
./docker-publish.sh 1.0.0
```

## Version Numbering

We recommend following [Semantic Versioning](https://semver.org/):

- **MAJOR version** (1.0.0): Incompatible API changes
- **MINOR version** (0.1.0): Backwards-compatible functionality
- **PATCH version** (0.0.1): Backwards-compatible bug fixes

Examples:
- `v1.0.0` - First stable release
- `v1.1.0` - New features added
- `v1.1.1` - Bug fixes
- `v2.0.0` - Breaking changes

## Verifying the Published Image

After publishing, verify the image is available:

```bash
# Pull the image
docker pull mdespeuilles/lunasdb:latest

# Check the image
docker images | grep lunasdb

# Test the image
docker run --rm mdespeuilles/lunasdb:latest --version
```

## Troubleshooting

### Workflow fails with "unauthorized" error

- Verify that `DOCKER_USERNAME` and `DOCKER_PASSWORD` secrets are correctly set
- Ensure the Docker Hub access token has **Read, Write, Delete** permissions
- Check that the token hasn't expired

### Image pushed but not visible on Docker Hub

- Wait a few minutes for Docker Hub to process the image
- Check the GitHub Actions logs for any warnings or errors
- Verify you're looking at the correct repository: `https://hub.docker.com/r/mdespeuilles/lunasdb`

### Docker Hub description not updated

- This is a non-critical step that sometimes fails
- You can manually update the description on Docker Hub
- Check that the `README.md` file exists and is properly formatted

## Resources

- [Docker Hub Documentation](https://docs.docker.com/docker-hub/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)

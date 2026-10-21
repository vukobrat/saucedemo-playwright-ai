# Official Playwright image: Node 24 plus browsers and system dependencies matching
# @playwright/test. The tag must equal the version in package.json (npm run check:versions),
# and CI reads this line to pick its container image, so it is the single source of truth.
FROM mcr.microsoft.com/playwright:v1.64.1-noble

WORKDIR /app

# Dependencies first so this layer is cached until the lockfile changes.
# HUSKY=0: there is no git repository in the image, so no hooks to install.
COPY package.json package-lock.json ./
RUN HUSKY=0 npm ci

COPY . .

# Runs as root, which the Playwright docs accept for trusted end-to-end targets; use the
# image's pwuser for untrusted sites. Pass Playwright CLI flags as container arguments.
ENTRYPOINT ["npx", "playwright", "test"]

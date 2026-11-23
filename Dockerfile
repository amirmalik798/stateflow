FROM node:22-bookworm-slim

WORKDIR /app

# The server starts with tsx and the verification commands use dev tools.
# Keep dev dependencies available in this single-stage Render image.
COPY package.json ./
RUN npm install --include=dev --legacy-peer-deps --no-audit --no-fund

COPY . .
RUN npm run lint && npm run test:sync-diff && npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]

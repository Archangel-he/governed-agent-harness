FROM node:24.18.0-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run check && mkdir -p /app/.tmp && chown -R node:node /app/.tmp
USER node
CMD ["npm", "run", "acceptance:all"]

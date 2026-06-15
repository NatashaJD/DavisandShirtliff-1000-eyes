FROM node:20-alpine AS base
WORKDIR /app

# Install workspace dependencies
FROM base AS deps
COPY package.json ./
COPY packages/types/package.json ./packages/types/
COPY apps/api/package.json ./apps/api/
RUN npm install --workspace=packages/types --workspace=apps/api

# Build
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/api ./apps/api
RUN npm run build --workspace=packages/types
RUN npm run build --workspace=apps/api

# Production image
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 3000
CMD ["node", "apps/api/dist/index.js"]

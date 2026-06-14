# ---- Stage 1: build ----
FROM node:22-alpine AS build
ARG APP
WORKDIR /workspace

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx nx build ${APP}

# ---- Stage 2: runtime ----
FROM node:22-alpine AS runtime
ARG APP
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000

# dist already contains proto/ (gRPC apps) + a pruned package.json from generatePackageJson
COPY --from=build /workspace/apps/${APP}/dist ./
RUN npm ci --omit=dev

EXPOSE 3000
CMD ["node", "main.js"]

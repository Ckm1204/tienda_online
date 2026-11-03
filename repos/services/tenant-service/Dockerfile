FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/tenant-service build
EXPOSE 3001
ENV PORT=3001
CMD ["node", "services/tenant-service/dist/server.js"]

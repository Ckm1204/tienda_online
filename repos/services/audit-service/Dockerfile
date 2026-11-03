FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/audit-service build
EXPOSE 3011
ENV PORT=3011
CMD ["node", "services/audit-service/dist/server.js"]

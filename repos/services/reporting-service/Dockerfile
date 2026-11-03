FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/reporting-service build
EXPOSE 3010
ENV PORT=3010
CMD ["node", "services/reporting-service/dist/server.js"]

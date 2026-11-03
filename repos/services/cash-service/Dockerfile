FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/cash-service build
EXPOSE 3007
ENV PORT=3007
CMD ["node", "services/cash-service/dist/server.js"]

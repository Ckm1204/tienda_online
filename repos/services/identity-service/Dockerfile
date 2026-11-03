FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/identity-service build
EXPOSE 3002
ENV PORT=3002
CMD ["node", "services/identity-service/dist/server.js"]

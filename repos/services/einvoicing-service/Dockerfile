FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm@12.16.1 && pnpm install --frozen-lockfile=false && pnpm --filter @tiendita/einvoicing-service build
EXPOSE 3012
ENV PORT=3012
CMD ["node", "services/einvoicing-service/dist/server.js"]

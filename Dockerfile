FROM node:22.16.0-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-bin-links

FROM node:22.16.0-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json server.js ./
COPY public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]

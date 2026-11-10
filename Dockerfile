FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Pages are prerendered during the build, so the site's public address and
# Search Console token have to be known here, not only when the container runs.
ARG SITE_URL
ARG GOOGLE_SITE_VERIFICATION
RUN SITE_URL=$SITE_URL GOOGLE_SITE_VERIFICATION=$GOOGLE_SITE_VERIFICATION npm run build

FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# The standalone build (see next.config.js) already contains server.js and the
# pruned node_modules it needs; static assets and public files are served from
# beside it and are not part of the trace, so they are copied in explicitly.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]

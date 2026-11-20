# Levelboard-Frontend als Image (Level 7): Node baut die Seite, nginx liefert sie aus und leitet /api/ weiter.
FROM node:26.13.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && echo '{"source":"api"}' > dist/config.json

FROM nginx:1.31.9-alpine
ARG SOURCE_URL=""
ARG REVISION=""
LABEL org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.title="levelboard-frontend"
COPY nginx-container.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

# Build the static site with Vite, then serve it with nginx.

FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY src ./src
RUN npm run build

FROM nginx:stable
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo "alias ll='ls -lah'" >> /etc/bash.bashrc
EXPOSE 80

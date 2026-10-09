# Build the static site with Vite, then serve it with nginx.
# Official images through AWS's public mirror: Docker Hub's auth outages blocked deploys.

FROM public.ecr.aws/docker/library/node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html ./
COPY public ./public
COPY src ./src
RUN npm run build

FROM public.ecr.aws/docker/library/nginx:stable
COPY config/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
RUN echo "alias ll='ls -lah'" >> /etc/bash.bashrc
EXPOSE 80

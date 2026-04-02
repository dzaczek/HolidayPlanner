FROM node:22-alpine AS build
RUN apk add --no-cache git
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Remove default log symlinks (stdout/stderr) and create real files
RUN rm -f /var/log/nginx/access.log /var/log/nginx/error.log && \
    mkdir -p /var/cache/nginx /var/run /var/log/nginx && \
    touch /var/log/nginx/access.log /var/log/nginx/error.log && \
    chown -R nginx:nginx /var/cache/nginx /var/run /var/log/nginx

USER nginx
EXPOSE 8080

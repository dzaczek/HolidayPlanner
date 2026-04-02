FROM alpine:3.20

RUN apk add --no-cache goaccess darkhttpd

RUN mkdir -p /var/www/goaccess /var/log/nginx

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 7890 7891

ENTRYPOINT ["/entrypoint.sh"]

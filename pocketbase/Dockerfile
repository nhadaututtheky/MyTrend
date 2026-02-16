FROM alpine:3.19

ARG PB_VERSION=0.22.27

RUN apk add --no-cache \
    unzip \
    ca-certificates \
    wget

RUN wget -q https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip \
    -O /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /pb/ \
    && rm /tmp/pb.zip \
    && chmod +x /pb/pocketbase

WORKDIR /pb

EXPOSE 8090

CMD ["./pocketbase", "serve", "--http=0.0.0.0:8090"]

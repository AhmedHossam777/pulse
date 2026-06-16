# apps/notifications-go/Dockerfile
FROM golang:1.26.3-alpine AS build
WORKDIR /src
COPY apps/notifications-go/go.* ./
RUN go mod download
COPY apps/notifications-go/ ./

RUN CGO_ENABLED=0 go build -o /out/notifications-go ./cmd

FROM alpine:3.20
COPY --from=build /out/notifications-go /notifications-go
ENTRYPOINT ["/notifications-go"]

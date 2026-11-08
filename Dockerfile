# Один Dockerfile на все Go-сервисы: docker build --build-arg SERVICE=auth .
FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
ARG SERVICE
RUN test -n "$SERVICE" && CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/app ./services/${SERVICE}/cmd

# distroless: нет оболочки и пакетного менеджера, запуск не от root
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/app /app
USER nonroot:nonroot
EXPOSE 8080 8081
ENTRYPOINT ["/app"]

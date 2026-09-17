FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /rock-api .

FROM alpine:3.20
WORKDIR /app
COPY --from=build /rock-api .
EXPOSE 9000
ENTRYPOINT ["./rock-api"]

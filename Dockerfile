# Hosted CueBound: one project per visitor (HOSTED=1), spend caps, no testnet publishing.
FROM oven/bun:1.4
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libarchive-tools && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY web/package.json web/bun.lock web/
RUN cd web && bun install --frozen-lockfile
COPY . .
RUN cd web && bun run build
ENV HOSTED=1 HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
EXPOSE 3000
CMD ["bun", "server.ts"]

FROM node:24-alpine

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY server.js db.js parser.js ./
COPY lib/ ./lib/
COPY public/ ./public/
COPY schema.sql ./

# Bake the seeded database as factory default
# On first boot, it gets copied into the persistent volume
COPY bar_exam.db /app/seed.db

# Persistent volume for live database (writes survive redeployments)
VOLUME ["/app/data"]

ENV DATABASE_PATH=/app/data/bar_exam.db
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Seed-on-boot: only copy seed.db if the live database doesn't exist yet
CMD sh -c '\
  if [ ! -f "$DATABASE_PATH" ]; then \
    echo "[boot] First boot detected — copying seed database to volume..."; \
    cp /app/seed.db "$DATABASE_PATH"; \
    echo "[boot] Seed database ready: $(du -sh $DATABASE_PATH | cut -f1)"; \
  else \
    echo "[boot] Live database found — skipping seed copy."; \
  fi && \
  exec node server.js'

# Deployment Guide

This guide covers deploying DD HRMS from local development through staging to production.

---

## Table of Contents

- [Development Setup](#development-setup)
- [Staging Deployment](#staging-deployment)
- [Production Deployment](#production-deployment)
- [Environment Variables Checklist](#environment-variables-checklist)
- [SSL/TLS Setup](#ssltls-setup)
- [Backup Strategy](#backup-strategy)
- [Monitoring](#monitoring)
- [Scaling](#scaling)
- [Troubleshooting](#troubleshooting)

---

## Development Setup

### Prerequisites

- Node.js >= 22.0.0
- Docker and Docker Compose
- npm >= 10.0.0

### Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start infrastructure (MongoDB, Redis, Meilisearch, MinIO)
docker compose -f docker/docker-compose.yml up -d mongodb redis meilisearch minio

# 3. Configure environment
cp .env.example .env
# Edit .env with development values

# 4. Build shared packages
npm run build --workspace=packages/shared

# 5. Seed database (optional)
npm run seed --workspace=apps/api

# 6. Start all apps
npm run dev
```

### Development Services

| Service | Port | Purpose |
|---|---|---|
| API | 4000 | Express.js backend |
| Web | 5173 | Vite dev server |
| MongoDB | 27017 | Database |
| Redis | 6379 | Cache and queues |
| Meilisearch | 7700 | Full-text search |
| MinIO API | 9000 | Object storage |
| MinIO Console | 9001 | Storage management UI |

---

## Staging Deployment

Staging uses the full Docker Compose stack including the API, Web, and Worker containers.

### 1. Build and Start

```bash
# Build all images and start
docker compose -f docker/docker-compose.yml up -d --build
```

This starts:
- **API** server (Express.js) on port 4000
- **Web** dashboard (Nginx serving React SPA) on port 80
- **Worker** (BullMQ background job processor)
- **MongoDB** on port 27017
- **Redis** on port 6379
- **Meilisearch** on port 7700
- **MinIO** on ports 9000/9001

### 2. Verify Health

```bash
# Check all containers are healthy
docker compose -f docker/docker-compose.yml ps

# Check API health
curl http://localhost:4000/api/health

# Check logs
docker compose -f docker/docker-compose.yml logs -f api
```

### 3. Stop

```bash
docker compose -f docker/docker-compose.yml down
```

To also remove volumes (destroys data):

```bash
docker compose -f docker/docker-compose.yml down -v
```

---

## Production Deployment

Production uses the base `docker-compose.yml` with `docker-compose.prod.yml` overrides that add security, resource limits, and high-availability settings.

### 1. Prepare Environment

```bash
# Copy and configure production environment variables
cp .env.production .env

# Fill in ALL required values:
# - Strong JWT secrets (minimum 32 random characters)
# - MongoDB Atlas connection string or local MongoDB with auth
# - Redis password
# - Razorpay production keys
# - AWS S3 credentials (MinIO is disabled in production)
# - SMTP credentials
# - Meilisearch master key
```

### 2. Configure Docker Environment

```bash
cp docker/.env.example docker/.env

# Set production values:
# - MONGO_ROOT_PASSWORD (strong password)
# - REDIS_PASSWORD (strong password)
# - MEILI_MASTER_KEY (strong key)
```

### 3. Build and Deploy

```bash
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.prod.yml \
  up -d --build
```

### 4. Production Overrides

The production compose file applies these changes:

| Service | Change |
|---|---|
| **API** | 2 replicas, 1 CPU / 1 GB RAM limit, no volume mounts, no exposed ports (behind Nginx) |
| **Worker** | 1 replica, 1 CPU / 1 GB RAM limit |
| **Web (Nginx)** | Ports 80 and 443 exposed, security headers enabled |
| **MongoDB** | Authentication enabled, no exposed ports, 2 CPU / 2 GB RAM limit |
| **Redis** | Password required, no exposed ports |
| **Meilisearch** | Production mode, analytics disabled, no exposed ports |
| **MinIO** | Disabled (use AWS S3 directly) |
| **All** | JSON logging with rotation (10 MB max, 3 files) |

### 5. Verify Production

```bash
# Check all services
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.prod.yml \
  ps

# Check API health (through Nginx)
curl http://localhost/api/health

# View logs
docker compose \
  -f docker/docker-compose.yml \
  -f docker/docker-compose.prod.yml \
  logs -f api worker
```

---

## Environment Variables Checklist

Before deploying to production, verify every variable is set correctly:

### Required

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | Must be `production` | `production` |
| `MONGODB_URI` | MongoDB connection string with auth | `mongodb+srv://user:pass@cluster/opencore` |
| `REDIS_URL` | Redis connection URL | `redis://:password@redis:6379` |
| `JWT_SECRET` | Access token signing key (32+ chars) | Random string |
| `JWT_REFRESH_SECRET` | Refresh token signing key (32+ chars) | Random string |
| `RAZORPAY_KEY_ID` | Razorpay live key | `rzp_live_xxxxx` |
| `RAZORPAY_KEY_SECRET` | Razorpay secret | Secret string |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook verification secret | Secret string |
| `S3_ENDPOINT` | S3 endpoint URL | `https://s3.amazonaws.com` |
| `S3_BUCKET` | S3 bucket name | `opencore-prod` |
| `S3_ACCESS_KEY` | AWS access key | IAM key |
| `S3_SECRET_KEY` | AWS secret key | IAM secret |
| `CORS_ORIGIN` | Frontend URL | `https://app.yourdomain.com` |

### Recommended

| Variable | Description | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server for emails | -- |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP username | -- |
| `SMTP_PASS` | SMTP password | -- |
| `MEILISEARCH_HOST` | Meilisearch URL | `http://meilisearch:7700` |
| `MEILISEARCH_API_KEY` | Meilisearch master key | -- |
| `LOG_LEVEL` | Logging verbosity | `warn` |

### Optional

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `GEMINI_API_KEY` | Google Gemini API key |
| `OLLAMA_URL` | Ollama local AI endpoint |
| `FIREBASE_PROJECT_ID` | Firebase project for mobile push |

---

## SSL/TLS Setup

### Option A: Cloudflare (Recommended)

1. Point your domain DNS to Cloudflare
2. Set SSL mode to **Full (Strict)**
3. Cloudflare handles certificate provisioning and renewal automatically
4. Configure origin certificate on your server for end-to-end encryption

### Option B: Let's Encrypt with Certbot

1. Install certbot on the host:

```bash
sudo apt install certbot
```

2. Obtain a certificate:

```bash
sudo certbot certonly --standalone -d app.yourdomain.com -d api.yourdomain.com
```

3. Update `nginx.conf` to use the certificates:

```nginx
server {
    listen 443 ssl http2;
    server_name app.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/app.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.yourdomain.com/privkey.pem;

    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # ... rest of config
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name app.yourdomain.com;
    return 301 https://$host$request_uri;
}
```

4. Mount certificates in the web container:

```yaml
# docker-compose.prod.yml override
web:
  volumes:
    - /etc/letsencrypt:/etc/letsencrypt:ro
```

5. Set up auto-renewal via cron:

```bash
0 3 * * * certbot renew --quiet && docker compose restart web
```

---

## Backup Strategy

### Database Backups

Use the included backup script:

```bash
# Manual backup
./scripts/backup-db.sh

# Automated daily backups via cron
./scripts/setup-cron.sh
```

### Recommended Schedule

| Backup Type | Frequency | Retention |
|---|---|---|
| Full database dump | Daily at 2:00 AM | 30 days |
| Incremental (oplog) | Continuous | 7 days |
| S3 file storage | Daily sync | 90 days |
| Configuration | On every change | Indefinite (version controlled) |

### Restore

```bash
# Restore from a backup file
./scripts/restore-db.sh /path/to/backup.gz
```

### MongoDB Atlas (Recommended for Production)

If using MongoDB Atlas:
- Continuous backups are built-in
- Point-in-time restore available
- Cross-region replication for disaster recovery

---

## Monitoring

### Start the Monitoring Stack

```bash
docker compose -f docker/monitoring/docker-compose.monitoring.yml up -d
```

This starts:

| Service | Port | Purpose |
|---|---|---|
| Prometheus | 9090 | Metrics collection and alerting |
| Grafana | 3000 | Dashboards and visualization |
| Loki | 3100 | Log aggregation |
| Node Exporter | 9100 | Host-level metrics |

### Grafana Dashboards

Access Grafana at http://localhost:3000 (default credentials: admin/admin).

Pre-configured dashboards include:
- **API Performance**: Request rates, latency percentiles, error rates
- **System Resources**: CPU, memory, disk, network usage
- **MongoDB Metrics**: Query performance, connections, replication lag
- **Redis Metrics**: Memory usage, hit rates, connected clients
- **BullMQ Jobs**: Queue lengths, processing rates, failed jobs

### Alerting

Configure Grafana alerts for:
- API response time > 2 seconds (P95)
- Error rate > 5%
- Disk usage > 80%
- MongoDB connection pool exhaustion
- Redis memory > 80% of limit
- Failed BullMQ jobs > threshold

---

## Scaling

### Horizontal Scaling (API)

Increase API replicas in the production compose override:

```yaml
api:
  deploy:
    replicas: 4
```

Nginx load-balances across all API instances automatically.

### Vertical Scaling

Adjust resource limits per service:

```yaml
api:
  deploy:
    resources:
      limits:
        cpus: "2"
        memory: 2G
```

### Database Scaling

- **MongoDB**: Use MongoDB Atlas with auto-scaling, or configure a replica set
- **Redis**: Use Redis Cluster for horizontal scaling
- **Meilisearch**: Scale vertically (more RAM = more indexable documents)

---

## Troubleshooting

### Common Issues

**Container fails to start:**
```bash
# Check logs
docker compose -f docker/docker-compose.yml logs <service-name>

# Check health status
docker inspect --format='{{json .State.Health}}' opencore-api
```

**API cannot connect to MongoDB:**
- Verify `MONGODB_URI` is correct
- Check MongoDB container is healthy: `docker exec opencore-mongo mongosh --eval "db.adminCommand('ping')"`
- Ensure the network is shared between containers

**Redis connection refused:**
- Verify Redis container is running
- In production, ensure `REDIS_PASSWORD` matches the password in the Redis container command

**Meilisearch index errors:**
- Check master key matches between API config and Meilisearch container
- Verify Meilisearch is healthy: `curl http://localhost:7700/health`

**File uploads failing:**
- Verify S3/MinIO credentials
- Check the bucket exists: `curl http://localhost:9000/minio/health/live`
- In production, verify AWS IAM permissions

### Production Checklist

Run the included production checklist script:

```bash
./scripts/production-checklist.sh
```

This verifies:
- All required environment variables are set
- Database connectivity
- Redis connectivity
- S3 storage access
- SMTP email delivery
- SSL certificate validity

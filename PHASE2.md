# Phase 2: Future Enhancements

This document outlines planned enhancements for Yardmaster beyond the MVP.

## 1. Web Dashboard 🖥️

**Goal**: Visual interface for managing ports across machines

### Features
- Real-time port registry view
- Visual tunnel status indicators
- Click-to-copy ngrok URLs
- Port usage graphs and analytics
- Quick register/release buttons
- Search and filter registrations

### Tech Stack
- React + TypeScript + Vite
- TanStack Query for data fetching
- Tailwind CSS for styling
- WebSocket for real-time updates

### API Requirements
- REST API wrapper around MCP tools
- WebSocket server for live updates
- Auth middleware

## 2. Multi-Machine Aggregation 🌐

**Goal**: Unified dashboard showing ports across multiple development machines

### Features
- Central registry server
- Machine-specific auth tokens
- Aggregate view of all machines
- Filter by machine/user
- Remote port management
- Conflict detection across machines

### Architecture
```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Machine A   │      │  Machine B   │      │  Machine C   │
│  Yardmaster  │◄────►│  Yardmaster  │◄────►│  Yardmaster  │
└──────┬───────┘      └──────┬───────┘      └──────┬───────┘
       │                     │                     │
       └─────────────────────┴─────────────────────┘
                             │
                   ┌─────────▼──────────┐
                   │ Central Registry   │
                   │ (Auth + Sync)      │
                   └─────────┬──────────┘
                             │
                   ┌─────────▼──────────┐
                   │  Web Dashboard     │
                   │  (All Machines)    │
                   └────────────────────┘
```

### Implementation
- gRPC or WebSocket for machine-to-server sync
- JWT tokens for machine auth
- Eventual consistency model
- Conflict resolution strategies

## 3. Advanced Analytics 📊

**Goal**: Understand port usage patterns and optimize allocations

### Metrics
- Port utilization over time
- Average tunnel lifetime
- Most used ports
- Conflict frequency
- Machine-specific patterns
- Peak usage hours

### Visualizations
- Time-series graphs
- Heatmaps of port usage
- Conflict reports
- Cost analysis (ngrok usage)

### Storage
- Time-series database (InfluxDB/TimescaleDB)
- Aggregate daily/weekly/monthly
- Retention policies

## 4. Docker Integration 🐳

**Goal**: Auto-discover and register containerized applications

### Features
- Docker event listener
- Auto-register container ports
- Label-based configuration
- Docker Compose integration
- Kubernetes support

### Example
```yaml
services:
  frontend:
    image: my-app
    labels:
      yardmaster.enable: "true"
      yardmaster.app_name: "my-frontend"
      yardmaster.expose_ngrok: "true"
```

### Implementation
- Docker Engine API integration
- Container lifecycle hooks
- Label-based service discovery

## 5. Custom Domains & Advanced ngrok Features 🌍

**Goal**: Use custom domains and advanced ngrok configurations

### Features
- Custom domain support (paid ngrok)
- Wildcard domains
- Basic auth on tunnels
- OAuth protection
- Webhook verification
- Custom ngrok regions
- Static domains

### Configuration
```json
{
  "ngrok": {
    "domain": "myapp.mydomain.com",
    "auth": {
      "type": "oauth",
      "provider": "google"
    },
    "region": "eu"
  }
}
```

## 6. Webhooks & Notifications 🔔

**Goal**: Real-time notifications for port events

### Events
- Port registered
- Port released
- Tunnel created
- Tunnel failed
- Port conflict detected
- Registry full

### Integrations
- Slack notifications
- Discord webhooks
- Email alerts
- SMS (Twilio)
- Custom webhooks

### Configuration
```json
{
  "webhooks": [
    {
      "url": "https://hooks.slack.com/...",
      "events": ["port_registered", "tunnel_failed"]
    }
  ]
}
```

## 7. Database Backend 💾

**Goal**: Replace JSON with proper database for scalability

### Options
- **SQLite**: Simple, file-based, good for single-machine
- **PostgreSQL**: Multi-machine, robust, enterprise-ready
- **Redis**: Fast, in-memory, good for caching + simple registry

### Schema
```sql
CREATE TABLE registrations (
  id SERIAL PRIMARY KEY,
  app_name VARCHAR(255) NOT NULL,
  port INT NOT NULL,
  ngrok_url VARCHAR(512),
  machine_id VARCHAR(255),
  user_id VARCHAR(255),
  pid INT,
  status VARCHAR(50),
  registered_at TIMESTAMP,
  released_at TIMESTAMP,
  metadata JSONB
);

CREATE INDEX idx_app_name ON registrations(app_name);
CREATE INDEX idx_port ON registrations(port);
CREATE INDEX idx_status ON registrations(status);
```

### Migration Strategy
- Support both JSON and DB backends
- Migration tool: `yardmaster migrate json-to-db`
- Backward compatibility mode

## 8. Team & Organization Features 🤝

**Goal**: Multi-user support with permissions

### Features
- User accounts & authentication
- Organization workspaces
- Role-based access control (RBAC)
- Port quotas per user/org
- Shared port pools
- Audit logs

### Roles
- **Admin**: Full access, manage users
- **Developer**: Register/release own ports
- **Viewer**: Read-only access

### Permissions
```json
{
  "roles": {
    "developer": {
      "can_register": true,
      "can_release_own": true,
      "can_release_others": false,
      "can_view": true
    }
  }
}
```

## 9. Port Reservation System 📅

**Goal**: Pre-reserve ports for specific apps or time windows

### Features
- Reserve port for future use
- Time-based reservations
- Recurring reservations
- Priority system
- Reservation calendar

### Example
```bash
# Reserve port 3000 for frontend (1 week)
yardmaster reserve frontend 3000 --duration 7d

# Reserve for specific time
yardmaster reserve api 8080 --from "2025-12-30 09:00" --to "2025-12-30 17:00"

# Recurring reservation (weekdays)
yardmaster reserve backend 4000 --recurring "weekdays 9-17"
```

## 10. Caddy/Traefik Integration 🔄

**Goal**: Local reverse proxy with pretty domains

### Features
- Auto-configure Caddy/Traefik
- Local `.dev` domains
- Automatic HTTPS (localhost)
- Dynamic routing

### Example
```bash
# Register with local domain
yardmaster register frontend --domain frontend.local

# Auto-configures:
# frontend.local → localhost:3000 → ngrok tunnel
```

### Implementation
- Generate Caddy/Traefik config files
- Reload proxy on port changes
- Update `/etc/hosts` (optional)

## Implementation Priority

### High Priority (Next Release)
1. Web Dashboard (most requested)
2. Multi-Machine Aggregation (user's specific ask)
3. Database Backend (scalability)

### Medium Priority
4. Docker Integration
5. Advanced ngrok Features
6. Webhooks & Notifications

### Low Priority (Nice-to-Have)
7. Team Features
8. Port Reservations
9. Reverse Proxy Integration
10. Advanced Analytics

## Timeline Estimate

- **Phase 2.1** (Dashboard + Multi-Machine): ~2-3 weeks
- **Phase 2.2** (Database + Docker): ~1-2 weeks
- **Phase 2.3** (Advanced Features): ~2-4 weeks

**Total Phase 2**: ~5-9 weeks (MVP→Full Product)

## Community Input

We welcome feedback on these features! Which ones matter most to you?

- Create an issue with `enhancement` label
- Vote on existing feature requests
- Propose new ideas

---

**Note**: All Phase 2 features will maintain the **Zero Mock Policy** - real implementations only!

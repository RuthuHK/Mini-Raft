# Mini-RAFT

A real-time collaborative drawing board built using a WebSocket gateway and 3 replica nodes with a simplified RAFT-style leader election and log replication system.

## Overview

- Real-time shared drawing board
- WebSocket communication
- 3 replica nodes
- Leader election
- Heartbeats between replicas
- Log replication
- Docker Compose setup
- Supports draw, clear, and undo actions




## How It Works

- The **frontend** provides the drawing canvas.
- The **gateway** handles WebSocket clients and forwards actions to the current leader.
- The **leader replica** receives events, adds them to its log, and replicates them to follower replicas.
- Once a majority confirms the event, it is committed and broadcast to all connected clients.

## Run the Project

```bash
cd raft-project
docker compose up --build
```

After starting, open the app in a browser.

### On the same computer

```text
http://localhost:5000
```

### On other devices in the same network

Find your system’s local IP address, then open:

```text
http://YOUR_IP_ADDRESS:5000
```

Example:

```text
http://192.168.1.5:5000
```






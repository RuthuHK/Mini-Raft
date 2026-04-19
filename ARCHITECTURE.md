# Architecture Overview

## Goal
Build a distributed real-time drawing board with three backend replicas and a gateway that keeps clients connected while leadership changes inside the replica cluster.

## High-level components

### 1. Frontend
The browser UI captures drawing actions and sends them to the gateway through WebSocket. It also listens for committed drawing events and renders them on the canvas.

### 2. Gateway
The gateway is the client-facing entry point.

Responsibilities:
- accept WebSocket connections
- keep track of the current leader
- forward drawing events to the leader replica
- broadcast committed events back to all clients

### 3. Replica cluster
The replica cluster contains three nodes. Each node can act as:
- follower
- candidate
- leader

Responsibilities:
- elect a leader
- replicate drawing events as an append-only log
- commit entries after majority acknowledgement
- survive single-node failure and continue serving clients

## Current implementation model

The current code uses:
- randomized election timeout
- vote requests between replicas
- heartbeats from the leader
- replication from the leader to followers
- commit notification back to the gateway

## Target assignment model

The assignment specification calls for these logical RPCs:
- `/request-vote`
- `/append-entries`
- `/heartbeat`
- `/sync-log`

The current code uses simpler endpoint names, but the protocol intent is similar.

## Data flow

1. Client draws on canvas.
2. Frontend sends event to gateway.
3. Gateway forwards event to leader.
4. Leader appends the event to its local log.
5. Leader replicates the entry to followers.
6. Once a majority confirms, the entry is committed.
7. Gateway receives the committed event.
8. Gateway broadcasts the event to all clients.

## Failure handling

### Leader failure
- Followers stop receiving heartbeats.
- One follower times out first and starts an election.
- If it gains majority votes, it becomes leader.
- New leader informs the gateway.
- New writes continue through the updated leader.

### Follower failure
- The leader continues operating if a majority still exists.
- Replication can still succeed with two out of three nodes.

### Restarted node
The assignment expects a catch-up protocol using `/sync-log`. The current code does not fully implement restart recovery, so this should be added before final submission.

## Limitations in the current repository
- no persistent storage
- no bind-mounted hot reload setup
- no full catch-up synchronization API
- no separate frontend container
- no explicit observability dashboard

## Recommended upgrade path
1. Add explicit log metadata: `term`, `index`, `commitIndex`.
2. Implement `/sync-log`.
3. Add bind mounts in Docker Compose.
4. Add health checks and restart policies.
5. Add structured logs for leader changes and replication results.

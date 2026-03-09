<div align="center">
  <img src="./assets/logo.svg" width="120" alt="ConvoAI Logo" />
  <h1>ConvoAI</h1>
  <p>AI-Native Real-Time Communication Platform — not just another chat app.</p>
</div>

English | [简体中文](./README.zh-CN.md)

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 📖 Introduction

**ConvoAI** is a full-stack, AI-first communication platform built with a Discord-like interface. Unlike traditional chat applications, every server (guild) can be augmented with **intelligent AI Agents** — bots that don't just respond to commands, but _understand context, remember conversations, use tools, and take proactive actions_.

The platform combines real-time messaging, voice channels, media sharing, and content moderation into a single deployable stack — all orchestrated by a powerful **Agent runtime**.

## ✨ Key Features

- **Core Chat & Voice**: Real-time messaging (Socket.IO adapter) and crystal-clear voice channels powered by LiveKit WebRTC.
- **Agent Orchestration**: Multi-mode bot execution (Webhook, Built-in templates, and Managed LLM) supporting slash commands, scheduled tasks, and event-driven automation.
- **Layered Memory System**: Per-bot long-term memory backed by rolling summaries, entity extraction, and semantic search (RAG) using Qdrant.
- **On-Device AutoMod**: Local ONNX-based toxicity detection and spam filtering — zero API latency, complete privacy.
- **Smart Tool Calling**: Agents can search the web, execute code, fetch guild info, and summarize channels autonomously.
- **Scalable Media Storage**: S3-compatible object storage via MinIO.
- **Full-Stack Monorepo**: NestJS backend and Next.js frontend, easily deployable via Docker Compose.

## 🤖 Agent & Memory Architecture

The heart of ConvoAI is its autonomous Agent runtime and Context Engine. Each bot can be customized to act as an orchestrator, responder, or background worker.

### Execution Modes

| Mode              | Description                                           |
| ----------------- | ----------------------------------------------------- |
| **`webhook`**     | Forwards events to external backend services.         |
| **`builtin`**     | Zero-config templates (e.g., responder, game, poll).  |
| **`managed_llm`** | Full LLM Agent with streaming, RAG, and tool calling. |

### Context Pipeline & Memory

When a user interacts with an Agent, the **Context Builder** assembles a layered prompt:

1. **Rolling Summary**: Compressed historical context to save tokens.
2. **User Entities**: Extracted personal facts and preferences (e.g., "Alice likes Python").
3. **RAG Context**: Vector-searched past conversations from **Qdrant**.
4. **Current Environment**: Guild, channel state, and real-time user messages.

Tasks like memory updates, summarization, and vector embeddings are dispatched asynchronously via **BullMQ** message queues backed by **Redis**, ensuring zero impact on user interaction responsiveness.

## 🏗️ Architecture & Tech Stack

ConvoAI is built on a modern, scalable stack:

| Layer               | Technology                                            |
| ------------------- | ----------------------------------------------------- |
| **Frontend**        | React 19 + Next.js 16 + TailwindCSS + Zustand         |
| **Backend**         | NestJS 11 + Socket.IO                                 |
| **Database**        | MongoDB 7 (Replica Set)                               |
| **Object Storage**  | MinIO (S3-compatible)                                 |
| **Cache & Queue**   | Redis + BullMQ (powers async memory & agent dispatch) |
| **Vector Database** | Qdrant (semantic search & RAG)                        |
| **Voice / WebRTC**  | LiveKit                                               |
| **AI / ML**         | ONNX Runtime (AutoMod) + OpenAI-compatible LLM APIs   |

## 🚀 Quick Start

The easiest way to get ConvoAI running is using Docker. Ensure you have Docker and Docker Compose installed.

```bash
# Clone the repository
git clone https://github.com/fyerfyer/convo-ai.git
cd convo-ai

# Start all services in the background
docker compose up -d
```

Once all containers are up and healthy, you can access the application at `http://localhost:3000`.

_(Optional)_ To use full AI capabilities, configure your LLM settings in a `.env` file first (see `.env.example`).

## 🛠️ Local Development

If you wish to run the project locally without Docker (e.g., for development):

### 1. Start Infrastructure Dependencies

Run the infrastructure services (MongoDB, MinIO, Redis, Qdrant, LiveKit) via Docker Compose:

```bash
docker compose up mongo redis minio qdrant livekit -d
```

### 2. Start Services

```bash
npm install

# Start the backend in dev mode
npx nx serve backend

# Start the frontend in dev mode (in another terminal)
npx nx dev frontend
```

## 📄 License

This project is licensed under the **Apache 2.0 License**.

<div align="center">
  <img src="./assets/logo.svg" width="120" alt="ConvoAI Logo" />
  <h1>ConvoAI</h1>
  <p>AI 原生实时通讯平台 — 让应用不仅能听会说，更懂思考与记忆。</p>
</div>

[English](./README.md) | 简体中文

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

## 📖 项目简介

**ConvoAI** 是一个全栈、AI 驱动的实时通讯平台，采用 Discord 风格的界面设计。与传统聊天应用不同，每个服务器（Guild）都可以配置**智能 AI Agent** — 这些 Bot 不仅能响应指令，更能*理解上下文、记忆对话内容、调用工具、并主动执行任务*。

平台将实时消息、语音频道、媒体分享和内容审核无缝整合 — 所有功能都由强大的 **Agent 运行时**驱动。

## ✨ 核心亮点

- **核心实时通讯**：基于 Socket.IO 的实时消息推送与基于 LiveKit WebRTC 的高清语音频道。
- **Agent 编排系统**：多模式 Bot 执行（Webhook、内置模板、LLM Agent），支持斜杠命令、定时任务和事件驱动自动化。
- **分层记忆机制**：每个 Bot 独立的长期记忆，基于滚动摘要、用户实体抽取和 Qdrant 向量检索（RAG）。
- **端侧智能审核 (AutoMod)**：基于 ONNX 的本地毒性检测与垃圾信息过滤 — 无 API 延迟，保护隐私。
- **动态工具调用**：Agent 可自主搜索网络、执行代码、获取服务器信息及总结聊天频道。
- **可扩展存储**：基于 MinIO 的 S3 兼容对象存储方案。
- **全栈 Monorepo 架构**：NestJS 后端与 Next.js 前端，开箱即用，支持 Docker 一键部署。

## 🤖 Agent 与记忆系统

ConvoAI 的核心在于其自主 Agent 运行时与上下文引擎。每个 Bot 都可以配置不同的功能角色：处理响应、执行后台任务或担任调度流转器。

### 执行模式

| 模式              | 说明                                           |
| ----------------- | ---------------------------------------------- |
| **`webhook`**     | 将事件和消息转发至外部自定义后端服务。         |
| **`builtin`**     | 零配置的内置模板（如：自动回复、游戏、投票）。 |
| **`managed_llm`** | 支持流式输出、RAG 和工具调用的完整 LLM Agent。 |

### 上下文管道与记忆处理

当用户与 Agent 交互时，**上下文构建器 (Context Builder)** 会自动组装分层 Prompt：

1. **滚动摘要**：压缩的历史上下文，极大节省 Token 消耗。
2. **用户实体知识**：抽取的用户个人事实与偏好（例如："Alice 喜欢 Python"）。
3. **RAG 向量检索**：从 **Qdrant** 数据库中召回的语义相关历史对话。
4. **当前环境状态**：所在的服务器、频道上下文及用户的实时消息。

记忆更新、总结摘要和向量嵌入等高耗时任务，均通过 **BullMQ**（基于 Redis）异步处理，确保对话的实时响应与流畅体验。

## 🏗️ 架构与技术栈

ConvoAI 基于现代化的可扩展架构构建：

| 层级              | 技术方案                                          |
| ----------------- | ------------------------------------------------- |
| **前端**          | React 19 + Next.js 16 + TailwindCSS + Zustand     |
| **后端**          | NestJS 11 + Socket.IO                             |
| **数据库**        | MongoDB 7 (Replica Set)                           |
| **对象存储**      | MinIO (S3 兼容)                                   |
| **缓存 & 队列**   | Redis + BullMQ (支持异步记忆与 Agent 任务分发)    |
| **向量数据库**    | Qdrant (语义搜索 & RAG)                           |
| **语音 / WebRTC** | LiveKit                                           |
| **AI / ML**       | ONNX Runtime (AutoMod 端侧审核) + OpenAI 兼容 API |

## 🚀 快速开始

使用 Docker 是一键运行 ConvoAI 的最简方式。请确保已安装 Docker 和 Docker Compose。

```bash
# 克隆仓库
git clone https://github.com/fyerfyer/convo-ai.git
cd convo-ai

# 后台启动所有服务
docker compose up -d
```

待所有容器启动就绪后，访问 `http://localhost:3000` 即可体验。

_(可选)_ 如果希望使用完整的智能能力，请先在 `.env` 文件中配置您的 LLM 密钥（参考 `.env.example`）。

## 🛠️ 本地开发

若需在本地进行无 Docker 的开发调试：

### 1. 启动基础设施服务

通过 Docker Compose 启动依赖环境 (MongoDB, MinIO, Redis, Qdrant, LiveKit)：

```bash
docker compose up mongo redis minio qdrant livekit -d
```

### 2. 启动服务

```bash
npm install

# 以开发模式启动后端
npx nx serve backend

# 另起终端，以开发模式启动前端
npx nx dev frontend
```

## 📄 许可证

本项目基于 **Apache 2.0 许可证** 开源。

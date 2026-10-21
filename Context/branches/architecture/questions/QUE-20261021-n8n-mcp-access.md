---
id: CTX-QUE-20261021-n8n-mcp-access
type: question
title: Como dar ao agente acesso ao MCP do n8n (token, URL local ou pelo domínio)?
branch: architecture
tags: [n8n, integration, security]
status: open
confidence: medium
created_at: 2026-10-21
updated_at: 2026-10-21
related: [CTX-FCT-20261021-server-infra-state]
---

## Question
The user wants the agent to control n8n through n8n's instance-level MCP server. As of 2026-10-21 the Claude session has **no n8n MCP configured** (`claude mcp list` shows only claude-mem and a failing `headroom`).

## What is known
- Endpoint: `/mcp-server/http` on the n8n instance: `http://localhost:5678/mcp-server/http` (needs `npm run ui:tunnel`) or `https://n8n.gnslab.com.br/mcp-server/http` (no tunnel; the endpoint is public, token-protected).
- It needs the MCP access token from n8n Settings -> MCP (enable instance-level MCP first). The token must stay out of chat and out of `Context/`; the user adds it with `claude mcp add --transport http n8n <url> --header "Authorization: Bearer <token>"` in their own terminal (project scope would write it into `.mcp.json` — avoid committing it).

## How to resolve
User creates the token and registers the MCP; then verify the n8n tools appear and record the outcome here.

## Progress (2026-10-21)
Registered as `n8n-mcp` in **local scope** (`~/.claude.json`, project-private; not in `.mcp.json`) pointing to `http://localhost:5678/mcp-server/http` with the user's MCP token (not recorded here); `claude mcp list` shows it Connected. It needs `npm run ui:tunnel` open. The tools only appear in a **new** session; resolve this question once they are verified there.

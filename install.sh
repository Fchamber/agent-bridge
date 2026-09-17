#!/usr/bin/env bash
set -euo pipefail

progress() {
  echo "[agent-bridge] $1"
}

warn() {
  echo "[agent-bridge] WARNING: $1"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "[agent-bridge] ERROR: required command not found on PATH: $command_name" >&2
    exit 1
  fi
}

main() {
  local script_dir repo_dir mcp_json
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  repo_dir="$script_dir"

  progress "Checking required commands"
  require_command "node"
  require_command "npm"

  progress "Installing npm dependencies"
  if [ -f "$repo_dir/package-lock.json" ]; then
    npm --prefix "$repo_dir" ci
  else
    npm --prefix "$repo_dir" install
  fi

  progress "Configuring Claude Code integration"
  if command -v "claude" >/dev/null 2>&1; then
    if ! claude mcp get agent-bridge >/dev/null 2>&1; then
      claude mcp add -s user agent-bridge -- node "$repo_dir/server.mjs"
      progress "Added Claude Code MCP entry"
    else
      progress "Claude Code MCP entry already exists"
    fi
    mkdir -p "$HOME/.claude/agents"
    cp "$repo_dir/install/cursor-executor.md" "$HOME/.claude/agents/cursor-executor.md"
  else
    warn "claude command not found, skipping Claude Code integration"
  fi

  progress "Configuring Cursor integration"
  if command -v "cursor-agent" >/dev/null 2>&1; then
    mkdir -p "$HOME/.cursor"
    mcp_json="$HOME/.cursor/mcp.json"
    if [ -f "$mcp_json" ]; then
      cp "$mcp_json" "$mcp_json.bak"
      progress "Backed up existing ~/.cursor/mcp.json to ~/.cursor/mcp.json.bak"
    fi
    REPO_DIR="$repo_dir" MCP_JSON="$mcp_json" node -e 'const fs=require("fs");const mcpPath=process.env.MCP_JSON;let data={mcpServers:{}};if(fs.existsSync(mcpPath)){const raw=fs.readFileSync(mcpPath,"utf8").trim();if(raw){data=JSON.parse(raw);}}if(!data||typeof data!=="object"){data={};}if(!data.mcpServers||typeof data.mcpServers!=="object"){data.mcpServers={};}data.mcpServers["agent-bridge"]={command:"node",args:[`${process.env.REPO_DIR}/server.mjs`]};fs.writeFileSync(mcpPath,`${JSON.stringify(data,null,2)}\n`);'
    mkdir -p "$HOME/.cursor/rules"
    cp "$repo_dir/install/agent-bridge.mdc" "$HOME/.cursor/rules/agent-bridge.mdc"
  else
    warn "cursor-agent command not found, skipping Cursor integration"
  fi

  progress "Manual steps"
  echo "1. Log in to Cursor with: cursor-agent login"
  echo "2. Add \"mcp__agent-bridge__ask_cursor\" to permissions.allow in ~/.claude/settings.json, otherwise every delegation prompts"
  echo "3. Restart Claude Code and Cursor. A session started before this install cannot see the new tools, and the cursor-executor agent fails until you restart"
}

main "$@"

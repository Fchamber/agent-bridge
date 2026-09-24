#!/usr/bin/env bash
set -euo pipefail

progress() {
  echo "[agent-bridge] $1"
}

warn() {
  echo "[agent-bridge] WARNING: $1"
}

main() {
  local mcp_json script_dir rule src
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

  progress "Removing Claude Code integration"
  if command -v "claude" >/dev/null 2>&1; then
    claude mcp remove -s user agent-bridge >/dev/null 2>&1 || true
  else
    warn "claude command not found, skipping Claude Code integration removal"
  fi
  rm -f "$HOME/.claude/agents/cursor-executor.md"
  rm -f "$HOME/.claude/agents/cursor-delegate.md"
  rule="$HOME/.claude/rules/agent-bridge.md"
  src="$script_dir/install/claude-md-snippet.md"
  if [ -f "$rule" ]; then
    if cmp -s "$rule" "$src"; then
      rm -f "$rule"
    else
      warn "Left $rule in place because it no longer matches the installed copy"
    fi
  fi

  progress "Removing Cursor integration"
  rm -f "$HOME/.cursor/rules/agent-bridge.mdc"
  if command -v "cursor-agent" >/dev/null 2>&1; then
    mcp_json="$HOME/.cursor/mcp.json"
    MCP_JSON="$mcp_json" node -e 'const fs=require("fs");const mcpPath=process.env.MCP_JSON;if(!fs.existsSync(mcpPath)){process.exit(0);}const raw=fs.readFileSync(mcpPath,"utf8").trim();const data=raw?JSON.parse(raw):{};if(!data||typeof data!=="object"){process.exit(0);}if(data.mcpServers&&typeof data.mcpServers==="object"){delete data.mcpServers["agent-bridge"];}fs.writeFileSync(mcpPath,`${JSON.stringify(data,null,2)}\n`);'
  else
    warn "cursor-agent command not found, skipping Cursor MCP entry removal"
  fi

  progress "Uninstall complete"
}

main "$@"

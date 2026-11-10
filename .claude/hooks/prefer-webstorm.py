#!/usr/bin/env python3
"""PreToolUse hook: send code work to the WebStorm MCP tools when WebStorm is reachable.

Reads the hook JSON from stdin. Exit 0 lets the call through. Exit 2 blocks it, and Claude Code
shows stderr to the agent. The hook never blocks when WebStorm is not reachable, when the file is
not source code, or when WEBSTORM_HOOK=off is set.
"""

import json
import os
import re
import shlex
import socket
import sys
from pathlib import Path
from urllib.parse import urlparse

CODE_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".sql"}
# Commands that read or search files. A WebStorm tool does the same job.
SEARCH_COMMANDS = {"rg", "grep", "egrep", "fgrep", "find", "cat", "head", "tail", "awk"}

LOAD = (
    'Load the tools first with ToolSearch: query "select:mcp__webstorm__read_file,'
    "mcp__webstorm__search_text,mcp__webstorm__search_file,mcp__webstorm__apply_patch,"
    'mcp__webstorm__create_new_file".'
)


def block(message: str) -> None:
    print(f"{message}\n{LOAD}\nTo skip this check, set WEBSTORM_HOOK=off.", file=sys.stderr)
    sys.exit(2)


def project_dir() -> Path:
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd())


def webstorm_reachable(root: Path) -> bool:
    """True when the `webstorm` server of `.mcp.json` accepts a connection."""
    try:
        url = json.loads((root / ".mcp.json").read_text())["mcpServers"]["webstorm"]["url"]
        parsed = urlparse(url)
        host, port = parsed.hostname, parsed.port
        if not host or not port:
            return False
        with socket.create_connection((host, port), timeout=0.3):
            return True
    except (OSError, KeyError, ValueError):
        return False


def is_project_code(path_text: str, root: Path) -> bool:
    path = Path(path_text)
    if path.suffix not in CODE_SUFFIXES:
        return False
    try:
        path.resolve().relative_to(root.resolve())
    except ValueError:
        return False  # a file outside the project
    return "node_modules" not in path.parts and ".claude" not in path.parts


def first_command(command: str) -> str:
    """The program of the first command in a shell line, with env assignments skipped."""
    first = re.split(r"\|\||&&|[;|\n]", command, maxsplit=1)[0]
    try:
        words = shlex.split(first)
    except ValueError:
        return ""
    for word in words:
        if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*=.*", word):
            continue
        return Path(word).name
    return ""


def main() -> None:
    if os.environ.get("WEBSTORM_HOOK") == "off":
        return
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        return
    tool = data.get("tool_name", "")
    tool_input = data.get("tool_input") or {}
    root = project_dir()

    if tool in {"Read", "Edit", "Write"}:
        path = tool_input.get("file_path", "")
        if not path or not is_project_code(path, root) or not webstorm_reachable(root):
            return
        if tool == "Read":
            block(f"Use the WebStorm tool read_file (not Read) for the code file {path}.")
        if tool == "Edit":
            block(f"Use the WebStorm tool apply_patch (not Edit) to change {path}.")
        block(f"Use the WebStorm tool create_new_file (not Write) for the code file {path}.")

    if tool == "Bash":
        program = first_command(tool_input.get("command", ""))
        if program in SEARCH_COMMANDS and webstorm_reachable(root):
            block(
                f"Use the WebStorm tools search_text, search_regex, search_file or read_file "
                f"(not `{program}`) to read or search code. Shell commands for other jobs "
                "(git, vp, pnpm) are allowed."
            )


if __name__ == "__main__":
    main()

const STDERR_NOISE = [
  /failed to load skill .*SKILL\.md/i,
  /invalid YAML:/i,
  /missing YAML frontmatter/i,
  /\[features\]\.codex_hooks is deprecated/i,
  /codex_core::session:/i,
  /rmcp::transport::worker:/i,
  /TokenRefreshFailed/i,
  /invalid_grant/i,
  /http:\/\/127\.0\.0\.1:\d+\/mcp/i
];

function isNoisyCodexStderr(line) {
  return STDERR_NOISE.some(pattern => pattern.test(String(line || '').trim()));
}

function cleanCodexStderr(text) {
  return String(text || '')
    .split(/\r?\n/)
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      return !isNoisyCodexStderr(trimmed);
    })
    .join('\n');
}

module.exports = {
  cleanCodexStderr,
  isNoisyCodexStderr
};

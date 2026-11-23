"use strict";
/*
 * VouchGate badge-check page.
 * - Badge status: public REST endpoint of the official Concordium Agent
 *   Registry MCP service (no keys, no wallet, read-only).
 * - Graph stats: plain JSON-RPC eth_call against a public BSC RPC
 *   (dependency-free; selectors verified in the AgentVouch repo).
 */

// FILL AFTER MINT (build phase 2): Base58Check token address of the
// CIS-8004 agent NFT on Concordium TESTNET (registry 12802.0).
const CONFIG = {
  badge: "",
  mcpBase: "https://agent-registry-mcp.concordium.com",
  agentVouch: "0x50c3ec6393e62090a349b717247890ac94e8f639",
  bscRpc: "https://bsc-dataseed.binance.org/",
  // uniqueInteractors() / totalEndorsementsMade() — keccak256 selectors,
  // verified against the live contract 23 Nov 2026 (returns 1 / 0).
  selUniqueInteractors: "0x8d7d16c0",
  selTotalEndorsementsMade: "0x78c9ed1a",
};

const $ = (id) => document.getElementById(id);
let lastBadgeOk = null;

function renderGate() {
  const el = $("gateVerdict");
  if (lastBadgeOk === true) {
    el.textContent = "Gate verdict: TRUSTED — operator badge is Active and the Agent Card hash matches on-chain.";
  } else if (lastBadgeOk === false) {
    el.textContent = "Gate verdict: UNVERIFIED — badge missing, revoked, or card hash mismatch. Treat vouches as unbacked.";
  } else {
    el.textContent = "Gate verdict: waiting for badge check…";
  }
}

/* ---------------------------------------------------------- badge check */

async function checkBadge(badge) {
  const status = $("badgeStatus");
  const out = $("badgeResult");
  status.textContent = "Checking…";
  out.hidden = true;
  lastBadgeOk = null;
  renderGate();
  try {
    const res = await fetch(`${CONFIG.mcpBase}/v1/badge-check/${encodeURIComponent(badge)}`);
    const data = await res.json();
    if (!res.ok) {
      status.textContent = `Badge check failed (HTTP ${res.status}): ${data.message || data.error || "unknown error"}`;
      lastBadgeOk = false;
      renderGate();
      return;
    }
    out.textContent = JSON.stringify(data, null, 2);
    out.hidden = false;
    // Field names follow the MCP service response (see docs + dev.to field
    // report): on_chain.status / on_chain.metadata_hash_hex + hash flag.
    const oc = data.on_chain || data.onChain || {};
    const statusVal = (oc.status || data.status || "").toString().toLowerCase();
    const hashOk = data.hash_matches_on_chain === true || oc.hash_matches === true;
    lastBadgeOk = statusVal === "active" && hashOk !== false;
    status.textContent = lastBadgeOk
      ? "Badge verified: agent is Active on-chain."
      : "Badge found, but not fully verified (see details).";
    renderGate();
  } catch (e) {
    status.textContent = "Badge check failed: " + e.message;
    lastBadgeOk = false;
    renderGate();
  }
}

$("badgeForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const v = $("badgeInput").value.trim();
  if (v) checkBadge(v);
});

/* ------------------------------------------------------------ BSC stats */

async function ethCall(to, data) {
  const res = await fetch(CONFIG.bscRpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to, data }, "latest"] }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return BigInt(j.result);
}

async function loadStats() {
  try {
    const [u, t] = await Promise.all([
      ethCall(CONFIG.agentVouch, CONFIG.selUniqueInteractors),
      ethCall(CONFIG.agentVouch, CONFIG.selTotalEndorsementsMade),
    ]);
    $("statInteractors").textContent = u.toString();
    $("statEndorsements").textContent = t.toString();
  } catch (e) {
    $("statInteractors").textContent = "?";
    $("statEndorsements").textContent = "?";
  }
}

/* ---------------------------------------------------------------- init */

loadStats();
if (CONFIG.badge) {
  $("badgeInput").value = CONFIG.badge;
  checkBadge(CONFIG.badge);
}
renderGate();

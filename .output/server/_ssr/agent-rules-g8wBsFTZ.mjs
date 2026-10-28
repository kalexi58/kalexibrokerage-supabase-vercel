//#region node_modules/.nitro/vite/services/ssr/assets/agent-rules-g8wBsFTZ.js
function approximateReward(tokens) {
	return Math.max(0, tokens) * 1e5 / 100;
}
function validAgent(status, expiry, now = /* @__PURE__ */ new Date()) {
	return status === "active" && new Date(expiry).getTime() > now.getTime();
}
function agentPermissions(status, expiry) {
	return validAgent(status, expiry) ? ["Refer clients", "Share official referral link"] : [];
}
//#endregion
export { approximateReward as n, validAgent as r, agentPermissions as t };

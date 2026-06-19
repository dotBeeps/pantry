/**
 * Bash command classification patterns for Dragon Guard.
 *
 * Two categories:
 * - SAFE_PLAN_BASH: Read-only commands auto-allowed in Puppy Mode
 * - MUTATING_BASH: Commands that modify files, packages, git state, or system
 */

// ── Safe Read-Only Commands ──

export const SAFE_PLAN_BASH: RegExp[] = [
	// File inspection
	/^\s*cat\b/i,
	/^\s*head\b/i,
	/^\s*tail\b/i,
	/^\s*less\b/i,
	/^\s*more\b/i,
	/^\s*diff\b/i,
	/^\s*file\b/i,
	/^\s*stat\b/i,
	/^\s*wc\b/i,

	// Directory listing & search
	/^\s*ls\b/i,
	/^\s*find\b/i,
	/^\s*fd\b/i,
	/^\s*tree\b/i,
	/^\s*pwd\b/i,

	// Text search
	/^\s*grep\b/i,
	/^\s*rg\b/i,

	// Text processing (read-only)
	/^\s*sort\b/i,
	/^\s*uniq\b/i,
	/^\s*jq\b/i,
	/^\s*sed\s+-n\b/i,
	/^\s*awk\b/i,

	// System info
	/^\s*which\b/i,
	/^\s*whereis\b/i,
	/^\s*type\b/i,
	/^\s*env\b/i,
	/^\s*printenv\b/i,
	/^\s*uname\b/i,
	/^\s*whoami\b/i,
	/^\s*id\b/i,
	/^\s*date\b/i,
	/^\s*uptime\b/i,
	/^\s*du\b/i,
	/^\s*df\b/i,

	// Process inspection
	/^\s*ps\b/i,
	/^\s*top\b/i,
	/^\s*htop\b/i,

	// Git read-only
	/^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)\b/i,

	// Package managers — read-only queries
	/^\s*npm\s+(list|ls|view|info|search|outdated|audit)\b/i,
	/^\s*yarn\s+(list|info|why|audit)\b/i,
	/^\s*pnpm\s+(list|ls|why|audit)\b/i,

	// Version checks
	/^\s*node\s+--version\b/i,
	/^\s*python\s+--version\b/i,
	/^\s*uv\s+--version\b/i,
];

// ── Mutating Commands ──

export const MUTATING_BASH: RegExp[] = [
	// File system mutations
	/\brm\b/i,
	/\brmdir\b/i,
	/\bmv\b/i,
	/\bcp\b/i,
	/\bmkdir\b/i,
	/\btouch\b/i,
	/\bchmod\b/i,
	/\bchown\b/i,
	/\bchgrp\b/i,
	/\bln\b/i,
	/\btee\b/i,
	/\btruncate\b/i,
	/\bdd\b/i,
	/\bshred\b/i,

	// Package managers — mutating
	/\bnpm\s+(install|add|uninstall|remove|update|ci|publish|link)\b/i,
	/\byarn\s+(add|remove|install|up|upgrade|set)\b/i,
	/\bpnpm\s+(add|remove|install|up|update)\b/i,
	/\bpip\s+(install|uninstall)\b/i,
	/\bapt(-get)?\s+(install|remove|purge|upgrade)\b/i,
	/\bbrew\s+(install|uninstall|upgrade)\b/i,

	// Git mutations
	/\bgit\s+(add|commit|push|pull|merge|rebase|reset|restore|checkout|cherry-pick|revert|stash|tag|init|clone)\b/i,

	// Privilege escalation
	/\bsudo\b/i,
	/\bsu\b/i,

	// Process & system management
	/\bkill(all)?\b/i,
	/\bpkill\b/i,
	/\breboot\b/i,
	/\bshutdown\b/i,
	/\bsystemctl\s+(start|stop|restart|enable|disable)\b/i,
	/\bservice\s+\S+\s+(start|stop|restart)\b/i,

	// Output redirection
	/(^|[^<])>(?!>)/,
	/>>/,
];

// ── Classification Functions ──

/** Returns true if the command contains chained operators or matches known mutating patterns. */
export function isMutatingBash(command: string): boolean {
	if (/;|&&|\|\|/.test(command)) {
		return true;
	}
	return MUTATING_BASH.some((p) => p.test(command));
}

/** Returns true only for single, non-chained commands matching the safe read-only list. */
export function isSafePlanBash(command: string): boolean {
	if (/;|&&|\|\|/.test(command)) {
		return false;
	}
	if (isMutatingBash(command)) {
		return false;
	}
	return SAFE_PLAN_BASH.some((p) => p.test(command));
}

/**
 * Code Mode F3: status-line icon rendering, muted rule/state divergence,
 * startup snapshot round-trips, and theme symbols in unicode and nerd presets.
 */
import { beforeAll, describe, expect, it } from "bun:test";
import { readStatusLineStartupData } from "@oh-my-pi/pi-tui/status-line/startup";
import type { SegmentContext } from "@oh-my-pi/pi-tui/status-line/segments";
import { renderSegment } from "@oh-my-pi/pi-tui/status-line/segments";
import { SYMBOL_PRESETS } from "@oh-my-pi/pi-tui/theme/symbols";
import { initTheme, theme } from "@oh-my-pi/pi-tui/theme";
import type { CodeModeDecision } from "./helpers";

beforeAll(async () => {
	await initTheme();
});

function createContext(options: { codeModeActive: boolean; decision?: CodeModeDecision }): SegmentContext {
	return {
		session: {
			state: { model: { id: "test-model", name: "Test Model", provider: "test" } },
			isFastModeActive: () => false,
			isAutoThinking: false,
			autoResolvedThinkingLevel: () => undefined,
			isAdvisorActive: () => false,
			getAnthropicSlowModeLabel: () => undefined,
			// `[planned]` `AgentSession.isCodeModeActive()` and `getCodeModeDecision()`.
			isCodeModeActive: () => options.codeModeActive,
			getCodeModeDecision: () => options.decision,
		} as unknown as SegmentContext["session"],
		width: 120,
		compactThinkingLevel: false,
		options: {},
		planMode: null,
		loopMode: null,
		prewalk: null,
		goalMode: null,
		vibeMode: null,
		vim: null,
		collab: null,
		stream: null,
		recording: false,
		usageStats: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			orchestrationInput: 0,
			orchestrationOutput: 0,
			orchestrationCacheRead: 0,
			premiumRequests: 0,
			cost: 0,
			tokensPerSecond: null,
		},
		contextPercent: 0,
		contextTokens: 0,
		contextWindow: 0,
		autoCompactEnabled: false,
		compactionSpeculation: "idle",
		speculationBlinkOn: true,
		subagentCount: 0,
		activeMs: 0,
		turnElapsedMs: null,
		activeRepo: null,
		worktree: null,
		git: { branch: null, status: null, pr: null },
		usage: null,
	};
}

describe("Code Mode status-line indicator (F3)", () => {
	it("CM-I1 the model segment renders icon.codeMode only while Code Mode is active", () => {
		// `[planned]` theme symbol key: `icon.codeMode`.
		const icon = (theme.icon as unknown as Record<string, string | undefined>).codeMode;
		expect(icon).toBeTruthy();
		const active = renderSegment("model", createContext({ codeModeActive: true }));
		const inactive = renderSegment("model", createContext({ codeModeActive: false }));
		expect(active.content).toContain(icon!);
		expect(inactive.content).not.toContain(icon!);
	});

	it("CM-I2 a rule/state divergence renders the icon muted", () => {
		const icon = (theme.icon as unknown as Record<string, string | undefined>).codeMode;
		expect(icon).toBeTruthy();
		const active = renderSegment("model", createContext({ codeModeActive: true }));
		const diverged = renderSegment(
			"model",
			createContext({
				codeModeActive: true,
				decision: { enabled: false, source: "scope.roles", detail: "smol" },
			}),
		);
		expect(diverged.content).toContain(icon!);
		expect(diverged.content).not.toEqual(active.content);
		// `[planned]` muted presentation uses the dim theme color.
		expect(diverged.content).toContain(theme.fg("dim", icon!));
	});

	it("CM-I3 the startup snapshot accepts and round-trips a codeMode boolean", () => {
		const base = {
			settings: {},
			gitEnabled: false,
			model: {
				id: "test-model",
				name: "Test Model",
				provider: "test",
				api: "openai-completions",
				contextWindow: 200_000,
			},
			autoThinking: false,
			fastMode: false,
			usingSubscription: false,
			autoCompactEnabled: false,
			compactionBoundaries: null,
		};
		const on = readStatusLineStartupData({ ...base, codeMode: true }) as
			| (Record<string, unknown> & { codeMode?: boolean })
			| undefined;
		const off = readStatusLineStartupData({ ...base, codeMode: false }) as
			| (Record<string, unknown> & { codeMode?: boolean })
			| undefined;
		expect(on).toBeDefined();
		expect(on?.codeMode).toBe(true);
		expect(off).toBeDefined();
		expect(off?.codeMode).toBe(false);
	});

	it("CM-I4 icon.codeMode exists in the unicode and nerd symbol sets", () => {
		const unicode = (SYMBOL_PRESETS.unicode as unknown as Record<string, string | undefined>)["icon.codeMode"];
		const nerd = (SYMBOL_PRESETS.nerd as unknown as Record<string, string | undefined>)["icon.codeMode"];
		expect(unicode).toBeTruthy();
		expect(nerd).toBeTruthy();
	});
});

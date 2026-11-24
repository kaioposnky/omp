/**
 * Model-scoped guidance shipped with the coding agent.
 *
 * Each rule is `alwaysApply` and carries a `models` scope, so it reaches only
 * the system prompt of a matching model (see `ruleAppliesToModel`). The texts
 * come from the per-model benchmark in `packages/metaharness/scripts/behavior-map`
 * (`MODEL-NOTES.md`): each targets a habit that repeated for that model and
 * did not occur for the others.
 *
 * Registered below the native provider, so a user or project rule with the
 * same name replaces a bundled one; `ttsr.disabledRules` drops one by name.
 */
import { registerProvider } from "../../capability";
import { type Rule, ruleCapability } from "../../capability/rule";
import type { LoadContext, LoadResult } from "../../capability/types";
import { buildRuleFromMarkdown, createSourceMeta } from "../helpers";
import claudeOpus from "./claude-opus.md" with { type: "text" };
import claudeSonnet from "./claude-sonnet.md" with { type: "text" };
import deepseek from "./deepseek.md" with { type: "text" };
import gpt6Terra from "./gpt-6-terra.md" with { type: "text" };

export const BUILTIN_MODEL_RULES_PROVIDER_ID = "builtin-model-rules";

const SOURCES = [
	{ name: "model-claude-opus", content: claudeOpus },
	{ name: "model-claude-sonnet", content: claudeSonnet },
	{ name: "model-deepseek", content: deepseek },
	{ name: "model-gpt-6-terra", content: gpt6Terra },
] as const;

async function loadRules(_ctx: LoadContext): Promise<LoadResult<Rule>> {
	const items = SOURCES.map(({ name, content }) => {
		const virtualPath = `${BUILTIN_MODEL_RULES_PROVIDER_ID}:${name}.md`;
		const source = createSourceMeta(BUILTIN_MODEL_RULES_PROVIDER_ID, virtualPath, "user");
		return buildRuleFromMarkdown(name, content, virtualPath, source, { ruleName: name });
	});
	return { items };
}

registerProvider<Rule>(ruleCapability.id, {
	id: BUILTIN_MODEL_RULES_PROVIDER_ID,
	displayName: "Builtin Model Rules",
	description: "Model-scoped guidance shipped with the agent (disable one via ttsr.disabledRules)",
	priority: 2,
	load: loadRules,
});

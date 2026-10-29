import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Runs the parts of an exported n8n workflow that hold logic (Set, Switch and the
 * URL/body expressions of HTTP nodes) against a given item, so tests can check what
 * the live workflow would send without n8n. Expressions are plain JavaScript over
 * `$json` and `$('Node').item.json`, the only n8n helpers our workflows use.
 */

interface WorkflowNode {
  name: string;
  type: string;
  parameters: Record<string, unknown>;
  credentials?: Record<string, { id: string; name: string }>;
  onError?: string;
}

interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  connections: Record<string, { main: { node: string }[][] }>;
}

type Item = Record<string, unknown>;
type NodeRefs = Record<string, Item>;

interface Assignment {
  name: string;
  type: string;
  value: unknown;
}

interface SwitchRule {
  outputKey: string;
  conditions: { conditions: { leftValue: string; rightValue: string; operator: { operation: string } }[] };
}

export function loadWorkflow(file: string): Workflow {
  const path = fileURLToPath(new URL(`../../n8n/workflows/${file}`, import.meta.url));
  return JSON.parse(readFileSync(path, "utf8")) as Workflow;
}

export function nodeOf(workflow: Workflow, name: string): WorkflowNode {
  const node = workflow.nodes.find((candidate) => candidate.name === name);
  if (!node) throw new Error(`workflow "${workflow.name}" has no node "${name}"`);
  return node;
}

/** Names of the nodes wired to the given output of a node. */
export function nextNodes(workflow: Workflow, name: string, output = 0): string[] {
  return (workflow.connections[name]?.main[output] ?? []).map((link) => link.node);
}

function evaluate(code: string, json: Item, refs: NodeRefs): unknown {
  const $ = (node: string) => {
    if (!(node in refs)) throw new Error(`expression reads node "${node}", which the test did not provide`);
    return { item: { json: refs[node] } };
  };
  return new Function("$json", "$", `return (${code});`)(json, $);
}

/** Resolves an n8n parameter value: plain values pass through, `=` values are expressions or templates. */
export function resolve(value: unknown, json: Item, refs: NodeRefs = {}): unknown {
  if (typeof value !== "string" || !value.startsWith("=")) return value;
  const template = value.slice(1);
  const whole = /^\{\{([\s\S]*?)\}\}$/.exec(template.trim());
  if (whole && !template.trim().slice(2, -2).includes("}}")) return evaluate(whole[1], json, refs);
  return template.replace(/\{\{([\s\S]*?)\}\}/g, (_, code: string) => String(evaluate(code, json, refs)));
}

/** Output of a Set node ("manual" mode) for one item. */
export function runSet(workflow: Workflow, name: string, json: Item, refs: NodeRefs = {}): Item {
  const node = nodeOf(workflow, name);
  const assignments = (node.parameters.assignments as { assignments: Assignment[] }).assignments;
  const base: Item = node.parameters.includeOtherFields ? { ...json } : {};
  return assignments.reduce<Item>((out, { name: field, type, value }) => {
    const resolved = resolve(value, json, refs);
    return { ...out, [field]: type === "string" ? String(resolved) : resolved };
  }, base);
}

/** Index of the Switch output an item goes to; the fallback output comes after the rules. */
export function runSwitch(workflow: Workflow, name: string, json: Item): { output: number; key: string } {
  const node = nodeOf(workflow, name);
  const rules = (node.parameters.rules as { values: SwitchRule[] }).values;
  const index = rules.findIndex((rule) =>
    rule.conditions.conditions.every((condition) => {
      if (condition.operator.operation !== "equals") throw new Error(`unsupported operator ${condition.operator.operation}`);
      return resolve(condition.leftValue, json) === condition.rightValue;
    }),
  );
  if (index >= 0) return { output: index, key: rules[index].outputKey };
  const options = node.parameters.options as { fallbackOutput?: string; renameFallbackOutput?: string };
  if (options.fallbackOutput !== "extra") throw new Error(`switch "${name}" drops items that match no rule`);
  return { output: rules.length, key: options.renameFallbackOutput ?? "Fallback" };
}

/** The request an HTTP Request node would make for one item. */
export function runHttp(workflow: Workflow, name: string, json: Item, refs: NodeRefs = {}) {
  const node = nodeOf(workflow, name);
  const { method = "GET", url, jsonBody } = node.parameters as { method?: string; url: string; jsonBody?: string };
  const body = jsonBody === undefined ? undefined : JSON.parse(String(resolve(jsonBody, json, refs)));
  return { method, url: String(resolve(url, json, refs)), body };
}

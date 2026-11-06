#!/usr/bin/env node
// Offline validation of a canonical Spec tasks.md. Reuses the Producer parser
// only: no GitHub API, Work Queue or network access, so it is safe to run
// locally and from the pull request Check.
import { readFileSync } from "node:fs";
import { parseTasks } from "./spec-task-producer.mjs";

function fail(message) {
  console.error("::error::validate-tasks: " + message);
  process.exit(1);
}

const usage = "usage: node scripts/ci/validate-tasks.mjs specs/<feature>/tasks.md";
const args = process.argv.slice(2);
if (args.length !== 1) fail(usage);
const file = args[0];

let markdown;
try {
  markdown = readFileSync(file, "utf8");
} catch (error) {
  fail("cannot read " + file + ": " + (error?.message ?? String(error)));
}

let tasks;
try {
  tasks = parseTasks(markdown);
} catch (error) {
  fail(file + ": " + (error?.message ?? String(error)));
}

console.log("validate-tasks PASS: " + file + " parsed " + tasks.length +
  " Work Items (" + tasks.map(task => task.id).join(", ") + ")");

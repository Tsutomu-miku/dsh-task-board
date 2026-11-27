import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { BoardError } from "../errors.mjs"

const exec = promisify(execFile)

function ciStatus(checks) {
  if (!checks.length) return "none"
  if (checks.some(check => check.status === "COMPLETED" &&
      !["SUCCESS", "NEUTRAL", "SKIPPED"].includes(check.conclusion))) return "failure"
  if (checks.some(check => check.status && check.status !== "COMPLETED")) return "pending"
  if (checks.some(check => ["FAILURE", "ERROR"].includes(check.state))) return "failure"
  return checks.every(check => check.status === "COMPLETED" || check.state === "SUCCESS") ? "success" : "pending"
}

async function readPublicPullRequest(url, signal) {
  const [, owner, repo, , number] = new URL(url).pathname.split("/")
  const base = `https://api.github.com/repos/${owner}/${repo}`
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
  async function read(path) {
    const response = await fetch(base + path, {
      signal: bounded, redirect: "error", headers: { accept: "application/vnd.github+json" },
    })
    if (!response.ok) throw new Error("GitHub API rejected the request")
    return response.json()
  }
  const pr = await read(`/pulls/${number}`)
  if (!/^[a-f0-9]{40}$/.test(pr.head?.sha ?? "")) throw new Error("GitHub did not report a head commit")
  const ref = `/commits/${pr.head.sha}`
  const [statuses, firstPage] = await Promise.all([read(ref + "/status"), read(ref + "/check-runs?per_page=100")])
  const pages = Math.ceil(firstPage.total_count / 100)
  if (pages > 20) throw new Error("Too many check runs")
  const rest = await Promise.all(Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
    read(`${ref}/check-runs?per_page=100&page=${index + 2}`)))
  const checks = [firstPage, ...rest].flatMap(page => page.check_runs.map(run => ({
    status: run.status.toUpperCase(), conclusion: run.conclusion?.toUpperCase(),
  })))
  if (statuses.total_count) checks.push({ state: statuses.state.toUpperCase() })
  return {
    state: pr.merged ? "MERGED" : pr.state.toUpperCase(),
    mergeStateStatus: pr.mergeable_state?.toUpperCase() ?? "UNKNOWN",
    headRefName: pr.head.ref, headRefOid: pr.head.sha, statusCheckRollup: checks,
  }
}

export async function readPullRequest(url, signal) {
  let data
  try {
    const { stdout } = await exec("gh", ["pr", "view", url,
      "--json", "state,mergeStateStatus,headRefName,headRefOid,statusCheckRollup"], {
      timeout: 10_000, signal, maxBuffer: 768 * 1024,
      env: { ...process.env, GH_PROMPT_DISABLED: "1" },
    })
    data = JSON.parse(stdout)
  } catch {
    signal.throwIfAborted()
    try { data = await readPublicPullRequest(url, signal) } catch {
      throw new BoardError(502, "无法读取 PR 和 CI 状态。私有仓库需要本机 GitHub CLI 登录权限。")
    }
  }
  return {
    status: String(data.state), mergeState: String(data.mergeStateStatus),
    branch: String(data.headRefName), commit: String(data.headRefOid),
    ci: ciStatus(data.statusCheckRollup ?? []), checkedAt: Date.now(),
  }
}

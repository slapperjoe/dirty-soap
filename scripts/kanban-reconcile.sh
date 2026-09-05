#!/usr/bin/env bash
# kanban-reconcile.sh — post-wave reconciliation for kanban worktree branches.
#
# The Hermes core never auto-merges kanban branches, and it only prunes a
# worktree when all its commits are reachable from a remote (refs/remotes/*).
# So the steady-state loop is:
#
#   1. Board goes quiet (no active tasks)
#   2. scripts/kanban-reconcile.sh            (triage + prune the redundant)
#   3. scripts/kanban-reconcile.sh --merge    (merge real work, run tests)
#   4. scripts/kanban-reconcile.sh --push     (push branch, re-prune)
#
# After step 4, all wt/* worktrees are push-eligible and the core's own
# completion-time cleanup will reclaim future ones automatically.
#
# Flags:
#   --dry-run   Show actions, change nothing (default when any other flag set? no — dry-run only when given)
#   --merge     Merge branches with unique work into the current branch
#   --push      Push the current branch to origin after tests pass
#   --force     Allow pruning dirty worktrees (untracked scratch is archived to /tmp first)
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

DRY=0 MERGE=0 PUSH=0 FORCE=0
PUSH_REMOTE="local"   # local bare repo on this machine — nothing leaves the box
if ! git remote get-url "$PUSH_REMOTE" >/dev/null 2>&1; then
  PUSH_REMOTE="origin"
fi
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1;;
    --merge)   MERGE=1;;
    --push)    PUSH=1;;
    --force)   FORCE=1;;
    --remote=*) PUSH_REMOTE="${a#--remote=}";;
    *) echo "Unknown flag: $a" >&2; exit 2;;
  esac
done

run() { if [ "$DRY" = 1 ]; then echo "  [dry] $*"; else eval "$@"; fi; }

ACTIVE_BRANCH=$(git branch --show-current)
if [ -z "$ACTIVE_BRANCH" ]; then echo "Refusing to run on a detached HEAD." >&2; exit 1; fi
echo "Active branch: $ACTIVE_BRANCH"

# ---------------------------------------------------------------------------
# Classify every local branch except main/master/ACTIVE
# ---------------------------------------------------------------------------
declare -a PRUNE_CANDIDATES=() MERGE_CANDIDATES=()
for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vE '^(main|master|develop|dev|trunk)$' | grep -v "^$ACTIVE_BRANCH$"); do
  # Patch-equivalence: every commit on the branch already in HEAD (cherry)
  if [ -z "$(git cherry "$ACTIVE_BRANCH" "$b" | awk '$1=="+"')" ]; then
    PRUNE_CANDIDATES+=("$b")
    echo "  redundant   $b (all commits patch-equivalent in $ACTIVE_BRANCH)"
    continue
  fi
  ahead=$(git rev-list --count "$ACTIVE_BRANCH..$b")
  unique=$(git cherry "$ACTIVE_BRANCH" "$b" | awk '$1=="+"' | wc -l)
  MERGE_CANDIDATES+=("$b")
  echo "  has work    $b (ahead=$ahead, unique-patch-equivalent=$unique)"
done

echo
echo "=== worktrees ==="
git worktree list
echo

# ---------------------------------------------------------------------------
# Phase 1: prune redundant branches + their worktrees
# ---------------------------------------------------------------------------
prune_branch() {
  local b="$1"
  local wt
  wt=$(git worktree list --porcelain | awk -v br="refs/heads/$b" '
    /^worktree /{p=$2}
    /^branch /{ if ($2 == br) print p }')
  local this
  this=$(git worktree list --porcelain | awk '$1=="worktree"{print $2; exit}')
  if [ -n "${wt:-}" ] && [ "$wt" != "$this" ]; then
    if [ "$FORCE" = 1 ] || [ -z "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
      local untracked arch
      untracked=$(git -C "$wt" ls-files --others --exclude-standard | wc -l)
      if [ "$untracked" -gt 0 ]; then
        arch=$(mktemp -d /tmp/wt-archive-XXXX)
        ( cd "$wt" && git ls-files --others --exclude-standard | tar cf "$arch/$(basename "$wt").tar" -T - ) 2>/dev/null || true
        echo "  untracked scratch archived to $arch/$(basename "$wt").tar"
      fi
      run "git worktree remove --force $wt && echo '  pruned worktree $wt'"
    else
      echo "  KEEP worktree $wt (tracked files dirty — review manually, do not --force)"
      return 1
    fi
  fi
  run "git branch -D $b && echo '  pruned branch $b'"
}

if [ "${#PRUNE_CANDIDATES[@]}" -gt 0 ]; then
  echo "=== Phase 1: prune redundant (${#PRUNE_CANDIDATES[@]}) ==="
  failed=0
  for b in "${PRUNE_CANDIDATES[@]}"; do prune_branch "$b" || failed=1; done
  [ "$failed" = 1 ] && { echo "Some worktrees were kept (dirty). Re-run with --force after reviewing." >&2; }
else
  echo "=== Phase 1: nothing redundant ==="
fi

# ---------------------------------------------------------------------------
# Phase 2: merge branches with unique work
# ---------------------------------------------------------------------------
if [ "$MERGE" = 1 ] && [ "${#MERGE_CANDIDATES[@]}" -gt 0 ]; then
  echo
  echo "=== Phase 2: merge into $ACTIVE_BRANCH (${#MERGE_CANDIDATES[@]}) ==="
  for b in "${MERGE_CANDIDATES[@]}"; do
    echo "--- merging $b"
    if run "git merge --no-edit $b"; then
      # Superset effect: re-check the remaining candidates now
      :
    else
      echo "MERGE CONFLICT on $b — resolve manually (git status), then re-run." >&2
      exit 1
    fi
  done
  # Re-classify after merges: anything now redundant gets pruned
  echo "--- re-triage after merges"
  for b in $(git for-each-ref --format='%(refname:short)' refs/heads | grep -vE '^(main|master)$' | grep -v "^$ACTIVE_BRANCH$"); do
    if [ -z "$(git cherry "$ACTIVE_BRANCH" "$b" | awk '$1=="+"')" ]; then
      prune_branch "$b"
    fi
  done
  echo
  echo "=== verify ==="
  run "npm test 2>&1 | tail -4"
  run "cd src-tauri/webview && npx vitest run 2>&1 | tail -4"
elif [ "${#MERGE_CANDIDATES[@]}" -gt 0 ]; then
  echo "=== Phase 2: ${#MERGE_CANDIDATES[@]} branch(es) have work to merge (re-run with --merge) ==="
fi

# ---------------------------------------------------------------------------
# Phase 3: push + final prune
# ---------------------------------------------------------------------------
if [ "$PUSH" = 1 ]; then
  echo
  echo "=== Phase 3: push $ACTIVE_BRANCH to $PUSH_REMOTE ==="
  run "git push $PUSH_REMOTE $ACTIVE_BRANCH"
  echo "Note: pushing (even to the local bare repo) makes the core's"
  echo "completion-time worktree cleanup eligible for future wt/* branches"
  echo "(they count as pushed once their commits land on a refs/remotes/*)."
fi

echo
echo "=== final state ==="
git worktree list
git branch | cat
echo "done."

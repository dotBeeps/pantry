---
name: git-auth
description: "SSH key management with rbw/Bitwarden passphrase automation and git auth troubleshooting. Use when hitting SSH permission errors, unlocking SSH keys, managing ssh-agent, or when git/github operations need authentication."
license: MIT
compatibility: "Requires rbw (Bitwarden CLI) for passphrase automation"
---

# Git Authentication

SSH key management, rbw (Bitwarden CLI) integration, and auth troubleshooting. Load this skill when git or GitHub operations fail with authentication errors.

## Quick Check

Run these first — if both pass, auth is fine:

```bash
ssh-add -l                    # List loaded keys (should show at least one)
ssh -T git@github.com         # Test GitHub SSH (expect "Hi <user>!")
```

If `ssh-add -l` shows keys and `ssh -T` succeeds, stop here — the problem is elsewhere.

## Troubleshooting Flowchart

Follow these steps in order when SSH auth fails:

### Step 1: Test the connection

```bash
ssh -T git@github.com
```

- `"Hi <user>!"` → Auth works. Problem is elsewhere (wrong remote URL? check `git remote -v`).
- `"Permission denied (publickey)"` → Continue to step 2.

### Step 2: Check loaded keys

```bash
ssh-add -l
```

- Shows keys → Skip to step 4 (wrong key might be offered).
- `"The agent has no identities"` or `"Could not open connection"` → Continue to step 3.

### Step 3: Load keys into the agent

```bash
# Check if the agent is running
echo $SSH_AUTH_SOCK

# If empty — start the agent
eval $(ssh-agent -s)

# Add your key (may prompt for passphrase — see rbw section below)
ssh-add ~/.ssh/id_ed25519
```

If the key has a passphrase and you use rbw, see [rbw Integration](#rbw-integration). Retry step 1 after adding.

### Step 4: Verify the right key is offered

```bash
ssh -vT git@github.com 2>&1 | grep "Offering"
```

- If it offers the wrong key, check `~/.ssh/config` — see [SSH Config](#ssh-config).
- If the key isn't registered on GitHub: copy `cat ~/.ssh/id_ed25519.pub` → GitHub Settings → SSH and GPG Keys → New SSH Key.

### Step 5: Agent not persisting?

If keys disappear after reboots or new terminals:

- Check if your shell startup sources the agent (`.bashrc`, `.zshrc`, etc.)
- Use `AddKeysToAgent yes` in SSH config — keys auto-add on first use
- Set key lifetime: `ssh-add -t 28800 ~/.ssh/id_ed25519` (8 hours)

## SSH Config

Minimal config for GitHub at `~/.ssh/config`:

```
Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
```

- `IdentitiesOnly yes` — only offer the specified key, not every key in the agent
- `AddKeysToAgent yes` — auto-add to agent on first use (avoids manual `ssh-add`)

### Multiple GitHub accounts

Use Host aliases:

```
Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes

Host github.com-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
    IdentitiesOnly yes
```

Clone work repos with the alias: `git clone git@github.com-work:org/repo.git`

See [references/ssh-config-templates.md](references/ssh-config-templates.md) for more examples.

## rbw Integration

[rbw](https://github.com/doy/rbw) is an unofficial Bitwarden CLI written in Rust. Use it to provide SSH key passphrases without manual typing.

### Check vault status

```bash
rbw unlocked && echo "Vault is unlocked" || echo "Vault is locked"
```

### Unlock the vault

```bash
rbw unlock
```

This prompts for the master password interactively. The vault stays unlocked for the configured timeout.

### Load an SSH key with rbw passphrase

```bash
# Get passphrase from rbw and pipe to ssh-add
rbw get "SSH Key" | ssh-add ~/.ssh/id_ed25519
```

Adjust the entry name (`"SSH Key"`) to match the user's Bitwarden vault organization. If the entry name is unknown, ask the user.

### Combined unlock + add flow

```bash
# Ensure vault is unlocked, then add key
rbw unlocked || rbw unlock
rbw get "SSH Key" | ssh-add ~/.ssh/id_ed25519
```

### rbw entry lookup

If unsure which entry holds the passphrase:

```bash
rbw list | grep -i ssh    # Search vault entries for SSH-related items
```

## ssh-agent Management

```bash
ssh-add -l                          # List loaded keys (fingerprints)
ssh-add -L                          # List loaded keys (full public keys)
ssh-add ~/.ssh/id_ed25519           # Add a specific key
ssh-add -t 28800 ~/.ssh/id_ed25519  # Add with 8-hour lifetime
ssh-add -d ~/.ssh/id_ed25519        # Remove a specific key
ssh-add -D                          # Remove ALL keys from agent
```

- Prefer lifetime-limited keys (`-t`) over permanent — limits exposure if agent socket is compromised
- `ssh-add -l` exit code: 0 = keys loaded, 1 = no keys, 2 = agent not running

## SSH vs HTTPS

**Prefer SSH** — it's already configured and doesn't need token management.

Use HTTPS only when:
- SSH is blocked by a firewall or corporate proxy
- Setting up a new machine where SSH keys aren't configured yet
- CI environments where deploy keys are impractical

**HTTPS fallback with gh:**
```bash
gh auth setup-git    # Configures git credential helper for HTTPS
```

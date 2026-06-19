# SSH Config Templates

Copy and adapt these for `~/.ssh/config`.

## Single GitHub Account (Most Common)

```
Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes
```

## Multiple GitHub Accounts

Personal + work, each with its own key:

```
# Personal (default)
Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_personal
    IdentitiesOnly yes
    AddKeysToAgent yes

# Work (use github.com-work as hostname in git remotes)
Host github.com-work
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_work
    IdentitiesOnly yes
    AddKeysToAgent yes
```

Set per-repo remotes accordingly:

```bash
# Personal repo — normal URL
git remote set-url origin git@github.com:dotBeeps/personal-project.git

# Work repo — use the alias
git remote set-url origin git@github.com-work:company/work-project.git
```

## GitHub + Other Hosts

```
Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
    AddKeysToAgent yes

Host gitlab.com
    User git
    IdentityFile ~/.ssh/id_ed25519_gitlab
    IdentitiesOnly yes

Host codeberg.org
    User git
    IdentityFile ~/.ssh/id_ed25519_codeberg
    IdentitiesOnly yes
```

## SSH Over HTTPS Port (Firewall Bypass)

When port 22 is blocked but 443 isn't:

```
Host github.com
    HostName ssh.github.com
    Port 443
    User git
    IdentityFile ~/.ssh/id_ed25519
    IdentitiesOnly yes
```

Test with: `ssh -T -p 443 git@ssh.github.com`

## Agent Forwarding (Use Sparingly)

Forward your local SSH agent to a remote server. Only enable for trusted hosts:

```
Host trusted-server
    HostName 192.168.1.100
    User deploy
    ForwardAgent yes
    IdentityFile ~/.ssh/id_ed25519
```

**Security warning:** Agent forwarding exposes your keys to anyone with root on the remote host. Prefer deploy keys or temporary credentials instead.

## Wildcard Defaults

Apply settings to all hosts, override per-host as needed:

```
Host *
    AddKeysToAgent yes
    IdentitiesOnly yes
    ServerAliveInterval 60
    ServerAliveCountMax 3

Host github.com
    User git
    IdentityFile ~/.ssh/id_ed25519
```

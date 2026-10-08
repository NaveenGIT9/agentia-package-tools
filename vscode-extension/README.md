# Agentia Package Tools

Adds one command to VS Code:

**Generate Package XML and Deploy ZIP - Install Agentia Commands** (Ctrl+Shift+P)

It sets up everything needed to run these in a terminal:

```
agentia package generate      # package.xml from a Copado promotion  -> Downloads folder
agentia deployzip generate    # deployment zip from that package.xml -> Downloads folder
```

What the command does:

1. Checks for `git`, `npm` and the `agentia` CLI. If agentia is missing it asks, then installs it
   (`npm install -g @copado/agentia-cli`). If the global npm folder is not writable (typical on macOS) it installs into
   `~/.copado-ccv/npm` instead and offers to add that folder to your PATH.
2. Downloads the plugin from https://github.com/NaveenGIT9/agentia-package-tools into `~/.agentia-package-tools/src`,
   builds it and links it into agentia. Run the command again later to update the plugin.

Open a **new terminal** afterwards so it finds agentia. Then, on a checked-out promotion branch (for example `promotion/P34277`):

```
agentia package generate
agentia deployzip generate
```

See the plugin's README for what the two commands do: https://github.com/NaveenGIT9/agentia-package-tools

#!/usr/bin/env node
/**
 * APInox Version Management
 *
 * Single script replacing increment-build.js, sync-version.js, bump.js,
 * tauri-build.js, and update_changelog.js. The build number lives inside
 * this file as BUILD_NO.
 *
 * Commands:
 *   node scripts/version.js increment              — bump BUILD_NO in this file
 *   node scripts/version.js sync [x.y.z]          — write version to all config files
 *   node scripts/version.js bump <major|minor|patch> ["msg"] — bump + changelog + git commit + tag (patch preserved for major/minor)
 *   node scripts/version.js build [tauri-args...]  — increment + sync + build:packages + tauri build
 */

// ─── BUILD NUMBER (auto-managed — do not edit manually) ───────────────────
const BUILD_NO = 356;
// ─────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { execSync, spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const scriptFile = __filename;

const configFiles = {
  rootPackage: path.join(root, "package.json"),
  webviewPackage: path.join(root, "src-tauri", "webview", "package.json"),
  cargo: path.join(root, "src-tauri", "Cargo.toml"),
  tauriConfig: path.join(root, "src-tauri", "tauri.conf.json"),
  changelog: path.join(root, "CHANGELOG.md"),
};

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: root, ...opts });
}

function wantsLinuxAppImage(extraArgs) {
  if (process.platform !== "linux") {
    return false;
  }

  const bundlesIndex = extraArgs.findIndex((arg) => arg === "--bundles");
  if (bundlesIndex === -1) {
    return true;
  }

  const bundles = (extraArgs[bundlesIndex + 1] || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return bundles.includes("appimage") || bundles.includes("all");
}

function tryFinalizeLinuxAppImage() {
  const tauriConf = JSON.parse(fs.readFileSync(configFiles.tauriConfig, "utf8"));
  const productName = tauriConf.productName || "app";
  const bundleDir = path.join(root, "target", "release", "bundle", "appimage");
  const appDir = path.join(bundleDir, `${productName}.AppDir`);
  const desktopIcon = path.join(appDir, `${productName}.png`);
  const rootIcon = path.join(appDir, productName.toLowerCase() + ".png");
  const pluginPath = path.join(
    process.env.HOME || "",
    ".cache",
    "tauri",
    "linuxdeploy-plugin-appimage.AppImage",
  );

  if (!fs.existsSync(appDir) || !fs.existsSync(desktopIcon) || !fs.existsSync(pluginPath)) {
    return false;
  }

  if (!fs.existsSync(rootIcon)) {
    fs.copyFileSync(desktopIcon, rootIcon);
  }

  console.log("\n> linuxdeploy-plugin-appimage --appdir " + path.basename(appDir));
  const result = spawnSync(pluginPath, ["--appdir", path.basename(appDir)], {
    cwd: bundleDir,
    env: {
      ...process.env,
      APPIMAGE_EXTRACT_AND_RUN: "1",
    },
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if (result.status !== 0) {
    return false;
  }

  const generatedAppImage = path.join(bundleDir, `${productName}-x86_64.AppImage`);
  if (fs.existsSync(generatedAppImage)) {
    const version = JSON.parse(fs.readFileSync(configFiles.rootPackage, "utf8")).version;
    const tauriStyleName = path.join(bundleDir, `${productName}_${version}_amd64.AppImage`);
    if (generatedAppImage !== tauriStyleName) {
      fs.copyFileSync(generatedAppImage, tauriStyleName);
    }
  }

  return true;
}

// ── increment ──────────────────────────────────────────────────────────────
// Reads BUILD_NO from this file, increments it, and writes it back.
// Must be invoked as a separate process so the next command sees the new value.
function increment() {
  const self = fs.readFileSync(scriptFile, "utf8");
  const next = BUILD_NO + 1;
  const updated = self.replace(/^(const BUILD_NO = )\d+(;)$/m, `$1${next}$2`);
  if (updated === self) {
    console.error("❌ Could not locate BUILD_NO line in version.js");
    process.exit(1);
  }
  fs.writeFileSync(scriptFile, updated, "utf8");
  console.log(`✅ Build number incremented to: ${next}`);
}

// ── sync ───────────────────────────────────────────────────────────────────
// Composes major.minor.BUILD_NO and writes it to all four config files.
// When called as a fresh Node.js process (after increment), BUILD_NO will
// already hold the incremented value.
function sync(forcedVersion) {
  let targetVersion = forcedVersion;

  if (!targetVersion) {
    const rootPkg = JSON.parse(
      fs.readFileSync(configFiles.rootPackage, "utf8"),
    );
    const parts = rootPkg.version.split(".");
    if (parts.length < 2) {
      console.error("❌ Version in package.json must be at least major.minor");
      process.exit(1);
    }
    targetVersion = `${parts[0]}.${parts[1]}.${BUILD_NO}`;
  }

  const vParts = targetVersion.split(".");
  if (vParts.length !== 3) {
    console.error("❌ Version must be major.minor.patch");
    process.exit(1);
  }

  console.log(`\n🔄 Syncing all versions to: ${targetVersion}\n`);

  const rootPkg = JSON.parse(fs.readFileSync(configFiles.rootPackage, "utf8"));
  rootPkg.version = targetVersion;
  fs.writeFileSync(
    configFiles.rootPackage,
    JSON.stringify(rootPkg, null, 2) + "\n",
  );
  console.log(`✓ package.json → ${targetVersion}`);

  const webviewPkg = JSON.parse(
    fs.readFileSync(configFiles.webviewPackage, "utf8"),
  );
  webviewPkg.version = targetVersion;
  fs.writeFileSync(
    configFiles.webviewPackage,
    JSON.stringify(webviewPkg, null, 2) + "\n",
  );
  console.log(`✓ src-tauri/webview/package.json → ${targetVersion}`);

  let cargo = fs.readFileSync(configFiles.cargo, "utf8");
  cargo = cargo.replace(/^version = ".+"$/m, `version = "${targetVersion}"`);
  fs.writeFileSync(configFiles.cargo, cargo);
  console.log(`✓ src-tauri/Cargo.toml → ${targetVersion}`);

  const tauriConf = JSON.parse(
    fs.readFileSync(configFiles.tauriConfig, "utf8"),
  );
  tauriConf.version = targetVersion;
  fs.writeFileSync(
    configFiles.tauriConfig,
    JSON.stringify(tauriConf, null, 2) + "\n",
  );
  console.log(`✓ src-tauri/tauri.conf.json → ${targetVersion}`);

  console.log("\n✅ Version sync complete.\n");
}

// ── changelog ─────────────────────────────────────────────────────────────
function updateChangelog(version, customMessage) {
  let changelog = "";
  if (fs.existsSync(configFiles.changelog)) {
    changelog = fs.readFileSync(configFiles.changelog, "utf8");
  }

  const date = new Date().toISOString().split("T")[0];
  const header = `## [${version}] - ${date}`;

  if (changelog.includes(header)) {
    console.log("ℹ️  Changelog already has current version header.");
    return;
  }

  let changes = "";
  if (customMessage) {
    changes = `- ${customMessage}`;
  } else {
    try {
      let lastAnchor = "";
      try {
        lastAnchor = execSync('git log -n 1 --format="%H" -- package.json', {
          cwd: root,
        })
          .toString()
          .trim();
      } catch {
        /* no history */
      }

      if (lastAnchor) {
        changes = execSync(
          `git log ${lastAnchor}..HEAD --pretty=format:"- %s"`,
          { cwd: root },
        ).toString();
      } else {
        changes = execSync('git log -n 10 --pretty=format:"- %s"', {
          cwd: root,
        }).toString();
      }
    } catch {
      changes = "- Could not auto-generate changes from git.";
    }
  }

  if (!changes) changes = "- No commit messages found.";
  const entry = `${header}\n### Changes\n${changes}`;

  let newContent = "";
  if (changelog.startsWith("# Changelog")) {
    const lines = changelog.split("\n");
    const headerLines = lines.slice(0, 2).join("\n");
    const rest = lines.slice(2).join("\n");
    newContent = `${headerLines}\n\n${entry}\n${rest}`;
  } else {
    newContent = `${entry}\n${changelog}`;
  }

  fs.writeFileSync(configFiles.changelog, newContent);
  console.log(`✅ Updated CHANGELOG.md with version ${version}`);
}

// ── bump ───────────────────────────────────────────────────────────────────
function bump(type, message) {
  if (!["major", "minor", "patch"].includes(type)) {
    console.error(
      "Usage: node scripts/version.js bump <major|minor|patch> [commit_message]",
    );
    process.exit(1);
  }

  if (type === "patch") {
    // patch: increment BUILD_NO then sync in a fresh process each time
    run("node scripts/version.js increment");
    run("node scripts/version.js sync");
  } else {
    // major/minor: let npm handle the arithmetic, preserve the existing BUILD_NO as patch
    run(`npm version ${type} --no-git-tag-version`);
    run("node scripts/version.js sync");
  }

  const pkg = JSON.parse(fs.readFileSync(configFiles.rootPackage, "utf8"));
  const ver = pkg.version;

  updateChangelog(ver, message);

  run("git add .");
  const msg = message ? `v${ver}: ${message}` : `Bump version to ${ver}`;
  run(`git commit -m "${msg}"`);
  run(`git tag v${ver}`);

  console.log(`\n✅ Bumped to v${ver}\n`);
}

// ── build ──────────────────────────────────────────────────────────────────
function build(extraArgs) {
  run("node scripts/version.js increment");
  run("node scripts/version.js sync");
  run("npm run build:packages");
  run("node scripts/run-npm-install.js src-tauri/webview");

  console.log(`\n> npx tauri build ${extraArgs.join(" ")}`);
  const env = { ...process.env };
  if (process.platform === "linux") {
    env.APPIMAGE_EXTRACT_AND_RUN = "1";
  }
  const result = spawnSync("npx", ["tauri", "build", ...extraArgs], {
    cwd: root,
    shell: true,
    env,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`;
    if (
      wantsLinuxAppImage(extraArgs)
      && combinedOutput.includes("failed to run linuxdeploy")
      && tryFinalizeLinuxAppImage()
    ) {
      console.log("\n✅ AppImage completed via post-build workaround.");
    } else {
      process.exit(result.status ?? 1);
    }
  }

  // On Linux, produce an Arch Linux package only when makepkg is available
  if (process.platform === "linux") {
    let hasMakepkg = false;
    try {
      execSync("which makepkg", { stdio: "ignore" });
      hasMakepkg = true;
    } catch {
      console.log("ℹ️  makepkg not found, skipping Arch Linux packaging.");
    }
    if (hasMakepkg) {
      run("npm run package:arch");
    }
  }

  // On Linux, run the generated AppImage to verify it launches
  if (process.platform === "linux" && wantsLinuxAppImage(extraArgs)) {
    const tauriConf = JSON.parse(fs.readFileSync(configFiles.tauriConfig, "utf8"));
    const productName = tauriConf.productName || "APInox";
    const bundleDir = path.join(root, "target", "release", "bundle", "appimage");
    const files = fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir) : [];
    const appImageFiles = files
      .filter((f) => f.startsWith(productName) && f.endsWith(".AppImage"))
      .sort()
      .reverse();

    if (appImageFiles.length > 0) {
      const appImage = path.join(bundleDir, appImageFiles[0]);
      console.log(`\n🚀 Launching AppImage: ${appImageFiles[0]}`);
      run(`chmod +x "${appImage}"`);
      console.log(`LD_LIBRARY_PATH=${path.join(bundleDir, "usr", "lib")}`);
      const result = spawnSync(appImage, [], {
        cwd: bundleDir,
        env: {
          ...process.env,
          LD_LIBRARY_PATH: path.join(bundleDir, "usr", "lib"),
        },
        stdio: "inherit",
        windowsHide: true,
        timeout: 15000,
      });
      if (result.error && result.error.code === "ETIMEDOUT") {
        console.log(
          "ℹ️  AppImage launch smoke-test hit its 15s limit and was closed — the binary started successfully.",
        );
      }
      console.log(`AppImage exited with code: ${result.status}`);
    } else {
      console.log("ℹ️  No AppImage found to run.");
    }
  }
}

// ── dispatch ───────────────────────────────────────────────────────────────
const [, , cmd, ...args] = process.argv;

switch (cmd) {
  case "increment":
    increment();
    break;
  case "sync":
    sync(args[0]);
    break;
  case "bump":
    bump(args[0], args.slice(1).join(" "));
    break;
  case "build":
    build(args);
    break;
  default:
    console.error(`Unknown command: ${cmd}`);
    console.error(
      "Commands: increment | sync [x.y.z] | bump <major|minor|patch> [msg] | build [tauri-args...]",
    );
    process.exit(1);
}

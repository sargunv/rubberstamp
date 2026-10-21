import { describe, expect, it } from "vite-plus/test";

import { parseConfig } from "./config.ts";

// maplibre-native-ffi's coverage units, translated from its `ci/select.toml`.
const FFI = `
context: >-
  This repository is a C API for MapLibre Native, the C++ map renderer vendored
  as a git submodule with carried patches. Language bindings (Rust, Zig, Kotlin,
  Swift, .NET, Go, Python, Dart) wrap the C API, and small example apps use them.
  Mise defines tools and tasks, CMake presets define native targets, and Gradle
  builds the Android and Kotlin packages.

ci:
  context: |
    Every CI job installs the mise toolchain for its operating system, builds
    the native library for one target with CMake, and runs that target's binding
    tests and example builds against it. The Linux x64 jobs run the C API tests
    and every binding's test suite, so they catch most platform-independent
    problems. The other units catch what Linux x64 cannot: other compilers,
    SDKs, operating system APIs, render backends, architectures, and packaging.

    A change's size, or the number of bindings it touches, is not platform risk.
    A change to shared C++ or to code every binding shares is covered by Linux
    x64 unless it touches what only some platforms build or run: platform
    directories and source sets (such as \`androidMain\` or \`appleMain\`),
    Objective-C++ files, platform conditionals (\`#if\`, \`cfg(target_os)\`),
    \`cmake/platform/\`, platform render backends, platform SDK setup, or
    platform packaging. A test change matters only to units that run that suite
    and reach that code path.

    Every job runs the shared setup action in \`.github/actions/setup-ci-deps\`.
    A change to the job definitions puts every unit whose jobs it changes at
    risk. A shared script, mise task, tool version, or setup step that every job
    runs the same way is covered by Linux x64, except where an operating system
    runs it differently; Windows uses an older mise without the lockfile, Git
    Bash, and MSVC. A tool that a config lists only for some operating systems
    puts those operating systems' units at risk when it is added or changed.
    Release and publishing workflows do not run in pull request CI. Package
    manifests and lockfiles feed the binding builds and tests that use them.

    Hygiene always runs. It checks formatting, lint, generated binding code, and
    runs the unit tests for the CI tooling in \`ci/\`. Changes that only affect
    those need no other coverage.

    The main branch runs every unit after merge, so a pull request only needs
    the coverage that a reviewer would expect its change to put at risk.
  units:
    docs:
      covers: >-
        Builds the documentation site, a Node project using Astro and Starlight
        with dependencies installed by pnpm. Hygiene formats the pages but does
        not build the site, so any change to its pages, snippets, or
        configuration needs it. Also generates each binding's API reference with
        that binding's tools (Doxygen, Dokka, DocC, DocFX, dart doc, and others)
        from the public C headers and binding sources, so changes to those
        tools, their configuration, or the Node toolchain put it at risk.
      paths: ["docs/*"]
    linux-x64:
      covers: >-
        Linux x64 with glibc, OpenGL (EGL) and Vulkan. Runs the C API tests, the
        test suites of every binding (Rust, Zig, Kotlin JVM and Native, Swift,
        .NET, Go, Python) and the Dart build, and the example builds. This is
        the general correctness check for native code, bindings, examples, and
        build logic shared by all platforms.
    linux-arm64:
      covers: >-
        Linux ARM64 with glibc, OpenGL (EGL) and Vulkan, on ARM runners. Runs
        the same suites as Linux x64. Catches architecture-specific problems and
        ARM runner toolchain differences. Architecture-neutral changes do not
        need it.
    linux-musl:
      covers: >-
        Linux with musl libc on x64 and ARM64. Builds the native library, checks
        its musl ABI, and runs the Rust and .NET tests against it in Alpine.
        Catches libc assumptions and musl packaging problems. Code that Linux
        x64 already tests does not need it unless it depends on the libc.
    macos:
      covers: >-
        macOS ARM64 with Metal, Vulkan (MoltenVK), and OpenGL (ANGLE EGL). Runs
        the C API tests and the desktop binding suites, including Swift. Catches
        Apple Clang, Apple SDK, Metal, and macOS packaging problems.
        Platform-independent code that Linux x64 already tests does not need it.
      paths:
        - src/platform/apple/*
        - src/render/metal/*
        - cmake/apple/*
        - cmake/platform/apple.cmake
        - mise.macos.toml
        - bindings/kotlin/src/macosTest/*
        - examples/swift-map/*
    apple-mobile:
      covers: >-
        iOS, iOS simulator, Mac Catalyst, tvOS, and tvOS simulator with Metal.
        Builds the native library and the Kotlin, Swift, and Dart bindings for
        each, runs tests on the simulators, and packages the XCFramework.
        Catches mobile Apple SDK, cross-compilation, and framework packaging
        problems. Platform-independent code that Linux x64 already tests does
        not need it.
      paths:
        - src/platform/apple/*
        - src/render/metal/*
        - cmake/apple/*
        - cmake/platform/apple.cmake
        - cmake/toolchains/apple.cmake
        - cmake/mln_ffi_apple_framework.cmake
        - .mise/tasks/package-xcframework
        - bindings/kotlin/src/iosTest/*
        - bindings/kotlin/src/tvosTest/*
    windows:
      covers: >-
        Windows x64 and ARM64 with OpenGL (WGL) and Vulkan, built with MSVC.
        Runs the C API tests and the desktop binding suites. Windows CI uses an
        older mise release without the lockfile. Catches MSVC, Windows API, path
        and filesystem, shell, and Windows toolchain installation problems.
        Platform-independent code that Linux x64 already tests does not need it.
      paths:
        - src/platform/windows/*
        - src/render/opengl/wgl_*
        - cmake/platform/windows.cmake
        - mise.windows.toml
        - .github/actions/setup-windows-*
    android:
      covers: >-
        Android on ARM, ARM64, and x64 with OpenGL ES (EGL) and Vulkan, built
        with the NDK. The x64 jobs run the C API, Kotlin, Go, Rust, Zig, and
        Python tests in the Android emulator; the ARM jobs only build. Also
        builds the Dart binding and the Android example, and verifies multi-ABI
        packaging. Catches NDK, Android API, JNI, emulator, and AAR packaging
        problems. Platform-independent code that Linux x64 already tests does
        not need it.
      paths:
        - src/platform/android/*
        - cmake/platform/android.cmake
        - mise.android.*
        - examples/android-map/*
        - bindings/kotlin/src/android*
        - .mise/tasks/kotlin/check-android-api-floor
        - .mise/tasks/kotlin/verify-android-multi-abi
    ohos:
      covers: >-
        OpenHarmony on ARM64 and x64 with OpenGL ES (EGL) and Vulkan, built with
        the OpenHarmony SDK. The x64 jobs run the C API, Rust, and Go tests in
        the Oniro emulator; the ARM64 jobs only build. Catches OpenHarmony SDK
        and platform problems. Platform-independent code that Linux x64 already
        tests does not need it.
      paths: [cmake/platform/ohos.cmake, mise.ohos.*]
    web:
      covers: >-
        The browser, built with Emscripten for WebGL and WebGPU. Runs the C API
        tests and the Rust binding tests in a browser. Catches Emscripten,
        wasm32, and browser rendering problems. Platform-independent code that
        Linux x64 already tests does not need it.
      paths:
        - src/platform/emscripten/*
        - src/render/webgpu/*
        - cmake/platform/emscripten.cmake
        - cmake/toolchains/emscripten.cmake
        - cmake/mln_ffi_emscripten.cmake
        - mise.emscripten.*
    maven:
      covers: >-
        Assembles and verifies the Kotlin Maven repository from every native
        target's artifacts. Selecting it runs every target. Catches Kotlin
        publishing, Gradle publication, and multiplatform packaging problems.
        Only changes to what the Kotlin Maven repository contains or how it is
        assembled and verified need it: the published module set, POM metadata,
        artifact contents, and the staging and verification tasks. Ordinary
        Kotlin source and test changes, and native packaging for one platform,
        are covered by the target units.
      paths: [ci/kotlin_maven_modules.json]
`;

function errors(source: string): string[] {
  const result = parseConfig(source);
  return result.ok ? [] : result.errors;
}

describe("ci config", () => {
  it("parses maplibre-native-ffi's units in order", () => {
    const result = parseConfig(FFI);
    if (!result.ok) throw new Error(result.errors.join("\n"));
    const { ci } = result.config;
    expect(Object.keys(ci?.units ?? {})).toEqual([
      "docs",
      "linux-x64",
      "linux-arm64",
      "linux-musl",
      "macos",
      "apple-mobile",
      "windows",
      "android",
      "ohos",
      "web",
      "maven",
    ]);
    expect(ci?.context).toMatch(/^Every CI job/);
    expect(ci?.units["linux-x64"]?.paths).toEqual([]);
    expect(ci?.units["ohos"]?.paths).toEqual([
      "cmake/platform/ohos.cmake",
      "mise.ohos.*",
    ]);
  });

  it("needs at least one unit", () => {
    expect(errors("ci:\n  units: {}\n")).toEqual([
      "ci.units: name at least one unit",
    ]);
  });

  it("rejects ids that GitHub's case-insensitive contains would confuse", () => {
    expect(errors("ci:\n  units:\n    macOS: { covers: Apple }\n")).toEqual([
      "ci.units.macOS: unit ids use lowercase letters, digits, '.', '_', and '-'",
    ]);
  });

  it("rejects a unit without coverage or with unknown keys", () => {
    const found = errors(
      "ci:\n  units:\n    docs: { paths: [docs/*], jobs: [docs] }\n",
    );
    expect(found.some((e) => e.startsWith("ci.units.docs.covers"))).toBe(true);
    expect(found.some((e) => e.startsWith("ci.units.docs.jobs"))).toBe(true);
  });
});

import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { include: ["{apps,packages}/*/src/**/*.test.ts"] },
  lint: {
    plugins: ["typescript", "unicorn", "oxc", "import"],
    ignorePatterns: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/worker/worker-configuration.d.ts",
      "apps/web/src/routeTree.gen.ts",
    ],
    options: { typeAware: true, typeCheck: true },
    rules: {
      "typescript/no-explicit-any": "error",
      "typescript/consistent-type-assertions": [
        "error",
        { assertionStyle: "never" },
      ],
      "typescript/no-non-null-assertion": "error",
      "typescript/no-floating-promises": "error",
    },
  },
});

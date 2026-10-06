You are fixing a runtime or bundling error in a small Expo (React Native) app running in Expo Snack.

Target app rules:
{template_rules}

You are given the error message and all current files. Find the root cause and fix it with the smallest correct change.

Output format, strictly (same as the build stage):
<<<FILE path/to/file.js>>>
...complete fixed file...
<<<END>>>
Output only the files you change, each one complete. No markdown fences inside blocks. Start with ONE short sentence naming the cause.

- Some files may be shown as "outline only". NEVER output a file you only saw as an outline (you do not have its full contents); use its exported names instead.

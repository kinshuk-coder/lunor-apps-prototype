"""The fixed Expo template every generated app is built on.

Constraining the generated app to one entry file and a short allow-list of
packages is what keeps it reliably runnable in Expo Snack.
"""
import re
from pathlib import Path

# Packages the generated app may import (Snack resolves the versions).
ALLOWED_PACKAGES = [
    "react",
    "react-native",
    "expo-status-bar",
    "@react-navigation/native",
    "@react-navigation/native-stack",
    "@react-navigation/bottom-tabs",
    "react-native-screens",
    "react-native-safe-area-context",
    "@react-native-async-storage/async-storage",
    "@expo/vector-icons",
]

TEMPLATE_RULES = f"""- Expo managed app, plain JavaScript, entry file is App.js (default export).
- Only these packages may be imported: {", ".join(ALLOWED_PACKAGES)}. No other npm packages.
- Navigation: NavigationContainer + createNativeStackNavigator (and optionally createBottomTabNavigator).
- Header buttons: set each header option in ONE place only. Prefer `options={{({{ navigation }}) => ({{ headerRight: () => ... }})}}` on the Stack.Screen. Never also set it (e.g. `headerRight: () => null`) in App.js when a screen calls navigation.setOptions: App re-renders re-apply the prop and wipe the screen's buttons.
- Header icons/text must contrast with the header background (e.g. white on a coloured header).
- Give every screen's content horizontal padding of at least 16.
- Persistence: @react-native-async-storage/async-storage only. No backend, no network calls, no login.
- Icons: @expo/vector-icons (e.g. Ionicons). No image assets or custom fonts.
- Must work in the Snack web preview AND on a phone via Expo Go (avoid web-only or native-only APIs; no Alert.prompt).
- If a feature seems to need another package (e.g. sound via expo-av, haptics, notifications), do NOT import it: use what react-native provides instead (e.g. Vibration, an on-screen alert or animation)."""

STARTER_FILES = {
    "App.js": """import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

// Starter screen - replaced as soon as the first build task runs.
export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Lunor Apps</Text>
      <Text style={styles.subtitle}>Your app will appear here.</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { marginTop: 8, color: '#666' },
});
""",
}

_IMPORT_RE = re.compile(r"""(?:\bfrom\s*|\bimport\s*|\brequire\(\s*)['"]([^'"]+)['"]""")


def disallowed_imports(files: dict[str, str]) -> dict[str, list[str]]:
    """{path: [packages]} for imports that are neither relative nor on the allow-list."""
    bad: dict[str, list[str]] = {}
    for path, src in files.items():
        for spec in _IMPORT_RE.findall(src):
            if spec.startswith("."):
                continue
            pkg = "/".join(spec.split("/")[:2]) if spec.startswith("@") else spec.split("/")[0]
            if pkg not in ALLOWED_PACKAGES and pkg not in bad.get(path, []):
                bad.setdefault(path, []).append(pkg)
    return bad


PROMPTS_DIR = Path(__file__).parent / "prompts"


def prompt(name: str) -> str:
    text = (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    return text.replace("{template_rules}", TEMPLATE_RULES)

export interface Preset {
  id: string;
  group: string;
  title: string;
  desc: string;
  code: string;
}

// Each preset is a plain JavaScript file in ./files, bundled as a raw string.
// The file starts with a header that carries its metadata:
//
//   // @group Dashboards
//   // @title Hello, dashboard
//   // @desc stat, gauge, line, top
//
// The numeric filename prefix orders presets and groups. The same files are
// executed by pkg/runtime/presets_test.go, so every preset is known to run.
const files = import.meta.glob("./files/*.js", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

function parse(path: string, raw: string): Preset {
  const id = path.replace(/^.*\//, "").replace(/\.js$/, "").replace(/^\d+-/, "");
  const meta: Record<string, string> = {};
  const lines = raw.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const m = /^\/\/ @(\w+) (.*)$/.exec(lines[i]);
    if (!m) break;
    meta[m[1]] = m[2].trim();
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  return { id, group: meta.group ?? "Other", title: meta.title ?? id, desc: meta.desc ?? "", code: lines.slice(i).join("\n") };
}

export const PRESETS: Preset[] = Object.keys(files)
  .sort()
  .map((p) => parse(p, files[p]));

export const PRESET_GROUPS = PRESETS.reduce<{ name: string; items: Preset[] }[]>((acc, p) => {
  let g = acc.find((x) => x.name === p.group);
  if (!g) acc.push((g = { name: p.group, items: [] }));
  g.items.push(p);
  return acc;
}, []);

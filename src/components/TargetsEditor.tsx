import { useEffect, useState } from "react";
import { useStore } from "../store";
import {
  editPublishConfig,
  publishConfigRead,
  publishConfigWrite,
} from "../ipc";
import { Select } from "./Select";

/**
 * Edit targets… : the publish targets in ~/.config/md-viewer/publish.json,
 * edited in a form. Saving a new or changed command asks for a yes in a native
 * dialog (the backend shows it), so documents can't add commands on their own.
 */

type Json = Record<string, unknown>;
type Kind = "gist" | "pages" | "command" | "mcp";

interface Server {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

interface Example {
  name: string;
  about: string;
  target: Json;
  servers?: Record<string, Server>;
}

const EXAMPLES: Example[] = [
  {
    name: "GitHub Gist (secret)",
    about:
      "Anyone with the link can read it; it's not listed on your profile. Uses your gh login.",
    target: { id: "gist", label: "GitHub Gist", kind: "gist", public: false },
  },
  {
    name: "Password-protected page",
    about:
      "Encrypted in md-viewer, hosted on your GitHub Pages; readers need the password. Nothing to set up.",
    target: {
      id: "protected-page",
      label: "Password-protected page",
      kind: "pages",
    },
  },
  {
    name: "GitHub Gist (public)",
    about: "Listed on your GitHub profile and findable in search.",
    target: {
      id: "gist-public",
      label: "Public Gist",
      kind: "gist",
      public: true,
    },
  },
  {
    name: "Your web server (scp)",
    about:
      "Copies the file to a folder your web server serves, then prints its link.",
    target: {
      id: "web",
      label: "My web server",
      command:
        'scp "$MDV_FILE" you@your-site.example:/var/www/notes/ && echo "https://your-site.example/notes/$(basename "$MDV_FILE")"',
    },
  },
  {
    name: "Rendered page on your server",
    about:
      "Same, but publishes the rendered HTML (like Export as HTML) instead of the markdown.",
    target: {
      id: "web-html",
      label: "Web page",
      format: "html",
      command:
        'scp "$MDV_FILE" you@your-site.example:/var/www/notes/ && echo "https://your-site.example/notes/$(basename "$MDV_FILE")"',
    },
  },
  {
    name: "Cloud storage (rclone)",
    about:
      "Any storage rclone knows (S3-compatible buckets, Drive, Dropbox…), served at a public URL.",
    target: {
      id: "bucket",
      label: "Cloud bucket",
      command:
        'rclone copyto "$MDV_FILE" "mybucket:notes/$(basename "$MDV_FILE")" && echo "https://files.your-site.example/notes/$(basename "$MDV_FILE")"',
    },
  },
  {
    name: "MCP server",
    about:
      "A notes or wiki service with a local MCP server: tool calls to create, then update, a page.",
    servers: { notes: { command: "notes-mcp", args: [] } },
    target: {
      id: "notes",
      label: "Team Notes",
      server: "notes",
      create: [
        {
          tool: "create_page",
          args: { title: "{title}", markdown: "{content}" },
          save: { id: "page.id", url: "page.url" },
        },
      ],
      update: [
        { tool: "update_page", args: { id: "{id}", markdown: "{content}" } },
      ],
      urlTemplate: "https://notes.your-site.example/p/{id}",
    },
  },
];

function kindOf(t: Json): Kind {
  if (t.kind === "gist") return "gist";
  if (t.kind === "pages") return "pages";
  if (t.kind === "command" || typeof t.command === "string") return "command";
  return "mcp";
}

const KIND_LABEL: Record<Kind, string> = {
  gist: "Gist",
  pages: "Protected",
  command: "Command",
  mcp: "MCP",
};

function uniqueId(base: string, taken: string[]): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "target";
  let id = slug;
  for (let n = 2; taken.includes(id); n++) id = `${slug}-${n}`;
  return id;
}

export function TargetsEditor() {
  const open = useStore((s) => s.targetsEditorOpen);
  return open ? <Editor /> : null;
}

function Editor() {
  const close = () => useStore.getState().setTargetsEditorOpen(false);
  // Everything in the file we don't edit (e.g. "path", "_readme") is kept.
  const [rest, setRest] = useState<Json>({});
  const [targets, setTargets] = useState<Json[]>([]);
  const [servers, setServers] = useState<Record<string, Server>>({});
  // MCP steps are edited as JSON text; parsed on save.
  const [steps, setSteps] = useState<
    Record<number, { create: string; update: string }>
  >({});
  const [selected, setSelected] = useState(0);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    publishConfigRead()
      .then((text) => {
        const cfg = JSON.parse(text) as Json;
        const { targets: t, servers: s, ...others } = cfg;
        const list = Array.isArray(t) ? (t as Json[]) : [];
        setRest(others);
        setTargets(list);
        setServers((s as Record<string, Server>) ?? {});
        setSteps(Object.fromEntries(list.map((x, i) => [i, stepText(x)])));
        setLoaded(true);
      })
      .catch((err) =>
        setError(
          `Couldn't read publish.json: ${String(err)}. Fix it with "Open JSON file…".`,
        ),
      );
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      useStore.getState().setTargetsEditorOpen(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const target = targets[selected];
  const kind = target ? kindOf(target) : null;

  const update = (patch: Json) =>
    setTargets((list) =>
      list.map((t, i) => (i === selected ? dropEmpty({ ...t, ...patch }) : t)),
    );

  const addExample = (ex: Example) => {
    const id = uniqueId(
      String(ex.target.id),
      targets.map((t) => String(t.id)),
    );
    const added = { ...ex.target, id };
    setTargets((list) => [...list, added]);
    setSteps((s) => ({ ...s, [targets.length]: stepText(added) }));
    if (ex.servers) setServers((s) => ({ ...ex.servers, ...s }));
    setSelected(targets.length);
    setPicking(false);
  };

  const remove = () => {
    setTargets((list) => list.filter((_, i) => i !== selected));
    setSteps((s) =>
      Object.fromEntries(
        Object.entries(s)
          .filter(([i]) => Number(i) !== selected)
          .map(([i, v]) => [
            Number(i) > selected ? Number(i) - 1 : Number(i),
            v,
          ]),
      ),
    );
    setSelected((i) => Math.max(0, i - 1));
  };

  const save = async () => {
    setError(null);
    const ids = targets.map((t) => String(t.id ?? "").trim());
    if (ids.some((id) => !id)) return setError("Every target needs an ID.");
    if (new Set(ids).size !== ids.length)
      return setError("Target IDs must be unique.");
    const blank = targets.findIndex(
      (t) => kindOf(t) === "command" && !String(t.command).trim(),
    );
    if (blank >= 0) {
      setSelected(blank);
      return setError(`“${String(targets[blank].label)}” needs a command.`);
    }
    const out: Json[] = [];
    for (const [i, t] of targets.entries()) {
      if (kindOf(t) !== "mcp") {
        out.push(t);
        continue;
      }
      try {
        const s = steps[i] ?? stepText(t);
        out.push(
          dropEmpty({
            ...t,
            create: JSON.parse(s.create || "[]"),
            update: JSON.parse(s.update || "[]"),
          }),
        );
      } catch (err) {
        setSelected(i);
        return setError(
          `“${String(t.label)}”: the steps aren't valid JSON (${String(err)}).`,
        );
      }
    }
    const cfg = { ...rest, servers, targets: out };
    setSaving(true);
    try {
      // The backend asks for a native yes if this adds or changes a command.
      await publishConfigWrite(`${JSON.stringify(cfg, null, 2)}\n`);
      close();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const serverNames = Object.keys(servers);

  return (
    <div className="settings-backdrop" onClick={() => !saving && close()}>
      <div
        className="remote-prompt targets-editor"
        onClick={(event) => event.stopPropagation()}
      >
        <span className="remote-prompt-label">Publish targets</span>

        <div className="te-body">
          <div className="te-list">
            {targets.map((t, i) => (
              <button
                key={i}
                className={`te-item${i === selected && !picking ? " selected" : ""}`}
                onClick={() => {
                  setSelected(i);
                  setPicking(false);
                }}
              >
                <span className="te-item-label">
                  {String(t.label || t.id || "Untitled")}
                </span>
                <span className="te-item-kind">{KIND_LABEL[kindOf(t)]}</span>
              </button>
            ))}
            <button
              className={`te-add${picking ? " selected" : ""}`}
              onClick={() => setPicking(true)}
              disabled={!loaded}
            >
              + Add a target
            </button>
          </div>

          <div className="te-form">
            {picking || (!target && loaded) ? (
              <>
                <p className="te-help">
                  Start from an example, then fill in your own details:
                </p>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.name}
                    className="te-example"
                    onClick={() => addExample(ex)}
                  >
                    <span className="te-example-name">{ex.name}</span>
                    <span className="te-example-about">{ex.about}</span>
                  </button>
                ))}
              </>
            ) : target && kind ? (
              <>
                <Field label="Name in the Publish menu">
                  <input
                    className="remote-prompt-input"
                    value={String(target.label ?? "")}
                    onChange={(e) => update({ label: e.target.value })}
                  />
                </Field>
                <Field
                  label="ID"
                  hint="Remembers where documents were published; changing it starts over."
                >
                  <input
                    className="remote-prompt-input"
                    value={String(target.id ?? "")}
                    onChange={(e) =>
                      update({ id: e.target.value.replace(/\s/g, "-") })
                    }
                  />
                </Field>
                {kind !== "pages" && (
                  <Field label="Publishes">
                    <Select
                      value={target.format === "html" ? "html" : "md"}
                      options={[
                        { value: "md", label: "The markdown" },
                        { value: "html", label: "The rendered page (HTML)" },
                      ]}
                      onChange={(value) =>
                        update({
                          format: value === "html" ? "html" : undefined,
                        })
                      }
                    />
                  </Field>
                )}

                {kind === "pages" && (
                  <p className="te-help">
                    Publishes the rendered page, encrypted with a password you
                    choose (or a generated one) in the Publish dialog. It lives
                    in your public repo md-viewer-pages under a random name; the
                    password is kept in your Keychain.
                  </p>
                )}

                {kind === "gist" && (
                  <label className="publish-asnew">
                    <input
                      type="checkbox"
                      checked={target.public === true}
                      onChange={(e) =>
                        update({ public: e.target.checked || undefined })
                      }
                    />
                    Public (listed on your GitHub profile); otherwise secret,
                    readable by anyone with the link
                  </label>
                )}

                {kind === "command" && (
                  <Field
                    label="Command"
                    hint="Runs with sh. $MDV_FILE is the file to publish, $MDV_TITLE its title, $MDV_ID the id from last time. Print the link (https://…)."
                  >
                    <textarea
                      className="remote-prompt-input te-code"
                      rows={4}
                      spellCheck={false}
                      value={String(target.command ?? "")}
                      onChange={(e) => update({ command: e.target.value })}
                    />
                  </Field>
                )}

                {kind === "mcp" && (
                  <>
                    <Field label="MCP server">
                      <Select
                        value={String(target.server ?? "")}
                        options={[
                          ...(serverNames.includes(String(target.server ?? ""))
                            ? []
                            : [{ value: "", label: "Choose…" }]),
                          ...serverNames.map((n) => ({ value: n, label: n })),
                        ]}
                        onChange={(value) => update({ server: value })}
                      />
                    </Field>
                    {(["create", "update"] as const).map((which) => (
                      <Field
                        key={which}
                        label={
                          which === "create"
                            ? "First publish: tool calls (JSON)"
                            : "Republish: tool calls (JSON)"
                        }
                        hint={
                          which === "create"
                            ? "Placeholders: {title}, {content}, {file}. save picks id/url from the reply."
                            : "{id} is the id saved on first publish."
                        }
                      >
                        <textarea
                          className="remote-prompt-input te-code"
                          rows={5}
                          spellCheck={false}
                          value={(steps[selected] ?? stepText(target))[which]}
                          onChange={(e) =>
                            setSteps((s) => ({
                              ...s,
                              [selected]: {
                                ...(s[selected] ?? stepText(target)),
                                [which]: e.target.value,
                              },
                            }))
                          }
                        />
                      </Field>
                    ))}
                    <Field
                      label="Link template"
                      hint="Used when the reply has no link, e.g. https://…/p/{id}"
                    >
                      <input
                        className="remote-prompt-input"
                        value={String(target.urlTemplate ?? "")}
                        onChange={(e) =>
                          update({ urlTemplate: e.target.value })
                        }
                      />
                    </Field>
                    {target.server != null &&
                      servers[String(target.server)] && (
                        <ServerFields
                          name={String(target.server)}
                          server={servers[String(target.server)]}
                          onChange={(s) =>
                            setServers((all) => ({
                              ...all,
                              [String(target.server)]: s,
                            }))
                          }
                        />
                      )}
                  </>
                )}

                <button className="te-remove" onClick={remove}>
                  Remove this target
                </button>
              </>
            ) : (
              <p className="te-help">Loading…</p>
            )}
          </div>
        </div>

        {error && <p className="publish-status rb-error">{error}</p>}

        <div className="remote-prompt-actions">
          <button
            className="publish-edit"
            onClick={() => void editPublishConfig()}
            disabled={saving}
          >
            Open JSON file…
          </button>
          <button
            className="remote-prompt-cancel"
            onClick={close}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="remote-prompt-open"
            onClick={() => void save()}
            disabled={!loaded || saving}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ServerFields({
  name,
  server,
  onChange,
}: {
  name: string;
  server: Server;
  onChange: (s: Server) => void;
}) {
  return (
    <div className="te-server">
      <span className="te-server-title">Server “{name}”</span>
      <Field label="Command">
        <input
          className="remote-prompt-input"
          value={server.command}
          onChange={(e) => onChange({ ...server, command: e.target.value })}
        />
      </Field>
      <Field label="Arguments" hint="One per line.">
        <textarea
          className="remote-prompt-input te-code"
          rows={2}
          spellCheck={false}
          value={(server.args ?? []).join("\n")}
          onChange={(e) =>
            onChange({
              ...server,
              args: e.target.value.split("\n").filter((a) => a !== ""),
            })
          }
        />
      </Field>
      <Field label="Environment" hint="NAME=value, one per line.">
        <textarea
          className="remote-prompt-input te-code"
          rows={2}
          spellCheck={false}
          value={Object.entries(server.env ?? {})
            .map(([k, v]) => `${k}=${v}`)
            .join("\n")}
          onChange={(e) =>
            onChange({
              ...server,
              env: Object.fromEntries(
                e.target.value
                  .split("\n")
                  .filter((l) => l.includes("="))
                  .map((l) => [
                    l.slice(0, l.indexOf("=")).trim(),
                    l.slice(l.indexOf("=") + 1),
                  ]),
              ),
            })
          }
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="te-field">
      <span className="te-field-label">{label}</span>
      {children}
      {hint && <span className="te-hint">{hint}</span>}
    </label>
  );
}

function stepText(t: Json): { create: string; update: string } {
  return {
    create: JSON.stringify(t.create ?? [], null, 2),
    update: JSON.stringify(t.update ?? [], null, 2),
  };
}

/** Leave unset fields out of the file instead of writing "" / null. */
function dropEmpty(t: Json): Json {
  // `command` stays even when empty, or the target would turn into an MCP one.
  return Object.fromEntries(
    Object.entries(t).filter(
      ([k, v]) =>
        k === "command" || (v !== undefined && v !== "" && v !== null),
    ),
  );
}

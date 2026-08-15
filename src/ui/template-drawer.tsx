import { useEffect, useRef, useState } from "preact/hooks";
import type { Battle, Query } from "../model/types";
import {
  deleteTemplate, listTemplates, renameTemplate, saveTemplate, type Template,
} from "../storage/templates";

export function TemplateDrawer(props: {
  battle: Battle;
  query: Query;
  onLoadTemplate: (q: Query) => void;
}) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>(() => listTemplates());
  const [name, setName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (renaming !== null) renameInputRef.current?.focus();
  }, [renaming]);

  const save = () => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    setTemplates(saveTemplate(trimmed, props.battle, props.query));
    setName("");
  };

  const commitRename = (oldName: string) => {
    const trimmed = renameValue.trim();
    setRenaming(null);
    if (trimmed === "" || trimmed === oldName) return;
    if (templates.some((t) => t.name === trimmed)) {
      alert(`テンプレート「${trimmed}」は既に存在します`);
      return;
    }
    setTemplates(renameTemplate(oldName, trimmed));
  };

  return (
    <>
      <button type="button"
        class="fixed left-0 top-1/2 -translate-y-1/2 z-40 border border-gray-300 bg-bg-panel rounded-r px-1 py-3 text-xs hover:bg-emp-4"
        onClick={() => setOpen(true)}
        aria-label="テンプレート一覧を開く">
        📁
      </button>
      {open && (
        <>
          <div class="fixed inset-0 z-40 bg-black/40" onClick={() => setOpen(false)} />
          <div class="fixed left-0 top-0 bottom-0 z-50 w-80 max-w-[90vw] bg-bg-panel border-r border-gray-300 shadow-lg p-3 flex flex-col"
            onClick={(e) => e.stopPropagation()}>
            <div class="flex items-center gap-1 mb-2">
              <h3 class="font-bold flex-1">テンプレート</h3>
              <button type="button" class="text-gray-500 hover:text-red-600 px-1" onClick={() => setOpen(false)}>✕</button>
            </div>
            <div class="flex gap-1 mb-3 text-xs">
              <input type="text" class="border border-gray-300 rounded px-2 py-0.5 flex-1"
                placeholder="テンプレート名"
                value={name}
                onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <button type="button" class="border border-emp-1 rounded px-2 py-0.5 hover:bg-emp-4 disabled:opacity-40"
                disabled={name.trim() === ""}
                onClick={save}>
                保存
              </button>
            </div>
            <ul class="flex-1 overflow-auto text-xs space-y-0.5">
              {templates.map((t) => (
                <li key={t.name} class="group flex items-center gap-1 px-1 py-1 rounded hover:bg-emp-4">
                  {renaming === t.name ? (
                    <input ref={renameInputRef} type="text"
                      class="border border-emp-1 rounded px-1 flex-1"
                      value={renameValue}
                      onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                      onBlur={() => commitRename(t.name)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(t.name);
                        if (e.key === "Escape") setRenaming(null);
                      }} />
                  ) : (
                    <button type="button" class="flex-1 text-left truncate"
                      onClick={() => { props.onLoadTemplate(t.query); setOpen(false); }}>
                      📄 {t.name}
                    </button>
                  )}
                  <span class="hidden group-hover:flex gap-1 shrink-0">
                    <button type="button" class="text-gray-500 hover:text-gray-800 px-1"
                      onClick={() => { setRenaming(t.name); setRenameValue(t.name); }}
                      aria-label="名前を変更">✎</button>
                    <button type="button" class="text-gray-500 hover:text-red-600 px-1"
                      onClick={() => {
                        if (confirm(`テンプレート「${t.name}」を削除しますか?`)) {
                          setTemplates(deleteTemplate(t.name));
                        }
                      }}
                      aria-label="削除">✕</button>
                  </span>
                </li>
              ))}
              {templates.length === 0 && <li class="text-gray-500 px-1 py-1">テンプレートはまだありません</li>}
            </ul>
          </div>
        </>
      )}
    </>
  );
}

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { minimalSetup } from "codemirror";
import { useEffect, useRef } from "react";

type Props = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly readOnly: boolean;
  readonly label: string;
  readonly testId?: string;
};

const shopTheme = EditorView.theme({
  "&": { fontFamily: "var(--face-mono)", fontSize: "13px", background: "var(--paper)", border: "1px solid var(--rule)" },
  ".cm-content": { padding: "10px 12px", caretColor: "var(--vermilion)" },
  "&.cm-focused": { outline: "2px solid var(--vermilion)" },
  ".cm-line": { lineHeight: "1.55" },
});

export function PromptEditor({ value, onChange, readOnly, label, testId }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const changeHandler = useRef(onChange);
  useEffect(() => {
    changeHandler.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          minimalSetup,
          markdown(),
          EditorView.lineWrapping,
          shopTheme,
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((update) => update.docChanged && changeHandler.current(update.state.doc.toString())),
        ],
      }),
    });
    view.current = editor;
    return () => editor.destroy();
    // The editor is created once per readOnly mode; external value changes are synced below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, label]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="prompt-editor" ref={host} data-testid={testId} />;
}

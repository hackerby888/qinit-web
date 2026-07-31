import type { CSSProperties } from "react";
import type { FieldView as Field } from "./idl-view";
import { color, font } from "../landing/tokens";
import { arrayType, inputHint, type InputDraft } from "./input-values";

const inputStyle = (compact: boolean): CSSProperties => ({
  flex: 1,
  minWidth: 0,
  background: color.void,
  border: `1px solid ${color.hair2}`,
  color: color.textLight,
  fontFamily: font.mono,
  fontSize: compact ? 11 : 11.5,
  padding: compact ? "3px 6px" : "4px 7px",
  outline: "none",
});

const pathKey = (path: Array<string | number>): string => path.join(".");

function FieldControl({ field, path, draft, onChange, compact, depth }: {
  field: Field;
  path: Array<string | number>;
  draft: InputDraft;
  onChange: (next: InputDraft) => void;
  compact: boolean;
  depth: number;
}) {
  const key = pathKey(path);
  const labelWidth = compact ? 52 : Math.max(64, 64 - depth * 4);

  if (field.array && field.struct) {
    const count = arrayType(field.type)?.count ?? 0;
    return (
      <div style={{ borderLeft: `2px solid ${color.hair2}`, paddingLeft: compact ? 6 : 8, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
          <span style={{ fontFamily: font.mono, fontSize: compact ? 10 : 11, color: color.textMutedDk }}>{field.name}</span>
          <span style={{ fontFamily: font.mono, fontSize: 9.5, color: color.textGhostDk }}>{field.type}</span>
        </div>
        {Array.from({ length: count }, (_, index) => (
          <details key={index} open={count <= 4} style={{ paddingLeft: 4 }}>
            <summary style={{ cursor: "pointer", fontFamily: font.mono, fontSize: 10, color: color.textGhostDk }}>[{index}]</summary>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, paddingTop: 5 }}>
              {field.struct!.map((child) => (
                <FieldControl key={child.name} field={child} path={[...path, index, child.name]} draft={draft} onChange={onChange} compact={compact} depth={depth + 1} />
              ))}
            </div>
          </details>
        ))}
      </div>
    );
  }

  if (field.struct) {
    return (
      <div style={{ borderLeft: `2px solid ${color.hair2}`, paddingLeft: compact ? 6 : 8, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", gap: 7, alignItems: "baseline" }}>
          <span style={{ fontFamily: font.mono, fontSize: compact ? 10 : 11, color: color.textMutedDk }}>{field.name}</span>
          <span style={{ fontFamily: font.mono, fontSize: 9.5, color: color.textGhostDk }}>{field.type}</span>
        </div>
        {field.struct.map((child) => (
          <FieldControl key={child.name} field={child} path={[...path, child.name]} draft={draft} onChange={onChange} compact={compact} depth={depth + 1} />
        ))}
      </div>
    );
  }

  let placeholder = field.type;
  let unsupported: string | undefined;
  try {
    placeholder = inputHint(field);
  } catch (error) {
    unsupported = (error as Error).message;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 5 : 7 }} title={unsupported}>
      <span style={{ fontFamily: font.mono, fontSize: compact ? 10 : 11, color: color.textMutedDk, minWidth: labelWidth }}>{field.name}</span>
      <span style={{ fontFamily: font.mono, fontSize: compact ? 9.5 : 10, color: unsupported ? "#f85149" : color.textGhostDk, minWidth: compact ? 48 : 58 }}>{field.type}</span>
      <input
        className="qinit-input-hint"
        value={draft[key] ?? ""}
        onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
        placeholder={placeholder}
        aria-label={key}
        style={inputStyle(compact)}
      />
    </div>
  );
}

export function InputFields({ fields, draft, onChange, compact = false }: {
  fields: Field[];
  draft: InputDraft;
  onChange: (next: InputDraft) => void;
  compact?: boolean;
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldControl key={field.name} field={field} path={[field.name]} draft={draft} onChange={onChange} compact={compact} depth={0} />
      ))}
    </>
  );
}

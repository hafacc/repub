import Box from "@mui/material/Box";
import { type ReactElement, useEffect, useRef } from "react";
import { attachTagField, type TagField as Field } from "../src/tag-field";

/**
 * the tag field, the same one the popup uses
 *
 * It isn't a react component underneath: the popup has no react, so the field
 * is plain dom and this hands it a node to live in, which is what keeps the
 * two looking and behaving the same.
 */
export default function TagField({
  id,
  tags,
  known,
  disabled = false,
  onChange,
}: {
  id?: string;
  tags: readonly string[];
  known: readonly string[];
  disabled?: boolean;
  onChange: (tags: string[]) => void;
}): ReactElement {
  const host = useRef<HTMLDivElement | null>(null);
  const field = useRef<Field | null>(null);
  // held in a ref so that a new handler each render doesn't rebuild the field
  const report = useRef(onChange);
  report.current = onChange;

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const made = attachTagField(node, {
      id,
      onChange: (picked) => {
        report.current(picked);
      },
    });
    field.current = made;
    return () => {
      made.destroy();
      field.current = null;
    };
  }, [id]);

  // a new array every render is the same tags, and putting them back would
  // throw away whatever is half typed
  const shown = useRef<readonly string[]>([]);
  useEffect(() => {
    const same =
      shown.current.length === tags.length &&
      shown.current.every((tag, at) => tag === tags[at]);
    if (!same) {
      shown.current = tags;
      field.current?.setTags(tags);
    }
  }, [tags]);

  useEffect(() => {
    field.current?.setKnown(known);
  }, [known]);

  useEffect(() => {
    field.current?.setDisabled(disabled);
  }, [disabled]);

  return <Box ref={host} />;
}

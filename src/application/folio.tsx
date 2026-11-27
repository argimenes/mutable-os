import { onCleanup, onMount } from "solid-js";
import type { CodexFeature } from "../feature-api";
import type { ReactiveEditor } from "../reactive-editor/editor";
import { openDesktopWindow } from "./desktop-applications";
import { useManagedWindowOwner } from "../rendering/window-manager";
import "./folio.css";

export function createFolioFeature(editor: ReactiveEditor): CodexFeature {
  return { id: "folio", activate(scope) {
    const Reader = (props: { nodeKey: string }) => {
      const owner = useManagedWindowOwner();
      let frame!: HTMLIFrameElement;
      let reader: Document | null = null;
      const activate = () => {
        if (owner && owner.manager.registry.activeWindowId !== owner.windowId)
          owner.manager.lifecycle.activate(owner.windowId, false);
      };
      function listen(doc: Document | null) {
        reader?.removeEventListener("pointerdown", activate, true);
        reader?.removeEventListener("focusin", activate, true);
        reader = doc;
        reader?.addEventListener("pointerdown", activate, true);
        reader?.addEventListener("focusin", activate, true);
      }
      onMount(() => {
        onCleanup(editor.mounts.register(props.nodeKey, {
          root: frame, focusElement: frame, inputPolicy: "opaque-widget", focus: () => frame.focus(),
        }));
        if (owner) onCleanup(owner.manager.lifecycle.guard(owner.windowId, () =>
          frame.contentDocument?.dispatchEvent(new Event("folio-request-close", { cancelable: true })) ?? true));
        onCleanup(() => listen(null));
      });
      return <iframe class="folio-window-reader" ref={frame} title="Folio reader" src="/folio/" onLoad={() => listen(frame.contentDocument)} />;
    };
    scope.own(editor.registry.register({ type: "folio-application-block", capabilities: ["opaque-widget"], view: Reader }, scope.owner));
    scope.own(editor.commandRegistry.register({
      id: "folio.open", label: "Open Folio",
      canExecute: ({targetKey}) => editor.node(targetKey)?.viewType === "workspace-block",
      execute: ({targetKey}) => openDesktopWindow(editor, editor.node(targetKey)!.viewId, {id:"folio", name:"Folio"},
        {type:"folio-application-block"}, {w:Math.min(1120, Math.max(280, window.innerWidth - 32)), h:Math.min(760, Math.max(240, window.innerHeight - 112))}),
    }, scope.owner));
  }};
}

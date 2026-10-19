import { useEffect, useRef, useState } from "react";
import type { Core, StylesheetJson } from "cytoscape";
import { groupAtlasPairs, type AtlasNetwork } from "../lib/knowledge-atlas";
import { useText } from "./LanguageSwitch";

function createStyles(): StylesheetJson {
  return [
    { selector: "node", style: { label: "data(name)", width: "data(size)", height: "data(size)", "background-color": "data(color)", color: "#e6edf5", "font-size": 11, "min-zoomed-font-size": 8, "text-valign": "bottom", "text-margin-y": 5, "text-outline-color": "#111c2d", "text-outline-width": 2, "text-wrap": "ellipsis", "text-max-width": "140px" } },
    { selector: "edge", style: { width: 0.7, "line-color": "#698a9c", opacity: 0.3, "curve-style": "straight", label: "data(label)", "font-size": 10, color: "#dce5f2", "text-outline-color": "#111c2d", "text-outline-width": 2 } },
    { selector: "edge[?expired]", style: { "line-style": "dashed", opacity: 0.15 } },
    { selector: "node[?hub]", style: { "font-size": 22, "min-zoomed-font-size": 0, "font-weight": "bold", color: "#f3f6ff" } },
    { selector: ".chosen", style: { "background-color": "#fff1af", "border-width": 3, "border-color": "#ffffff", "font-size": 16, "font-weight": "bold", "z-index": 10 } },
    { selector: "edge:selected", style: { width: 3, "line-color": "#fff1af", opacity: 1 } },
    { selector: "edge.traversed-edge", style: { width: 4, "line-color": "#ffe28c", opacity: 1, "z-index": 100, "line-cap": "round" } },
  ];
}

function readableLabels(instance: Core, dense: boolean) {
  const zoom = instance.zoom();
  instance.nodes().style({ "font-size": 11 / zoom, "text-margin-y": 4 / zoom, "text-outline-width": 1.6 / zoom, "text-max-width": `${120 / zoom}px`, "min-zoomed-font-size": dense && zoom < 1.1 ? 1000 : 0 });
  instance.nodes("[?hub], .chosen, .hovered").style({ "font-size": 13 / zoom, "min-zoomed-font-size": 0 });
  instance.edges().not(".traversed-edge").style("width", Math.min(16, 0.55 / zoom));
  instance.edges(".traversed-edge").style("width", Math.min(20, 4 / zoom));
}

export function KnowledgeAtlasCanvas({ network, selectedKey, activePairKey, homeKey, onNode, onPair }: {
  network: AtlasNetwork; selectedKey: string | null; activePairKey?: string | null; homeKey?: string | null;
  onNode: (key: string) => void; onPair: (key: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const cy = useRef<Core | null>(null);
  const callbacks = useRef({ onNode, onPair });
  callbacks.current = { onNode, onPair };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const t = useText();
  const focused = useRef<string | null>(null);
  const desiredFocus = useRef(selectedKey);
  desiredFocus.current = selectedKey;

  // Only camera movements respond to focus. New data never triggers another pan.
  const centerOnce = (instance: Core, key: string, animated: boolean) => {
    const target = instance.getElementById(key);
    if (!target.length || focused.current === key) return;
    instance.nodes().removeClass("chosen");
    target.addClass("chosen");
    instance.stop();
    if (animated) instance.animate({ center: { eles: target }, duration: 320, easing: "ease-in-out" });
    else instance.center(target);
    focused.current = key;
  };

  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import("cytoscape").then(({ default: cytoscape }) => {
      if (disposed || !container.current) return;
      const instance = cytoscape({
        container: container.current, style: createStyles(), pixelRatio: 1,
        minZoom: 0.2, maxZoom: 5, wheelSensitivity: 0.2,
        elements: [], layout: { name: "preset" },
      });
      cy.current = instance;
      instance.on("zoom", () => readableLabels(instance, false));
      instance.on("mouseover", "node", e => { e.target.addClass("hovered"); readableLabels(instance, false); });
      instance.on("mouseout", "node", e => { e.target.removeClass("hovered"); readableLabels(instance, false); });
      instance.on("tap", "node", e => callbacks.current.onNode(e.target.id()));
      instance.on("tap", "edge", e => callbacks.current.onPair(e.target.id()));
      resize = new ResizeObserver(() => instance.resize());
      resize.observe(container.current);
      setReady(true);
    }).catch(() => { if (!disposed) setFailed(true); });
    return () => {
      disposed = true;
      resize?.disconnect();
      cy.current?.destroy();
      cy.current = null;
    };
  }, []);

  // Incrementally add only genuinely new graph elements. No layout reruns,
  // coordinate assignments to old nodes, zoom resets or unnecessary camera moves.
  useEffect(() => {
    const instance = cy.current;
    if (!instance || !ready) return;
    const firstLoad = instance.nodes().length === 0;
    const existing = new Set(instance.nodes().map(n => n.id()));
    const newcomers = network.nodes.filter(n => !existing.has(n.key));
    const selected = desiredFocus.current;
    const active = selected ? instance.getElementById(selected) : null;
    const center = active?.length ? active.position() : {
      x: (instance.width() / 2 - instance.pan().x) / instance.zoom(),
      y: (instance.height() / 2 - instance.pan().y) / instance.zoom(),
    };
    const rootIsNew = !!selected && newcomers.some(n => n.key === selected);
    const root = rootIsNew ? (firstLoad ? { x: 0, y: 0 } : { x: center.x + 230, y: center.y }) : center;
    const ordered = [...newcomers.filter(n => n.key === selected), ...newcomers.filter(n => n.key !== selected)];
    const pairs = groupAtlasPairs(network.links);
    const incomingKeys = new Set(network.nodes.map(n => n.key));
    const incomingPairs = new Set(pairs.map(p => p.key));
    const obsoleteNodes = instance.nodes().filter(n => !incomingKeys.has(n.id()));
    const obsoletePairs = instance.edges().filter(e => !incomingPairs.has(e.id()));
    const newPairs = pairs.filter(p => !instance.getElementById(p.key).length);
    if (!ordered.length && !newPairs.length && !obsoleteNodes.length && !obsoletePairs.length &&
        !pairs.some(p => {
          const edge = instance.getElementById(p.key);
          return edge.data("count") !== p.links.length ||
            edge.data("expired") !== p.links.every(l => !!l.invalidAt);
        })) return;
    instance.batch(() => {
      // Temporal rewinds remove future facts without rebuilding Cytoscape or
      // moving the retained nodes. Ordinary Atlas expansion stays additive.
      obsoletePairs.remove();
      obsoleteNodes.remove();
      let index = 0;
      for (const n of ordered) {
        const isRoot = rootIsNew && n.key === selected;
        const theta = -Math.PI / 2 + index * Math.PI * (3 - Math.sqrt(5));
        const radius = 140 + Math.sqrt(index) * 47;
        const position = isRoot ? root : {
          x: root.x + Math.cos(theta) * radius,
          y: root.y + Math.sin(theta) * radius,
        };
        if (!isRoot) index += 1;
        instance.add({ group: "nodes", data: {
          id: n.key, name: n.name, size: Math.min(35, 14 + Math.sqrt(n.degree) * 3),
          color: n.degree >= 8 ? "#8baff8" : "#69d8c2",
        }, position });
      }
      for (const pair of pairs) {
        const existingEdge = instance.getElementById(pair.key);
        const count = pair.links.length;
        if (existingEdge.length) {
          existingEdge.data({ count, label: count > 1 ? String(count) : "",
            expired: pair.links.every(l => !!l.invalidAt) });
        } else if (instance.getElementById(pair.a).length && instance.getElementById(pair.b).length) {
          instance.add({ group: "edges", data: {
            id: pair.key, source: pair.a, target: pair.b, count,
            label: count > 1 ? String(count) : "",
            expired: pair.links.every(l => !!l.invalidAt),
          } });
        }
      }
    });
    if (firstLoad) instance.fit(undefined, 45);
    if (selected) centerOnce(instance, selected, !firstLoad);
    readableLabels(instance, false);
  }, [network, ready]);

  // The selected entity might already be drawn when it is clicked. In that
  // case pan exactly once, immediately; the later API response only adds nodes.
  useEffect(() => {
    const instance = cy.current;
    if (!ready || !instance || !selectedKey) return;
    centerOnce(instance, selectedKey, focused.current !== null);
  }, [selectedKey, ready]);
  // Highlight one visible pair. The underlying directed facts remain separate.
  useEffect(() => {
    const instance = cy.current;
    if (!ready || !instance) return;
    instance.edges(".traversed-edge").removeClass("traversed-edge");
    if (activePairKey) {
      const edge = instance.getElementById(activePairKey);
      if (edge.length) edge.addClass("traversed-edge");
    }
    readableLabels(instance, false);
  }, [activePairKey, network, ready]);

  const returnHome = () => {
    if (!homeKey) return;
    if (selectedKey !== homeKey) {
      // Focus change is handled by the existing single-pan effect.
      callbacks.current.onNode(homeKey);
      return;
    }
    // Even when already selected, the user may have dragged the viewport away.
    // Recenter only the camera; preserve zoom, node coordinates and graph state.
    const instance = cy.current;
    const target = instance?.getElementById(homeKey);
    if (!instance || !target?.length) return;
    instance.stop();
    instance.animate({ center: { eles: target }, duration: 320, easing: "ease-in-out" });
  };
  const zoom = (factor: number) => { const instance = cy.current; if (instance) instance.zoom({ level: instance.zoom() * factor, renderedPosition: { x: instance.width() / 2, y: instance.height() / 2 } }); };
  return <div className="lr-atlas-map">
    <div ref={container} className="lr-atlas-canvas" role="img" aria-label={t(`知识网络：${network.nodes.length} 个实体，${network.links.length} 条关系；可通过实体目录进行键盘探索`, `Knowledge network: ${network.nodes.length} entities, ${network.links.length} relations; use the entity directory for keyboard exploration`)} />
    {!ready && <div className="lr-atlas-loading" role="status">{failed ? t("绘图未能加载，请使用右侧实体目录或刷新重试。", "Map could not load. Use the entity directory or reload.") : t("正在展开知识网络…", "Opening the knowledge network…")}</div>}
    <div className="lr-atlas-zoom">
      <button type="button" aria-label={t("放大图谱", "Zoom in")} onClick={() => zoom(1.5)}>+</button>
      <button type="button" aria-label={t("缩小图谱", "Zoom out")} onClick={() => zoom(1 / 1.5)}>−</button>
      <button type="button" onClick={() => cy.current?.fit(undefined, 35)}>{t("适应画布", "Fit graph")}</button>
      {homeKey && <button type="button" data-testid="atlas-home" onClick={returnHome} aria-label={t("回到档案实体", "Recenter profile entity")} title={t("回到档案实体中心", "Return to the profile entity center")}>{t("回到本实体", "Profile center")} ⌖</button>}
    </div>
    <div className="lr-atlas-map-note">{t("拖动画布 · 滚轮或双指缩放 · 点击节点探索", "Drag to pan · Scroll or pinch to zoom · Select a node")}</div>
  </div>;
}
